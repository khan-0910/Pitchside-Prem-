from typing import Any

import duckdb
from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_db
from app.api.schemas import Page
from app.core.exceptions import NotFoundError
from app.database.query import row_dicts, scalar
from app.services.players import team_news as load_team_news
from app.services.predictions import PREDICTION_SQL, present

router = APIRouter(tags=["matches"])


@router.get("/matches/results", response_model=Page)
def results(
    team: str | None = None,
    season: str | None = None,
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    con: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict[str, Any]:
    where = ["f.status = 'FINISHED'"]
    params: list[Any] = []
    if season:
        where.append("f.season_id = ?")
        params.append(season)
    if team:
        where.append("(f.home_team_id = ? OR f.away_team_id = ?)")
        params += [team, team]
    clause = " WHERE " + " AND ".join(where)
    total = scalar(con, "SELECT count(*) FROM fixtures f" + clause, params)
    rows = row_dicts(
        con, PREDICTION_SQL + clause + " ORDER BY f.match_date DESC, f.fixture_id LIMIT ? OFFSET ?",
        [*params, limit, offset],
    )
    return {"items": [present(r) for r in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/matches/team-news")
def team_news(con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    return load_team_news(con)


@router.get("/matches/teams/{team_id}/form")
def team_form(
    team_id: str, last: int = Query(10, ge=1, le=38),
    con: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict[str, Any]:
    team = row_dicts(con, "SELECT * FROM teams WHERE team_id = ?", [team_id])
    if not team:
        raise NotFoundError("Team not found")
    rows = row_dicts(
        con,
        """SELECT f.fixture_id, f.match_date, f.home_team_id = ? AS is_home,
                  CASE WHEN f.home_team_id = ? THEN a.short_name ELSE h.short_name END AS opponent,
                  CASE WHEN f.home_team_id = ? THEN r.home_goals ELSE r.away_goals END AS goals_for,
                  CASE WHEN f.home_team_id = ? THEN r.away_goals ELSE r.home_goals END AS goals_against
           FROM fixtures f JOIN v_match_results r USING (fixture_id)
           JOIN teams h ON h.team_id = f.home_team_id JOIN teams a ON a.team_id = f.away_team_id
           WHERE f.home_team_id = ? OR f.away_team_id = ?
           ORDER BY f.match_date DESC LIMIT ?""",
        [team_id] * 6 + [last],
    )
    for r in rows:
        r["result"] = ("W" if r["goals_for"] > r["goals_against"]
                       else "L" if r["goals_for"] < r["goals_against"] else "D")
    points = sum(3 if r["result"] == "W" else r["result"] == "D" for r in rows)
    return {"team": team[0], "matches": rows, "points": points}


@router.get("/teams")
def teams(con: duckdb.DuckDBPyConnection = Depends(get_db)) -> list[dict[str, Any]]:
    """Clubs in the current season."""
    return row_dicts(
        con,
        """SELECT DISTINCT t.team_id, t.name, t.short_name, t.tla FROM teams t
           JOIN fixtures f ON f.home_team_id = t.team_id
           WHERE f.season_id = (SELECT max(season_id) FROM fixtures) ORDER BY t.name""",
    )


@router.get("/standings")
def standings(con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    """Official table when football-data.org is connected, otherwise derived from results."""
    rows = row_dicts(
        con,
        """SELECT s.*, t.name, t.short_name, t.tla FROM league_standings s
           JOIN teams t USING (team_id)
           WHERE s.season_id = (SELECT max(season_id) FROM fixtures)
           QUALIFY dense_rank() OVER (ORDER BY
               CASE s.source_id WHEN 'football_data_org' THEN 0 ELSE 1 END, s.snapshot_date DESC) = 1
           ORDER BY s.position""",
    )
    source = rows[0]["source_id"] if rows else None
    return {"season_id": rows[0]["season_id"] if rows else None, "source": source,
            "derived": source == "derived", "table": rows}
