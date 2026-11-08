"""Break a match prediction into the steps that built it.

The logistic model gives each outcome a base score, then adds one weight times each input.
Adding the inputs a group at a time replays that sum, so the last step is exactly the stored
prediction. The order changes how big each step looks, never where it ends.
"""

import math
from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from app.features.match_features import FEATURES
from app.models.match.inference import MatchModel

# key, title, note, inputs, facts shown (label, input stem, format, which value is better)
STAGES: list[tuple[str, str, str, list[str], list[tuple[str, str, str, str | None]]]] = [
    ("strength", "Team strength", "Long-run ratings from results, plus the value and output of each likely squad.",
     ["elo_diff", "elo_home", "elo_away", "squad_value_home", "squad_value_away", "squad_value_diff",
      "squad_ga90_home", "squad_ga90_away"],
     [("Elo rating", "elo", "int", "high"), ("Squad value", "squad_value", "eur", "high"),
      ("Squad goals and assists per 90", "squad_ga90", "2dp", "high")]),
    ("season", "Season so far", "Points and goal difference per game this season.",
     ["season_ppg_home", "season_ppg_away", "season_gd_home", "season_gd_away"],
     [("Points per game", "season_ppg", "2dp", "high"),
      ("Goal difference per game", "season_gd", "signed", "high")]),
    ("form", "Recent form", "Points, goals and shots over the last few matches.",
     ["ppg5_home", "ppg5_away", "gf10_home", "gf10_away", "ga10_home", "ga10_away",
      "shots10_home", "shots10_away", "sot10_home", "sot10_away"],
     [("Points per game, last 5", "ppg5", "1dp", "high"), ("Goals per game, last 10", "gf10", "1dp", "high"),
      ("Conceded per game, last 10", "ga10", "1dp", "low"),
      ("Shots per game, last 10", "shots10", "1dp", "high")]),
    ("venue", "Home and away record", "The home side's last 10 home games, the away side's last 10 away.",
     ["venue_ppg10_home", "venue_ppg10_away"],
     [("Points per game", "venue_ppg10", "1dp", "high")]),
    ("rest", "Rest", "Days since each side last played, counted up to 14.",
     ["rest_home", "rest_away"],
     [("Days of rest", "rest", "int", None)]),
    ("absences", "Injuries and absences", "Share of each likely squad's value flagged as doubtful or out.",
     ["absent_share_home", "absent_share_away"],
     [("Expected to miss", "absent_share", "pct", "low")]),
]
START = ("start", "A typical match", "Before looking at either club: how league matches usually end.")


def _show(value: float, kind: str) -> str | None:
    if value is None or math.isnan(value):
        return None
    if kind == "int":
        return f"{value:,.0f}"
    if kind == "eur":
        return f"€{math.expm1(value) / 1e6:,.0f}m"
    if kind == "pct":
        return f"{value * 100:.0f}%"
    if kind == "signed":
        return f"{value:+.2f}"
    return f"{value:.{2 if kind == '2dp' else 1}f}"


def _edge(home: float, away: float, better: str | None) -> str | None:
    if better is None or math.isnan(home) or math.isnan(away) or math.isclose(home, away, rel_tol=1e-3):
        return None
    return "home" if (home > away) == (better == "high") else "away"


def _probabilities(scores: np.ndarray, temperature: float) -> dict[str, float]:
    z = scores / temperature
    p = np.exp(z - z.max())
    p /= p.sum()
    return {"home_win": round(float(p[0]), 4), "draw": round(float(p[1]), 4), "away_win": round(float(p[2]), 4)}


def explain(model: MatchModel, frame: pd.DataFrame) -> list[list[dict[str, Any]] | None]:
    """One list of steps per row, or None when the model is not one that adds up this way."""
    pipe = model.classifier
    final = getattr(pipe, "steps", [[None, None]])[-1][1]
    if not isinstance(final, LogisticRegression) or list(final.classes_) != [0, 1, 2]:
        return [None] * len(frame)
    x = pipe[:-1].transform(frame[FEATURES])
    weights = final.coef_.T  # input, outcome
    index = {name: i for i, name in enumerate(FEATURES)}
    expected = model.predict_proba(frame)
    out: list[list[dict[str, Any]] | None] = []
    for row, raw in enumerate(frame[FEATURES].astype(float).to_dict("records")):
        scores = final.intercept_.astype(float).copy()
        steps: list[dict[str, Any]] = [{"key": START[0], "title": START[1], "note": START[2], "facts": [],
                  "probabilities": _probabilities(scores, model.temperature)}]
        for key, title, note, inputs, facts in STAGES:
            cols = [index[name] for name in inputs]
            scores = scores + x[row, cols] @ weights[cols]
            steps.append({
                "key": key, "title": title, "note": note,
                "facts": [{"label": label, "home": _show(raw[f"{stem}_home"], kind),
                           "away": _show(raw[f"{stem}_away"], kind),
                           "edge": _edge(raw[f"{stem}_home"], raw[f"{stem}_away"], better)}
                          for label, stem, kind, better in facts],
                "probabilities": _probabilities(scores, model.temperature),
            })
        end = steps[-1]["probabilities"]
        # Self-check: the replay must land on the model's own answer.
        ok = np.allclose([end["home_win"], end["draw"], end["away_win"]], expected[row], atol=1e-4)
        out.append(steps if ok else None)
    return out
