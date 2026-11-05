from typing import Any

import duckdb
from fastapi import APIRouter, Depends, Query

from app.api.dependencies import expensive_limit, get_db
from app.api.schemas import ReplacementRequest, SimulationRequest
from app.services import simulations, what_if

router = APIRouter(tags=["simulation"])


@router.post("/simulation/season", dependencies=[Depends(expensive_limit)])
def run_season(
    body: SimulationRequest, con: duckdb.DuckDBPyConnection = Depends(get_db)
) -> dict[str, Any]:
    return simulations.run_simulation(con, body.iterations, body.seed)


@router.get("/simulation/latest")
def latest(con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    return simulations.latest_simulation(con)


@router.get("/simulation/history")
def history(
    limit: int = Query(20, ge=1, le=100), con: duckdb.DuckDBPyConnection = Depends(get_db)
) -> list[dict[str, Any]]:
    return simulations.simulation_history(con, limit)


@router.get("/simulation/{simulation_id}")
def get_run(simulation_id: str, con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    return simulations.get_simulation(con, simulation_id)


@router.post("/what-if/player-replacement", dependencies=[Depends(expensive_limit)])
def replacement(
    body: ReplacementRequest, con: duckdb.DuckDBPyConnection = Depends(get_db)
) -> dict[str, Any]:
    return what_if.run_replacement(con, body.team_id, body.player_out_id, body.player_in_id, body.fixture_ids)


@router.get("/what-if/teams/{team_id}/squad")
def squad(team_id: str, con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    return what_if.squad_view(con, team_id)


@router.get("/what-if/{scenario_id}")
def scenario(scenario_id: str, con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    return what_if.get_scenario(con, scenario_id)
