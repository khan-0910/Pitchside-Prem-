from datetime import UTC, datetime

import duckdb
from fastapi import APIRouter, Depends, Response

from app.api.dependencies import get_db
from app.database.query import scalar

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "time": datetime.now(UTC)}


@router.get("/ready")
def ready(response: Response, con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    """Ready means real match data is loaded."""
    fixtures = scalar(con, "SELECT count(*) FROM fixtures")
    active = scalar(con, "SELECT count(*) FROM model_registry WHERE is_active")
    is_ready = fixtures > 0
    if not is_ready:
        response.status_code = 503
    return {"ready": is_ready, "fixtures": fixtures, "active_models": active}
