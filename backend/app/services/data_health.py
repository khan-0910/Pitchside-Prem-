from datetime import UTC, datetime
from typing import Any

import duckdb

from app.data.status import derive_status

OPTIONAL = {"understat", "football_data_org"}
NOTES = {
    "transfermarkt": (
        "The dataset's maintainers paused updates in July 2026 and have given no return date. Values stay "
        "frozen until they resume, and the model estimates each player's next value from that last figure."
    ),
    "understat": (
        "Nothing depends on this. Understat's site is down, and team xG comes from football-data.co.uk instead."
    ),
}


def list_sources(
    con: duckdb.DuckDBPyConnection, now: datetime | None = None
) -> list[dict[str, Any]]:
    now = now or datetime.now(UTC)
    rows = con.execute(
        """SELECT source_id, name, description, requires_key, ttl_seconds, stale_after_seconds,
                  last_attempt_at, last_success_at, last_attempt_ok, last_error, records, coverage,
                  upstream_updated_at, data_as_of
           FROM source_registry ORDER BY source_id"""
    ).fetchall()
    out = []
    for r in rows:
        status = derive_status(
            has_data=bool(r[10]), last_success_at=r[7], last_attempt_ok=r[8],
            upstream_updated_at=r[12], ttl_seconds=r[4], stale_after_seconds=r[5], now=now,
        )
        out.append({
            "source_id": r[0], "name": r[1], "description": r[2], "requires_key": r[3],
            "optional": r[0] in OPTIONAL, "note": NOTES.get(r[0]) if status.value != "LIVE" else None,
            "status": status.value, "last_attempt_at": r[6], "last_success_at": r[7],
            "last_error": r[9], "records": r[10] or 0, "coverage": r[11],
            "upstream_updated_at": r[12], "data_as_of": r[13],
        })
    return sorted(out, key=lambda s: (s["optional"], s["source_id"]))


def health_summary(con: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    sources = list_sources(con)
    failed_runs = con.execute(
        """SELECT source_id, finished_at, status, error FROM ingestion_runs
           WHERE status IN ('failed', 'unavailable') ORDER BY finished_at DESC LIMIT 20"""
    ).fetchall()
    checks = con.execute(
        """SELECT source_id, check_name, passed, detail, checked_at FROM data_quality_checks
           QUALIFY row_number() OVER (PARTITION BY source_id, check_name
                                      ORDER BY checked_at DESC) = 1
           ORDER BY passed, source_id, check_name"""
    ).fetchall()
    unresolved = con.execute(
        "SELECT entity_type, count(*) FROM unresolved_entities GROUP BY 1"
    ).fetchall()
    models = con.execute(
        """SELECT model_type, model_version, trained_at FROM model_registry
           WHERE is_active ORDER BY model_type"""
    ).fetchall()
    return {
        "sources": sources,
        "failed_runs": [dict(zip(("source_id", "at", "status", "error"), r, strict=True))
                        for r in failed_runs],
        "quality_checks": [
            dict(zip(("source_id", "check", "passed", "detail", "checked_at"), r, strict=True))
            for r in checks],
        "unresolved_entities": dict(unresolved),
        "models": [dict(zip(("model_type", "model_version", "trained_at"), r, strict=True))
                   for r in models],
    }
