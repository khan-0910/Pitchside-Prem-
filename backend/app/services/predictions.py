"""Stored predictions for upcoming fixtures, and scoring them after results arrive."""

import json
import math
from datetime import UTC, datetime
from typing import Any

import duckdb
import numpy as np
import pandas as pd

from app.core.exceptions import ServiceUnavailableError
from app.database.connection import write_lock
from app.database.query import row_dicts, scalar
from app.features.match_features import build_match_frame
from app.models.match.inference import MatchModel, load_active, most_likely_score, score_matrix
from app.models.match.metrics import score

LIMITATIONS = [
    "Built from team form, Elo strength, squad data and expected absences. No tactics or confirmed line-ups.",
    "Squad strength assumes the 14 most-used available players.",
    "Absences come from FPL injury flags, which can lag behind club announcements.",
    "Team xG is only available from 2026-27, so it is not a model input yet.",
]


def require_model(con: duckdb.DuckDBPyConnection) -> MatchModel:
    model = load_active(con)
    if model is None:
        raise ServiceUnavailableError("No trained match model is available yet")
    return model


def upcoming_frame(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    frame = build_match_frame(con)
    return frame[(~frame["played"]) & (frame["status"].isin(["SCHEDULED", "POSTPONED"]))]


def predict_rows(model: MatchModel, frame: pd.DataFrame) -> list[dict[str, Any]]:
    proba = model.predict_proba(frame)
    xg_h, xg_a = model.predict_goals(frame)
    out = []
    for i, fixture_id in enumerate(frame["fixture_id"]):
        grid = score_matrix(float(xg_h[i]), float(xg_a[i]), proba[i])
        out.append({
            "fixture_id": fixture_id, "p_home": float(proba[i, 0]), "p_draw": float(proba[i, 1]),
            "p_away": float(proba[i, 2]), "xg_home": float(xg_h[i]), "xg_away": float(xg_a[i]),
            "most_likely_score": most_likely_score(grid),
            "score_matrix": json.dumps(np.round(grid[:6, :6], 5).tolist()),
        })
    return out


def refresh_predictions(con: duckdb.DuckDBPyConnection) -> int:
    model = load_active(con)
    if model is None:
        return 0
    frame = upcoming_frame(con)
    if frame.empty:
        return 0
    now = datetime.now(UTC)
    as_of = scalar(con, "SELECT max(last_success_at) FROM source_registry") or now
    rows = predict_rows(model, frame)
    with write_lock:
        con.executemany(
            """INSERT OR REPLACE INTO match_predictions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [[r["fixture_id"], model.version, now, as_of, r["p_home"], r["p_draw"], r["p_away"],
              r["xg_home"], r["xg_away"], r["most_likely_score"], r["score_matrix"]] for r in rows],
        )
    return len(rows)


def evaluate_live(con: duckdb.DuckDBPyConnection) -> dict[str, float] | None:
    """Score the last prediction made before each kickoff against what then happened."""
    rows = con.execute(
        """SELECT p.p_home, p.p_draw, p.p_away, r.home_goals, r.away_goals, p.model_version
           FROM match_predictions p
           JOIN v_match_results r USING (fixture_id)
           JOIN fixtures f USING (fixture_id)
           WHERE f.kickoff_utc IS NULL OR p.predicted_at < f.kickoff_utc
           QUALIFY row_number() OVER (PARTITION BY p.fixture_id ORDER BY p.predicted_at DESC) = 1"""
    ).fetchall()
    if len(rows) < 5:
        return None
    y = np.array([0 if r[3] > r[4] else 2 if r[4] > r[3] else 1 for r in rows])
    result = score(y, np.array([r[:3] for r in rows]))
    version = rows[-1][5]
    with write_lock:
        con.executemany(
            """INSERT OR REPLACE INTO model_metrics (model_version, scope, candidate, metric, value)
               VALUES (?, 'live', 'model', ?, ?)""",
            [[version, k, v] for k, v in result.items()],
        )
    return result


def confidence_of(p: tuple[float, float, float]) -> dict[str, Any]:
    """How decisive the forecast is. Not a chance of being right."""
    entropy = -sum(x * math.log(x) for x in p if x > 0)
    value = 1 - entropy / math.log(3)
    label = "High" if value >= 0.2 else "Medium" if value >= 0.08 else "Low"
    return {"score": round(value, 3), "label": label}


PREDICTION_SQL = """
    SELECT f.fixture_id, f.season_id, f.matchday, f.kickoff_utc, f.match_date, f.status,
           f.home_team_id, h.name AS home_team, h.short_name AS home_short, h.tla AS home_tla,
           f.away_team_id, a.name AS away_team, a.short_name AS away_short, a.tla AS away_tla,
           r.home_goals, r.away_goals, p.p_home, p.p_draw, p.p_away, p.xg_home, p.xg_away,
           p.most_likely_score, p.score_matrix, p.model_version, p.predicted_at, p.data_timestamp
    FROM fixtures f
    JOIN teams h ON h.team_id = f.home_team_id
    JOIN teams a ON a.team_id = f.away_team_id
    LEFT JOIN v_match_results r USING (fixture_id)
    LEFT JOIN (
        SELECT * FROM match_predictions
        QUALIFY row_number() OVER (PARTITION BY fixture_id ORDER BY predicted_at DESC) = 1
    ) p USING (fixture_id)
"""


def present(row: dict[str, Any]) -> dict[str, Any]:
    """Database row to API shape. Predictions stay null when none exists."""
    out = {k: row[k] for k in (
        "fixture_id", "season_id", "matchday", "kickoff_utc", "match_date", "status",
        "home_team_id", "home_team", "home_short", "home_tla", "away_team_id", "away_team",
        "away_short", "away_tla", "home_goals", "away_goals")}
    out["prediction"] = None
    if row.get("p_home") is not None:
        probs = (row["p_home"], row["p_draw"], row["p_away"])
        out["prediction"] = {
            "probabilities": {"home_win": row["p_home"], "draw": row["p_draw"],
                              "away_win": row["p_away"]},
            "expected_goals": {"home": row["xg_home"], "away": row["xg_away"],
                               "total": row["xg_home"] + row["xg_away"]},
            "most_likely_score": row["most_likely_score"],
            "score_matrix": json.loads(row["score_matrix"]) if row["score_matrix"] else None,
            "confidence": confidence_of(probs),
            "model_version": row["model_version"],
            "predicted_at": row["predicted_at"],
            "data_timestamp": row["data_timestamp"],
            "limitations": LIMITATIONS,
        }
    return out


def fixture_detail(con: duckdb.DuckDBPyConnection, fixture_id: str) -> dict[str, Any] | None:
    rows = row_dicts(con, PREDICTION_SQL + " WHERE f.fixture_id = ?", [fixture_id])
    return present(rows[0]) if rows else None
