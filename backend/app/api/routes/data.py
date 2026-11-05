import duckdb
from fastapi import APIRouter, Depends

from app.api.dependencies import get_db
from app.services.data_health import health_summary, list_sources

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/sources")
def sources(con: duckdb.DuckDBPyConnection = Depends(get_db)) -> list[dict]:
    return list_sources(con)


@router.get("/health")
def health(con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    return health_summary(con)


@router.get("/last-updated")
def last_updated(con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict:
    return {
        s["source_id"]: {"status": s["status"], "last_success_at": s["last_success_at"],
                         "data_as_of": s["data_as_of"]}
        for s in list_sources(con)
    }
