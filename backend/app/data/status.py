from datetime import datetime
from enum import StrEnum


class SourceStatus(StrEnum):
    LIVE = "LIVE"
    CACHED = "CACHED"
    STALE = "STALE"
    UNAVAILABLE = "UNAVAILABLE"


def derive_status(
    *, has_data: bool, last_success_at: datetime | None, last_attempt_ok: bool | None,
    upstream_updated_at: datetime | None, ttl_seconds: int, stale_after_seconds: int,
    now: datetime,
) -> SourceStatus:
    """LIVE only when the newest attempt reached the provider inside the TTL."""
    if not has_data or last_success_at is None:
        return SourceStatus.UNAVAILABLE
    # A successful download of an old dataset is still old data.
    newest = min(last_success_at, upstream_updated_at or last_success_at)
    if (now - newest).total_seconds() > stale_after_seconds:
        return SourceStatus.STALE
    if last_attempt_ok and (now - last_success_at).total_seconds() <= ttl_seconds:
        return SourceStatus.LIVE
    return SourceStatus.CACHED
