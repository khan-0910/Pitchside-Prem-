import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.api.routes import data, fixtures, matches, models, players, system
from app.config import get_settings
from app.core.exceptions import PitchsideError
from app.core.logging import configure_logging, log
from app.core.scheduler import build_scheduler
from app.data.matching.teams import seed_teams
from app.data.runner import build_loaders, register_sources
from app.database.connection import db_cursor, write_lock
from app.services import model_ops

REQUEST_TIMEOUT_SECONDS = 60


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    with write_lock:
        cursor = db_cursor()
        seed_teams(cursor)
        register_sources(cursor, build_loaders())
        cursor.close()
    jobs = [("predictions", settings.predictions_refresh_hours, model_ops.refresh_outputs),
            ("retrain_match", settings.model_retrain_hours, model_ops.retrain)]
    scheduler = build_scheduler(jobs) if settings.scheduler_enabled else None
    if scheduler:
        scheduler.start()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Pitchside API", version="1.0.0", lifespan=lifespan,
                  docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(GZipMiddleware, minimum_size=2048)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins.split(","),
        allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-Admin-Token"],
    )

    @app.middleware("http")
    async def request_timeout(request: Request, call_next):
        try:
            return await asyncio.wait_for(call_next(request), REQUEST_TIMEOUT_SECONDS)
        except TimeoutError:
            log.warning("request_timeout", path=request.url.path)
            return _error(504, "timeout", "The request took too long")

    @app.exception_handler(PitchsideError)
    async def on_domain_error(_: Request, exc: PitchsideError):
        return _error(exc.status_code, exc.code, exc.message)

    @app.exception_handler(HTTPException)
    async def on_http_error(_: Request, exc: HTTPException):
        return _error(exc.status_code, "http_error", str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def on_invalid(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(x) for x in first.get("loc", []))
        return _error(422, "invalid_request", f"{where}: {first.get('msg', 'invalid value')}")

    @app.exception_handler(Exception)
    async def on_unexpected(request: Request, exc: Exception):
        log.error("unhandled", path=request.url.path, error=type(exc).__name__)
        return _error(500, "internal_error", "Something went wrong")

    v1 = APIRouter(prefix="/api/v1")
    v1.include_router(system.router)
    v1.include_router(data.router)
    v1.include_router(fixtures.router)
    v1.include_router(matches.router)
    v1.include_router(models.router)
    v1.include_router(players.router)
    app.include_router(v1)
    return app


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


app = create_app()
