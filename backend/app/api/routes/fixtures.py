from datetime import date
from typing import Any, Literal

import duckdb
from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_db
from app.api.schemas import Page, Prediction
from app.core.exceptions import NotFoundError
from app.database.query import row_dicts, scalar
from app.services.predictions import PREDICTION_SQL, fixture_detail, present

router = APIRouter(prefix="/fixtures", tags=["fixtures"])


@router.get("", response_model=Page)
def list_fixtures(
    season: str | None = None,
    team: str | None = None,
    status: Literal["SCHEDULED", "IN_PLAY", "FINISHED", "POSTPONED"] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort: Literal["asc", "desc"] = "asc",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    con: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict[str, Any]:
    where = ["TRUE"]
    params: list[Any] = []
    if season:
        where.append("f.season_id = ?")
        params.append(season)
    else:
        where.append("f.season_id = (SELECT max(season_id) FROM fixtures)")
    if team:
        where.append("(f.home_team_id = ? OR f.away_team_id = ?)")
        params += [team, team]
    if status:
        where.append("f.status = ?")
        params.append(status)
    if date_from:
        where.append("f.match_date >= ?")
        params.append(date_from)
    if date_to:
        where.append("f.match_date <= ?")
        params.append(date_to)
    clause = " WHERE " + " AND ".join(where)
    total = scalar(con, "SELECT count(*) FROM fixtures f" + clause, params)
    # sort comes from a Literal, so it is one of two fixed strings.
    rows = row_dicts(
        con,
        PREDICTION_SQL + clause
        + f" ORDER BY f.kickoff_utc {sort} NULLS LAST, f.match_date {sort}, f.fixture_id LIMIT ? OFFSET ?",
        [*params, limit, offset],
    )
    return {"items": [present(r) for r in rows], "total": total, "limit": limit, "offset": offset}


@router.get("/upcoming")
def upcoming(
    limit: int = Query(10, ge=1, le=100), con: duckdb.DuckDBPyConnection = Depends(get_db)
) -> list[dict[str, Any]]:
    rows = row_dicts(
        con,
        PREDICTION_SQL + " WHERE f.status = 'SCHEDULED' ORDER BY f.kickoff_utc, f.fixture_id LIMIT ?",
        [limit],
    )
    return [present(r) for r in rows]


@router.get("/{fixture_id}")
def get_fixture(fixture_id: str, con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    fixture = fixture_detail(con, fixture_id)
    if not fixture:
        raise NotFoundError("Fixture not found")
    return fixture


@router.get("/{fixture_id}/prediction", response_model=Prediction)
def get_prediction(fixture_id: str, con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    fixture = fixture_detail(con, fixture_id)
    if not fixture:
        raise NotFoundError("Fixture not found")
    if not fixture["prediction"]:
        raise NotFoundError("No prediction stored for this fixture")
    return {"fixture_id": fixture_id, "home_team": fixture["home_team"],
            "away_team": fixture["away_team"], **fixture["prediction"]}
