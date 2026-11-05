import hmac
import threading
import time
from collections import defaultdict, deque
from collections.abc import Iterator

import duckdb
from fastapi import Depends, Header, HTTPException, Request

from app.config import Settings, get_settings
from app.database.connection import db_cursor


def get_db() -> Iterator[duckdb.DuckDBPyConnection]:
    cursor = db_cursor()
    try:
        yield cursor
    finally:
        cursor.close()


def require_admin(
    x_admin_token: str = Header(default=""), settings: Settings = Depends(get_settings)
) -> None:
    if not settings.admin_token:
        raise HTTPException(403, "Admin routes are disabled: ADMIN_TOKEN is not set")
    if not hmac.compare_digest(x_admin_token, settings.admin_token):
        raise HTTPException(401, "Invalid admin token")


class RateLimit:
    """Sliding window per client. Single-process, which matches one DuckDB writer."""

    def __init__(self, calls: int, seconds: float):
        self.calls, self.seconds = calls, seconds
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.lock = threading.Lock()

    def __call__(self, request: Request) -> None:
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with self.lock:
            hits = self.hits[key]
            while hits and now - hits[0] > self.seconds:
                hits.popleft()
            if len(hits) >= self.calls:
                raise HTTPException(429, "Too many requests, try again shortly")
            hits.append(now)


expensive_limit = RateLimit(calls=12, seconds=60)
