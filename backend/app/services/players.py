import json
from collections import defaultdict
from typing import Any

import duckdb
import numpy as np

from app.core.exceptions import NotFoundError
from app.database.query import row_dicts, scalar
from app.features.squads import full_squads, likely_squad
from app.models.similarity.engine import (
    GROUP_NAMES,
    LABELS,
    RADAR,
    STATS,
    similarity_score,
)

ACTIVE = "(SELECT model_version FROM model_registry WHERE model_type = 'similarity' AND is_active LIMIT 1)"
BASE_SQL = f"""
    WITH latest AS (
        SELECT * FROM player_statistics WHERE source_id = 'fpl'
        QUALIFY row_number() OVER (PARTITION BY player_id ORDER BY observation_date DESC) = 1
    ), value AS (
        SELECT player_id, value_eur, valuation_date FROM player_market_values
        QUALIFY row_number() OVER (PARTITION BY player_id ORDER BY valuation_date DESC) = 1
    )
    SELECT p.player_id, p.name, p.date_of_birth, date_diff('year', p.date_of_birth, current_date) AS age,
           p.position, p.sub_position, p.foot, p.height_cm, p.nationality, p.current_team_id AS team_id,
           t.name AS team, t.short_name AS team_short, t.tla, p.availability, p.chance_next_round,
           l.minutes, l.goals, l.assists, l.xg, l.xa, l.fpl_price, l.starts,
           v.value_eur AS market_value_eur, v.valuation_date,
           pr.position_group, pr.role
    FROM players p
    JOIN latest l USING (player_id)
    LEFT JOIN teams t ON t.team_id = p.current_team_id
    LEFT JOIN value v USING (player_id)
    LEFT JOIN player_profiles pr ON pr.player_id = p.player_id AND pr.model_version = {ACTIVE}
    WHERE p.current_team_id IS NOT NULL
"""
def team_news(con: duckdb.DuckDBPyConnection) -> dict[str, list[dict[str, Any]]]:
    """Likely starters FPL flags as doubtful or out. 'u' means the player has left the club."""
    regulars = {p.player_id for squad in full_squads(con).values() for p in likely_squad(squad)}
    rows = row_dicts(
        con,
        """SELECT p.current_team_id AS team_id, p.player_id, p.name, p.availability, p.chance_next_round,
                  (SELECT news FROM injury_records i WHERE i.player_id = p.player_id
                   ORDER BY news_added DESC NULLS LAST LIMIT 1) AS news
           FROM players p
           WHERE p.current_team_id IS NOT NULL AND p.availability NOT IN ('a', 'u')
           ORDER BY p.name""",
    )
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["player_id"] in regulars:
            out[row.pop("team_id")].append(row)
    return out


SORTS = {"minutes": "l.minutes", "name": "p.name", "age": "age", "xg": "l.xg",
         "value": "v.value_eur", "goals": "l.goals"}


def search_players(
    con: duckdb.DuckDBPyConnection, *, q: str | None, group: str | None, team: str | None,
    age_min: int | None, age_max: int | None, min_minutes: int, sort: str, limit: int, offset: int,
) -> dict[str, Any]:
    where: list[str] = []
    params: list[Any] = []
    if q:
        # strip_accents lets "odegaard" find the accented spelling.
        where.append("strip_accents(lower(p.name)) LIKE '%' || strip_accents(lower(?)) || '%'")
        params.append(q)
    if group:
        where.append("pr.position_group = ?")
        params.append(group)
    if team:
        where.append("p.current_team_id = ?")
        params.append(team)
    if age_min is not None:
        where.append("date_diff('year', p.date_of_birth, current_date) >= ?")
        params.append(age_min)
    if age_max is not None:
        where.append("date_diff('year', p.date_of_birth, current_date) <= ?")
        params.append(age_max)
    if min_minutes:
        where.append("l.minutes >= ?")
        params.append(min_minutes)
    clause = "".join(f" AND {w}" for w in where)
    total = scalar(con, f"SELECT count(*) FROM ({BASE_SQL}{clause})", params)
    direction = "ASC" if sort == "name" else "DESC"
    rows = row_dicts(
        con, f"{BASE_SQL}{clause} ORDER BY {SORTS[sort]} {direction} NULLS LAST, p.player_id LIMIT ? OFFSET ?",
        [*params, limit, offset],
    )
    return {"items": rows, "total": total, "limit": limit, "offset": offset}


def _profile(con: duckdb.DuckDBPyConnection, player_id: str) -> dict[str, Any] | None:
    rows = row_dicts(
        con,
        f"""SELECT position_group, role, minutes, per90, percentiles, zscores FROM player_profiles
            WHERE player_id = ? AND model_version = {ACTIVE}""",
        [player_id],
    )
    if not rows:
        return None
    r = rows[0]
    per90, pct = json.loads(r["per90"]), json.loads(r["percentiles"])
    radar = [{"stat": s, "label": LABELS[s], "percentile": pct[s], "per90": per90[s]}
             for s in RADAR[r["position_group"]]]
    return {"position_group": r["position_group"], "position_name": GROUP_NAMES[r["position_group"]],
            "role": r["role"], "weighted_minutes": r["minutes"], "per90": per90, "percentiles": pct,
            "radar": radar, "_z": json.loads(r["zscores"])}


def player_detail(con: duckdb.DuckDBPyConnection, player_id: str) -> dict[str, Any]:
    rows = row_dicts(con, BASE_SQL + " AND p.player_id = ?", [player_id])
    if not rows:
        raise NotFoundError("Player not found")
    profile = _profile(con, player_id)
    if profile:
        profile.pop("_z")
    news = row_dicts(
        con, """SELECT status, news, news_added FROM injury_records WHERE player_id = ?
                ORDER BY news_added DESC NULLS LAST LIMIT 3""", [player_id])
    return {**rows[0], "profile": profile, "news": news,
            "profile_note": None if profile else "Not enough minutes for a statistical profile yet."}


def player_statistics(con: duckdb.DuckDBPyConnection, player_id: str) -> dict[str, Any]:
    if not scalar(con, "SELECT 1 FROM players WHERE player_id = ?", [player_id]):
        raise NotFoundError("Player not found")
    seasons = row_dicts(
        con,
        """SELECT season_id, source_id, observation_date, minutes, goals, assists, xg, xa, tackles, cbi,
                  recoveries, saves, yellow_cards, red_cards, clean_sheets, bps
           FROM player_statistics WHERE player_id = ?
           QUALIFY row_number() OVER (PARTITION BY season_id ORDER BY observation_date DESC) = 1
           ORDER BY season_id DESC""",
        [player_id],
    )
    return {"player_id": player_id, "seasons": seasons,
            "source_note": "From FPL. Observed statistics, not estimates."}


def similar_players(
    con: duckdb.DuckDBPyConnection, player_id: str, *, limit: int, group: str | None, team: str | None,
    age_max: int | None, exclude_team: bool,
) -> dict[str, Any]:
    target = _profile(con, player_id)
    if target is None:
        if not scalar(con, "SELECT 1 FROM players WHERE player_id = ?", [player_id]):
            raise NotFoundError("Player not found")
        return {"player_id": player_id, "items": [],
                "note": "This player has too few minutes for a reliable comparison."}
    rows = row_dicts(
        con,
        f"""SELECT s.similar_player_id, s.score, s.rank FROM player_similarity_results s
            WHERE s.player_id = ? AND s.model_version = {ACTIVE} ORDER BY s.rank""",
        [player_id],
    )
    ids = [r["similar_player_id"] for r in rows]
    people = {r["player_id"]: r for r in row_dicts(
        con, BASE_SQL + " AND p.player_id IN (SELECT unnest(?))", [ids])}
    me = row_dicts(con, BASE_SQL + " AND p.player_id = ?", [player_id])[0]
    items = []
    for r in rows:
        person = people.get(r["similar_player_id"])
        if person is None or (group and person["position_group"] != group):
            continue
        if (team and person["team_id"] != team) or (age_max and (person["age"] or 99) > age_max):
            continue
        if exclude_team and person["team_id"] == me["team_id"]:
            continue
        other = _profile(con, person["player_id"])
        if other is None:
            continue
        items.append({**person, "similarity_score": r["score"], **explain(target, other)})
        if len(items) >= limit:
            break
    return {"player_id": player_id, "items": items, "player": me,
            "score_note": "Likeness of statistical style from 0 to 100. Not a probability."}


def explain(a: dict[str, Any], b: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Where two players overlap and where they part ways, in plain statistics."""
    shared, gaps = [], []
    for stat in RADAR[a["position_group"]]:
        za, zb = a["_z"][stat], b["_z"][stat]
        row = {"stat": stat, "label": LABELS[stat], "a_per90": a["per90"][stat], "b_per90": b["per90"][stat]}
        if za > 0.3 and zb > 0.3:
            shared.append(row)
        gaps.append((abs(za - zb), row))
    gaps.sort(key=lambda g: g[0], reverse=True)
    return {"shared_strengths": shared, "main_differences": [g[1] for g in gaps[:3] if g[0] > 0.4]}


def compare_players(con: duckdb.DuckDBPyConnection, a_id: str, b_id: str) -> dict[str, Any]:
    a, b = player_detail(con, a_id), player_detail(con, b_id)
    pa, pb = _profile(con, a_id), _profile(con, b_id)
    score, explanation = None, None
    keepers = {pa["position_group"], pb["position_group"]} & {"GK"} if pa and pb else set()
    if pa and pb and (not keepers or pa["position_group"] == pb["position_group"]):
        score = similarity_score(
            np.array([pa["_z"][s] for s in STATS]), np.array([pb["_z"][s] for s in STATS]),
            pa["position_group"],
        )
        explanation = explain(pa, pb)
    return {"a": a, "b": b, "similarity_score": score, "explanation": explanation,
            "note": None if score is not None else "These two cannot be compared on one scale."}
