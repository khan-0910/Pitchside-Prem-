from typing import Any, Literal

import duckdb
from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_db
from app.api.schemas import Page
from app.services import players as service

router = APIRouter(prefix="/players", tags=["players"])
Group = Literal["GK", "CB", "FB", "DM", "CM", "AM", "W", "ST"]


@router.get("", response_model=Page)
def list_players(
    q: str | None = Query(None, max_length=60),
    position_group: Group | None = None,
    team: str | None = None,
    age_min: int | None = Query(None, ge=14, le=50),
    age_max: int | None = Query(None, ge=14, le=50),
    min_minutes: int = Query(0, ge=0),
    sort: Literal["minutes", "name", "age", "xg", "value", "goals"] = "minutes",
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    con: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict[str, Any]:
    return service.search_players(
        con, q=q, group=position_group, team=team, age_min=age_min, age_max=age_max,
        min_minutes=min_minutes, sort=sort, limit=limit, offset=offset,
    )


@router.get("/compare")
def compare(a: str, b: str, con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    return service.compare_players(con, a, b)


@router.get("/{player_id}")
def get_player(player_id: str, con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    return service.player_detail(con, player_id)


@router.get("/{player_id}/statistics")
def statistics(player_id: str, con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    return service.player_statistics(con, player_id)


@router.get("/{player_id}/similar")
def similar(
    player_id: str,
    limit: int = Query(10, ge=1, le=50),
    position_group: Group | None = None,
    team: str | None = None,
    age_max: int | None = Query(None, ge=14, le=50),
    exclude_team: bool = False,
    con: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict[str, Any]:
    return service.similar_players(
        con, player_id, limit=limit, group=position_group, team=team, age_max=age_max,
        exclude_team=exclude_team,
    )
