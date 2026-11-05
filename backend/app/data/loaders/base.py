from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime

import duckdb

from app.data.cache import Snapshot
from app.data.http import Fetcher


@dataclass
class LoadResult:
    records: int
    coverage: str
    data_as_of: date | None = None
    upstream_updated_at: datetime | None = None
    checks: list[tuple[str, bool, str]] = field(default_factory=list)


class Loader(ABC):
    source_id: str
    name: str
    description: str
    requires_key = False
    ttl_hours: float = 6
    stale_after_hours: float = 72

    def __init__(self, fetcher: Fetcher):
        self.fetcher = fetcher

    def unavailable_reason(self) -> str | None:
        """Why this source cannot run at all, such as a missing key."""
        return None

    @abstractmethod
    def fetch(self) -> list[Snapshot]: ...

    @abstractmethod
    def load(self, con: duckdb.DuckDBPyConnection, snapshots: list[Snapshot]) -> LoadResult: ...
