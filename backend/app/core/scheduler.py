"""In-process refresh jobs. Page views never trigger a refresh; only these jobs do."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import get_settings
from app.core.logging import log
from app.data.runner import build_loaders, run_source
from app.database.connection import db_cursor


def _safely(name: str, job: Callable[[], object]) -> Callable[[], None]:
    def wrapped() -> None:
        try:
            job()
        except Exception as exc:  # noqa: BLE001 - a failed job must not stop the scheduler
            log.error("job_failed", job=name, error=f"{type(exc).__name__}: {exc}")
    return wrapped


def build_scheduler(extra_jobs: list[tuple[str, float, Callable[[], object]]] | None = None):
    settings = get_settings()
    scheduler = BackgroundScheduler(
        timezone="UTC",
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 3600},
    )
    intervals = {
        "fpl": settings.refresh_fpl_hours,
        "fpl_history": settings.refresh_fpl_history_hours,
        "football_data_org": settings.refresh_football_data_org_hours,
        "football_data_uk": settings.refresh_football_data_uk_hours,
        "transfermarkt": settings.refresh_transfermarkt_hours,
        "understat": settings.refresh_understat_hours,
    }
    con = db_cursor()
    last = dict(con.execute("SELECT source_id, last_attempt_at FROM source_registry").fetchall())
    con.close()
    now = datetime.now(UTC)
    for loader in build_loaders():
        hours = intervals[loader.source_id]

        def job(item=loader) -> None:
            cursor = db_cursor()
            try:
                run_source(cursor, item)
            finally:
                cursor.close()

        attempted = last.get(loader.source_id)
        due = attempted + timedelta(hours=hours) if attempted else now
        scheduler.add_job(
            _safely(loader.source_id, job), "interval", hours=hours, id=loader.source_id,
            jitter=120, next_run_time=max(due, now + timedelta(seconds=45)),
        )
    for name, hours, fn in extra_jobs or []:
        scheduler.add_job(_safely(name, fn), "interval", hours=hours, id=name, jitter=120)
    return scheduler
