"""Polite HTTP: per-host throttle, backoff, 429 handling, conditional GET, cache fallback."""

import threading
import time
from urllib.parse import urlsplit

import httpx

from app.config import get_settings
from app.core.exceptions import SourceUnavailableError
from app.core.logging import log
from app.data.cache import Snapshot, SnapshotCache

RETRYABLE = {429, 500, 502, 503, 504}


class Fetcher:
    def __init__(
        self, cache: SnapshotCache, min_interval: float = 1.0, max_attempts: int = 4,
        backoff_base: float = 2.0, client: httpx.Client | None = None,
    ):
        settings = get_settings()
        self.cache = cache
        self.min_interval = min_interval
        self.max_attempts = max_attempts
        self.backoff_base = backoff_base
        self.client = client or httpx.Client(
            follow_redirects=True,
            timeout=settings.http_timeout_seconds,
            headers={"User-Agent": settings.user_agent},
        )
        self._last_call: dict[str, float] = {}
        self._lock = threading.Lock()

    def _throttle(self, url: str) -> None:
        host = urlsplit(url).netloc
        with self._lock:
            wait = self.min_interval - (time.monotonic() - self._last_call.get(host, 0))
            if wait > 0:
                time.sleep(wait)
            self._last_call[host] = time.monotonic()

    def _get(self, url: str, headers: dict[str, str]) -> httpx.Response:
        last_error: Exception | None = None
        for attempt in range(self.max_attempts):
            self._throttle(url)
            try:
                response = self.client.get(url, headers=headers)
            except httpx.HTTPError as exc:
                last_error = exc
                time.sleep(self.backoff_base**attempt)
                continue
            if response.status_code not in RETRYABLE:
                return response
            last_error = httpx.HTTPStatusError(
                f"HTTP {response.status_code}", request=response.request, response=response
            )
            retry_after = response.headers.get("Retry-After", "")
            delay = float(retry_after) if retry_after.isdigit() else self.backoff_base**attempt
            log.warning("http_retry", host=urlsplit(url).netloc,
                        status=response.status_code, delay=delay)
            time.sleep(min(delay, 90))
        raise last_error or RuntimeError("request failed")

    def fetch(
        self, source_id: str, key: str, url: str, headers: dict[str, str] | None = None
    ) -> Snapshot:
        """Return a fresh snapshot, or the last good one flagged from_cache."""
        cached = self.cache.get(source_id, key)
        request_headers = dict(headers or {})
        if cached and cached.etag:
            request_headers["If-None-Match"] = cached.etag
        if cached and cached.last_modified:
            request_headers["If-Modified-Since"] = cached.last_modified
        try:
            response = self._get(url, request_headers)
            if response.status_code == 304 and cached:
                return self.cache.touch(cached)
            response.raise_for_status()
            return self.cache.put(
                source_id, key, response.content,
                etag=response.headers.get("ETag"),
                last_modified=response.headers.get("Last-Modified"),
            )
        except (httpx.HTTPError, OSError) as exc:
            # Never put the URL in the message: it can carry auth details on other sources.
            message = f"{type(exc).__name__}: {str(exc).split(' for url')[0][:200]}"
            if cached:
                log.warning("fetch_failed_using_cache", source=source_id, key=key, error=message)
                return Snapshot(cached.source_id, cached.key, cached.path, cached.sha256,
                                cached.retrieved_at, cached.etag, cached.last_modified,
                                from_cache=True, error=message)
            raise SourceUnavailableError(message) from exc
