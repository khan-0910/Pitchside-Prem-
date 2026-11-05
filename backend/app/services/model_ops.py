"""Scheduled model work. A failure here keeps the previous active model."""

from app.core.logging import log
from app.database.connection import db_cursor
from app.models.match.train import train_match_model
from app.models.similarity.engine import train_similarity
from app.models.transfer.train import train_transfer_model
from app.services.predictions import evaluate_live, refresh_predictions


def retrain(model: str = "match") -> None:
    cursor = db_cursor()
    try:
        if model == "match":
            train_match_model(cursor)
            refresh_predictions(cursor)
        elif model == "similarity":
            train_similarity(cursor)
        elif model == "transfer":
            train_transfer_model(cursor)
    except Exception as exc:  # noqa: BLE001 - background task, logged, old model stays active
        log.error("retrain_failed", model=model, error=f"{type(exc).__name__}: {exc}")
    finally:
        cursor.close()


def refresh_outputs() -> None:
    cursor = db_cursor()
    try:
        refresh_predictions(cursor)
        evaluate_live(cursor)
    finally:
        cursor.close()
