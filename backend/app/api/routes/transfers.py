from typing import Any, Literal

import duckdb
from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_db
from app.api.routes.players import Group
from app.services import transfers as service

router = APIRouter(prefix="/transfers", tags=["transfers"])


@router.get("/values")
def values(
    q: str | None = Query(None, max_length=60),
    position_group: Group | None = None,
    team: str | None = None,
    age_max: int | None = Query(None, ge=14, le=50),
    min_minutes: int = Query(0, ge=0),
    min_gap_pct: float | None = None,
    sort: Literal["gap_pct", "gap_eur", "actual", "predicted", "age", "name", "minutes"] = "gap_pct",
    direction: Literal["asc", "desc"] = "desc",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    con: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict[str, Any]:
    return service.list_values(
        con, q=q, group=position_group, team=team, age_max=age_max, min_minutes=min_minutes,
        min_gap_pct=min_gap_pct, sort=sort, direction=direction, limit=limit, offset=offset,
    )


@router.get("/undervalued")
def undervalued(
    position_group: Group | None = None,
    team: str | None = None,
    age_max: int | None = Query(None, ge=14, le=50),
    min_minutes: int = Query(450, ge=0),
    limit: int = Query(25, ge=1, le=100),
    con: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict[str, Any]:
    return service.undervalued(con, group=position_group, team=team, age_max=age_max,
                               min_minutes=min_minutes, limit=limit)


@router.get("/{player_id}/valuation")
def valuation(player_id: str, con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    return service.valuation_detail(con, player_id)
