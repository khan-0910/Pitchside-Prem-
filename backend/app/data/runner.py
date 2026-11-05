"""Runs one source end to end and records everything that happened."""

import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import duckdb

from app.config import get_settings
from app.core.exceptions import SourceUnavailableError
from app.core.logging import log
from app.data.cache import SnapshotCache
from app.data.http import Fetcher
from app.data.loaders.base import Loader
from app.data.loaders.football_data_org import FootballDataOrgLoader
from app.data.loaders.football_data_uk import FootballDataUkLoader
from app.data.loaders.fpl import FplHistoryLoader, FplLoader
from app.data.loaders.transfermarkt import TransfermarktLoader
from app.data.loaders.understat import UnderstatLoader
from app.data.matching.teams import seed_teams
from app.database.connection import write_lock


@dataclass
class RunReport:
    source_id: str
    status: str  # ok, unchanged, cached, failed, unavailable
    records: int = 0
    error: str | None = None


def build_loaders(fetcher: Fetcher | None = None) -> list[Loader]:
    settings = get_settings()
    cache = SnapshotCache(settings.cache_dir)
    polite = fetcher or Fetcher(cache, min_interval=1.0)
    # Order matters: CSV history first, FPL creates players, Transfermarkt links to them.
    return [
        FootballDataUkLoader(polite),
        FplLoader(polite),
        FplHistoryLoader(fetcher or Fetcher(cache, min_interval=0.25)),
        # Free tier is 10 requests per minute.
        FootballDataOrgLoader(fetcher or Fetcher(cache, min_interval=6.5)),
        TransfermarktLoader(polite),
        UnderstatLoader(polite),
    ]


def register_sources(con: duckdb.DuckDBPyConnection, loaders: list[Loader]) -> None:
    for x in loaders:
        con.execute(
            """INSERT INTO source_registry
               (source_id, name, description, requires_key, ttl_seconds, stale_after_seconds)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT (source_id) DO UPDATE SET
                 name = excluded.name, description = excluded.description,
                 ttl_seconds = excluded.ttl_seconds,
                 stale_after_seconds = excluded.stale_after_seconds""",
            [x.source_id, x.name, x.description, x.requires_key,
             int(x.ttl_hours * 3600), int(x.stale_after_hours * 3600)],
        )


def run_source(con: duckdb.DuckDBPyConnection, loader: Loader) -> RunReport:
    with write_lock:
        return _run(con, loader)


def _finish(con, run_id: str, started, source_id: str, status: str, from_cache: bool,
            records: int, error: str | None) -> None:
    con.execute(
        "INSERT INTO ingestion_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [run_id, source_id, started, datetime.now(UTC), status, from_cache, records, error],
    )
    if error:
        con.execute(
            "INSERT INTO ingestion_errors (run_id, source_id, stage, message) VALUES (?, ?, ?, ?)",
            [run_id, source_id, status, error],
        )


def _run(con: duckdb.DuckDBPyConnection, loader: Loader) -> RunReport:
    run_id = uuid.uuid4().hex
    started = datetime.now(UTC)
    sid = loader.source_id
    con.execute("UPDATE source_registry SET last_attempt_at = ? WHERE source_id = ?", [started, sid])

    def failed(status: str, message: str) -> RunReport:
        con.execute(
            "UPDATE source_registry SET last_attempt_ok = FALSE, last_error = ? WHERE source_id = ?",
            [message, sid],
        )
        _finish(con, run_id, started, sid, status, False, 0, message)
        log.warning("source_failed", source=sid, status=status, error=message)
        return RunReport(sid, status, error=message)

    reason = loader.unavailable_reason()
    if reason:
        return failed("unavailable", reason)
    try:
        snapshots = loader.fetch()
    except SourceUnavailableError as exc:
        return failed("unavailable", str(exc))
    except Exception as exc:  # noqa: BLE001 - one source must never take the app down
        return failed("failed", f"{type(exc).__name__}: {str(exc)[:300]}")
    if not snapshots:
        return failed("unavailable", "provider returned nothing")

    from_cache = any(s.from_cache for s in snapshots)
    fetch_error = next((s.error for s in snapshots if s.error), None)
    digest = hashlib.sha256("".join(sorted(s.sha256 for s in snapshots)).encode()).hexdigest()
    previous = con.execute(
        "SELECT snapshot_hash, records FROM source_registry WHERE source_id = ?", [sid]
    ).fetchone()
    newest = max(s.retrieved_at for s in snapshots)

    if previous and previous[0] == digest:
        # Same bytes as last load: nothing to do, but the provider did answer.
        if from_cache:
            con.execute(
                """UPDATE source_registry SET last_attempt_ok = FALSE, last_error = ?
                   WHERE source_id = ?""", [fetch_error, sid])
        else:
            con.execute(
                """UPDATE source_registry SET last_attempt_ok = TRUE, last_error = NULL,
                   last_success_at = ? WHERE source_id = ?""", [newest, sid])
        status = "cached" if from_cache else "unchanged"
        _finish(con, run_id, started, sid, status, from_cache, previous[1] or 0, fetch_error)
        return RunReport(sid, status, previous[1] or 0, fetch_error)

    # All writes for one source land together or not at all.
    con.execute("BEGIN")
    try:
        result = loader.load(con, snapshots)
        con.execute("COMMIT")
    except Exception as exc:  # noqa: BLE001 - keep the last good data on a bad payload
        con.execute("ROLLBACK")
        return failed("failed", f"{type(exc).__name__}: {str(exc)[:300]}")

    con.execute(
        """UPDATE source_registry SET last_attempt_ok = ?, last_error = ?, last_success_at = ?,
           records = ?, coverage = ?, upstream_updated_at = ?, data_as_of = ?, snapshot_hash = ?
           WHERE source_id = ?""",
        [not from_cache, fetch_error, newest, result.records, result.coverage,
         result.upstream_updated_at, result.data_as_of, digest, sid],
    )
    for name, passed, detail in result.checks:
        con.execute(
            """INSERT INTO data_quality_checks (run_id, source_id, check_name, passed, detail)
               VALUES (?, ?, ?, ?, ?)""", [run_id, sid, name, passed, detail])
    _finish(con, run_id, started, sid, "cached" if from_cache else "ok", from_cache,
            result.records, fetch_error)
    log.info("source_loaded", source=sid, records=result.records, from_cache=from_cache)
    return RunReport(sid, "cached" if from_cache else "ok", result.records, fetch_error)


def run_all(con: duckdb.DuckDBPyConnection, only: list[str] | None = None) -> list[RunReport]:
    loaders = build_loaders()
    seed_teams(con)
    register_sources(con, loaders)
    return [run_source(con, x) for x in loaders if not only or x.source_id in only]
