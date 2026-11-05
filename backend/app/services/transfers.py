from datetime import UTC, datetime
from typing import Any

import duckdb

from app.core.exceptions import NotFoundError, ServiceUnavailableError
from app.database.query import row_dicts, scalar

STALE_DAYS = 120
MIN_MINUTES_FOR_FLAG = 450
NOTE = ("Model estimate of the next recorded market value. It is not a real transfer fee, and values come "
        "from a third-party Transfermarkt dataset.")
ACTIVE = "(SELECT model_version FROM model_registry WHERE model_type = 'transfer' AND is_active LIMIT 1)"
BASE = f"""
    WITH latest AS (
        SELECT * FROM player_statistics WHERE source_id = 'fpl'
        QUALIFY row_number() OVER (PARTITION BY player_id ORDER BY observation_date DESC) = 1
    )
    SELECT t.player_id, p.name, date_diff('year', p.date_of_birth, current_date) AS age,
           p.current_team_id AS team_id, tm.name AS team, tm.short_name AS team_short, tm.tla,
           pr.position_group, pr.role, l.minutes, l.goals, l.assists, l.xg, l.xa,
           t.actual_eur, t.predicted_eur, t.low_eur, t.high_eur, t.valuation_date, t.model_version,
           t.predicted_eur - t.actual_eur AS gap_eur,
           (t.predicted_eur - t.actual_eur) / t.actual_eur * 100 AS gap_pct,
           date_diff('day', t.valuation_date, current_date) AS valuation_age_days
    FROM transfer_predictions t
    JOIN players p USING (player_id)
    LEFT JOIN teams tm ON tm.team_id = p.current_team_id
    LEFT JOIN latest l USING (player_id)
    LEFT JOIN (SELECT * FROM player_profiles WHERE model_version =
        (SELECT model_version FROM model_registry WHERE model_type = 'similarity' AND is_active LIMIT 1)) pr
        USING (player_id)
    WHERE t.model_version = {ACTIVE} AND p.current_team_id IS NOT NULL
"""
SORTS = {"gap_pct": "gap_pct", "gap_eur": "gap_eur", "actual": "t.actual_eur", "predicted": "t.predicted_eur",
         "age": "age", "name": "p.name", "minutes": "l.minutes"}


def classify(row: dict[str, Any]) -> str:
    """A positive gap is not enough: the low end must clear the value, on a real sample."""
    if (row.get("minutes") or 0) < MIN_MINUTES_FOR_FLAG:
        return "small_sample"
    if row["low_eur"] > row["actual_eur"]:
        return "model_undervalued"
    if row["high_eur"] < row["actual_eur"]:
        return "model_overvalued"
    return "within_uncertainty"


def _decorate(row: dict[str, Any]) -> dict[str, Any]:
    row["assessment"] = classify(row)
    row["stale_valuation"] = (row["valuation_age_days"] or 0) > STALE_DAYS
    return row


def _filters(q, group, team, age_max, min_minutes, min_gap_pct) -> tuple[str, list[Any]]:
    where, params = [], []
    if q:
        where.append("strip_accents(lower(p.name)) LIKE '%' || strip_accents(lower(?)) || '%'")
        params.append(q)
    if group:
        where.append("pr.position_group = ?")
        params.append(group)
    if team:
        where.append("p.current_team_id = ?")
        params.append(team)
    if age_max is not None:
        where.append("date_diff('year', p.date_of_birth, current_date) <= ?")
        params.append(age_max)
    if min_minutes:
        where.append("l.minutes >= ?")
        params.append(min_minutes)
    if min_gap_pct is not None:
        where.append("(t.predicted_eur - t.actual_eur) / t.actual_eur * 100 >= ?")
        params.append(min_gap_pct)
    return "".join(f" AND {w}" for w in where), params


def require_model(con: duckdb.DuckDBPyConnection) -> None:
    if not scalar(con, f"SELECT {ACTIVE}"):
        raise ServiceUnavailableError("No trained valuation model is available yet")


def list_values(
    con: duckdb.DuckDBPyConnection, *, q=None, group=None, team=None, age_max=None, min_minutes=0,
    min_gap_pct=None, sort="gap_pct", direction="desc", limit=50, offset=0,
) -> dict[str, Any]:
    require_model(con)
    clause, params = _filters(q, group, team, age_max, min_minutes, min_gap_pct)
    total = scalar(con, f"SELECT count(*) FROM ({BASE}{clause})", params)
    rows = row_dicts(
        con, f"{BASE}{clause} ORDER BY {SORTS[sort]} {direction} NULLS LAST, t.player_id LIMIT ? OFFSET ?",
        [*params, limit, offset],
    )
    return {"items": [_decorate(r) for r in rows], "total": total, "limit": limit, "offset": offset,
            "note": NOTE, "minimum_minutes_for_flag": MIN_MINUTES_FOR_FLAG}


def undervalued(
    con: duckdb.DuckDBPyConnection, *, group=None, team=None, age_max=None, min_minutes=450, limit=25,
) -> dict[str, Any]:
    require_model(con)
    clause, params = _filters(None, group, team, age_max, min_minutes, None)
    rows = row_dicts(
        con, f"{BASE}{clause} AND t.low_eur > t.actual_eur ORDER BY gap_pct DESC LIMIT ?", [*params, limit],
    )
    return {"items": [_decorate(r) for r in rows], "note": NOTE,
            "rule": "Listed only when the low end of the model's range is above the recorded value.",
            "as_of": datetime.now(UTC)}


def valuation_detail(con: duckdb.DuckDBPyConnection, player_id: str) -> dict[str, Any]:
    rows = row_dicts(con, BASE + " AND t.player_id = ?", [player_id])
    history = row_dicts(
        con, """SELECT valuation_date, value_eur, club_name FROM player_market_values
                WHERE player_id = ? ORDER BY valuation_date""", [player_id])
    if not rows and not history:
        raise NotFoundError("No valuation for this player")
    return {"estimate": _decorate(rows[0]) if rows else None, "history": history, "note": NOTE}
