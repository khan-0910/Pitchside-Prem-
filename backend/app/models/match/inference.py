"""Load the active match model and turn features into probabilities and scorelines."""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import duckdb
import joblib
import numpy as np
import pandas as pd
from scipy.stats import poisson

from app.config import get_settings
from app.features.match_features import FEATURES
from app.models.match.metrics import apply_temperature

MAX_GOALS = 8


@dataclass
class MatchModel:
    version: str
    classifier: Any
    home_goals: Any
    away_goals: Any
    temperature: float

    def predict_proba(self, frame: pd.DataFrame) -> np.ndarray:
        raw = self.classifier.predict_proba(frame[FEATURES])
        return apply_temperature(raw, self.temperature)

    def predict_goals(self, frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        return (self.home_goals.predict(frame[FEATURES]), self.away_goals.predict(frame[FEATURES]))


def score_matrix(xg_home: float, xg_away: float, proba: np.ndarray | None = None) -> np.ndarray:
    """P(home goals = i, away goals = j), rescaled to agree with the 1X2 model."""
    goals = np.arange(MAX_GOALS + 1)
    grid = np.outer(poisson.pmf(goals, xg_home), poisson.pmf(goals, xg_away))
    grid /= grid.sum()
    if proba is None:
        return grid
    home, draw, away = np.tril(grid, -1), np.diag(np.diag(grid)), np.triu(grid, 1)
    out = (home * proba[0] / max(home.sum(), 1e-9)
           + draw * proba[1] / max(draw.sum(), 1e-9)
           + away * proba[2] / max(away.sum(), 1e-9))
    return out / out.sum()


def most_likely_score(grid: np.ndarray) -> str:
    i, j = np.unravel_index(int(grid.argmax()), grid.shape)
    return f"{i}-{j}"


def save_artifact(model: MatchModel) -> tuple[Path, str]:
    root = get_settings().artifact_dir
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{model.version}.joblib"
    joblib.dump(model, path)
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


def load_active(con: duckdb.DuckDBPyConnection) -> MatchModel | None:
    row = con.execute(
        """SELECT model_version, artifact_path, params FROM model_registry
           WHERE model_type = 'match' AND is_active ORDER BY trained_at DESC LIMIT 1"""
    ).fetchone()
    if not row:
        return None
    return _load_verified(row[1], json.loads(row[2])["sha256"], row[0])


_cached: tuple[str, MatchModel] | None = None


def _load_verified(path: str, sha256: str, version: str) -> MatchModel | None:
    global _cached
    if _cached and _cached[0] == version:
        return _cached[1]
    target = (get_settings().artifact_dir / Path(path).name).resolve()
    # joblib runs code on load: only our own folder, only the exact file we wrote.
    if target.parent != get_settings().artifact_dir.resolve() or not target.exists():
        return None
    if hashlib.sha256(target.read_bytes()).hexdigest() != sha256:
        return None
    model = joblib.load(target)
    _cached = (version, model)
    return model
