"""Train, compare and evaluate match models with strictly chronological splits.

train:      2012-13 to 2022-23
validation: 2023-24 to 2024-25   picks the model and fits calibration
test:       2025-26 onward       touched once, for the reported numbers
"""

import json
from datetime import UTC, datetime
from typing import Any

import duckdb
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, PoissonRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from app.core.logging import log
from app.database.connection import write_lock
from app.features.match_features import FEATURES, build_match_frame, outcome_label
from app.models.match import metrics as M
from app.models.match.inference import MatchModel, save_artifact

FIRST_SEASON = "2012-13"
VALIDATION = ("2023-24", "2024-25")
TEST_FROM = "2025-26"
BACKTEST_SEASONS = ("2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26", "2026-27")
SEED = 42


def candidates() -> dict[str, Any]:
    return {
        "logistic": make_pipeline(
            SimpleImputer(strategy="median"), StandardScaler(),
            LogisticRegression(C=0.002, max_iter=3000)),
        "random_forest": make_pipeline(
            SimpleImputer(strategy="median"),
            RandomForestClassifier(n_estimators=500, min_samples_leaf=20, max_features="sqrt",
                                   n_jobs=-1, random_state=SEED)),
        "hist_gradient_boosting": HistGradientBoostingClassifier(
            learning_rate=0.03, max_iter=180, max_depth=3, min_samples_leaf=40,
            l2_regularization=2.0, random_state=SEED),
        "xgboost": XGBClassifier(
            n_estimators=220, learning_rate=0.03, max_depth=3, subsample=0.8,
            colsample_bytree=0.7, min_child_weight=10, reg_lambda=3.0,
            objective="multi:softprob", eval_metric="mlogloss", random_state=SEED, n_jobs=-1),
    }


def goals_model() -> Any:
    return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                         PoissonRegressor(alpha=0.1, max_iter=1000))


def labels(frame: pd.DataFrame) -> np.ndarray:
    return np.array([outcome_label(h, a) for h, a in
                     zip(frame["home_goals"], frame["away_goals"], strict=True)])


def split(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    played = frame[frame["played"] & (frame["season_id"] >= FIRST_SEASON)]
    train = played[played["season_id"] < VALIDATION[0]]
    val = played[played["season_id"].isin(VALIDATION)]
    test = played[played["season_id"] >= TEST_FROM]
    assert train["date"].max() < val["date"].min() <= val["date"].max() < test["date"].min()
    return train, val, test


def bookmaker_probs(con: duckdb.DuckDBPyConnection, timing: str) -> pd.DataFrame:
    """Margin-free market probabilities. The consensus price wins where it exists."""
    return con.execute(
        """SELECT fixture_id, implied_home, implied_draw, implied_away, bookmaker FROM bookmaker_odds
           WHERE timing = ? AND market = '1X2'
           QUALIFY row_number() OVER (PARTITION BY fixture_id ORDER BY
             CASE bookmaker WHEN 'Avg' THEN 0 WHEN 'BbAv' THEN 1 WHEN 'B365' THEN 2 ELSE 3 END) = 1""",
        [timing],
    ).df().set_index("fixture_id")


def frequency_baseline(train: pd.DataFrame, n: int) -> np.ndarray:
    counts = np.bincount(labels(train), minlength=3) / len(train)
    return np.tile(counts, (n, 1))


def _market_row(frame: pd.DataFrame, y: np.ndarray, proba: np.ndarray, odds: pd.DataFrame):
    """Compare model and market on the identical subset of matches."""
    idx = frame["fixture_id"].isin(odds.index).to_numpy()
    if idx.sum() == 0:
        return None
    market = odds.loc[frame.loc[idx, "fixture_id"], ["implied_home", "implied_draw", "implied_away"]]
    return {"market": M.score(y[idx], market.to_numpy()), "model": M.score(y[idx], proba[idx])}


def walk_forward(frame: pd.DataFrame, best: str, odds: pd.DataFrame) -> list[dict]:
    """Refit before each season, predict that season. Same features, no peeking."""
    rows = []
    played = frame[frame["played"] & (frame["season_id"] >= FIRST_SEASON)]
    for season in BACKTEST_SEASONS:
        hold = played[played["season_id"] == season]
        past = played[played["season_id"] < season]
        if hold.empty:
            continue
        model = candidates()[best].fit(past[FEATURES], labels(past))
        y = labels(hold)
        proba = model.predict_proba(hold[FEATURES])
        row = {"season": season, "n": len(hold), **{f"model_{k}": v for k, v in M.score(y, proba).items()}}
        base = M.score(y, frequency_baseline(past, len(hold)))
        row["baseline_log_loss"] = base["log_loss"]
        compared = _market_row(hold, y, proba, odds)
        if compared:
            row["market_log_loss"] = compared["market"]["log_loss"]
            row["model_log_loss_on_market_set"] = compared["model"]["log_loss"]
            row["market_n"] = compared["market"]["n"]
        rows.append(row)
    return rows


def train_match_model(con: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    frame = build_match_frame(con)
    train, val, test = split(frame)
    y_train, y_val, y_test = labels(train), labels(val), labels(test)

    results: dict[str, dict[str, float]] = {}
    fitted = {}
    for name, estimator in candidates().items():
        model = estimator.fit(train[FEATURES], y_train)
        fitted[name] = model
        results[name] = M.score(y_val, model.predict_proba(val[FEATURES]))
        log.info("candidate_scored", model=name, **results[name])
    best = min(results, key=lambda n: results[n]["log_loss"])

    temperature = M.fit_temperature(y_val, fitted[best].predict_proba(val[FEATURES]))

    # Test model: everything before the test window. Refit, then score once.
    before_test = pd.concat([train, val])
    final = candidates()[best].fit(before_test[FEATURES], np.concatenate([y_train, y_val]))
    test_proba = M.apply_temperature(final.predict_proba(test[FEATURES]), temperature)
    test_scores = M.score(y_test, test_proba)
    baseline_scores = M.score(y_test, frequency_baseline(before_test, len(test)))

    pre_odds = bookmaker_probs(con, "pre_match")
    closing_odds = bookmaker_probs(con, "closing")
    pre_market = _market_row(test, y_test, test_proba, pre_odds)
    closing_market = _market_row(test, y_test, test_proba, closing_odds)

    home_model = goals_model().fit(before_test[FEATURES], before_test["home_goals"])
    away_model = goals_model().fit(before_test[FEATURES], before_test["away_goals"])
    xg_home, xg_away = home_model.predict(test[FEATURES]), away_model.predict(test[FEATURES])
    goal_metrics = {
        "mae_home": float(np.mean(np.abs(xg_home - test["home_goals"]))),
        "mae_away": float(np.mean(np.abs(xg_away - test["away_goals"]))),
        "baseline_mae_home": float(np.mean(np.abs(before_test["home_goals"].mean() - test["home_goals"]))),
        "baseline_mae_away": float(np.mean(np.abs(before_test["away_goals"].mean() - test["away_goals"]))),
    }

    backtest = walk_forward(frame, best, pre_odds)

    # Production model sees every played match, including the test window.
    played = pd.concat([before_test, test])
    y_all = labels(played)
    version = f"match-v1.{datetime.now(UTC):%Y%m%d%H%M}"
    production = MatchModel(
        version=version,
        classifier=candidates()[best].fit(played[FEATURES], y_all),
        home_goals=goals_model().fit(played[FEATURES], played["home_goals"]),
        away_goals=goals_model().fit(played[FEATURES], played["away_goals"]),
        temperature=temperature,
    )
    path, sha = save_artifact(production)

    metrics: list[tuple[str, str, str, float]] = []
    for name, values in results.items():
        metrics += [("validation", name, k, v) for k, v in values.items()]
    metrics += [("test", "model", k, v) for k, v in test_scores.items()]
    metrics += [("test", "baseline_frequency", k, v) for k, v in baseline_scores.items()]
    metrics.append(("test", "baseline_always_home", "accuracy", float(np.mean(y_test == 0))))
    metrics.append(("test", "baseline_always_home", "n", float(len(y_test))))
    for label, compared in (("pre_match", pre_market), ("closing", closing_market)):
        if compared:
            metrics += [("test", f"bookmaker_{label}", k, v) for k, v in compared["market"].items()]
            metrics += [("test", f"model_on_{label}_set", k, v) for k, v in compared["model"].items()]
    metrics += [("test", "expected_goals", k, v) for k, v in goal_metrics.items()]

    params = {"best": best, "temperature": temperature, "features": FEATURES, "sha256": sha}
    with write_lock:
        con.execute("BEGIN")
        con.execute("UPDATE model_registry SET is_active = FALSE WHERE model_type = 'match'")
        con.execute(
            """INSERT INTO model_registry (model_version, model_type, algorithm, trained_at,
               train_start, train_end, test_start, test_end, n_train, n_test, artifact_path, params,
               is_active, notes) VALUES (?, 'match', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)""",
            [version, best, datetime.now(UTC), train["date"].min(), val["date"].max(),
             test["date"].min(), test["date"].max(), len(before_test), len(test), path.name,
             json.dumps(params),
             f"Validation {VALIDATION[0]} to {VALIDATION[1]}. Production refit on all played matches."],
        )
        con.executemany(
            "INSERT INTO model_metrics (model_version, scope, candidate, metric, value) VALUES (?, ?, ?, ?, ?)",
            [[version, s, c, m, v] for s, c, m, v in metrics],
        )
        reports = {
            "calibration": M.calibration_curve(y_test, test_proba),
            "confusion": M.confusion(y_test, test_proba),
            "backtest": backtest,
            "feature_list": FEATURES,
            "periods": {
                "train": [str(train["date"].min()), str(train["date"].max())],
                "validation": [str(val["date"].min()), str(val["date"].max())],
                "test": [str(test["date"].min()), str(test["date"].max())],
            },
        }
        con.executemany(
            "INSERT INTO model_reports VALUES (?, ?, ?)",
            [[version, k, json.dumps(v)] for k, v in reports.items()],
        )
        con.execute("COMMIT")
    log.info("match_model_trained", version=version, best=best, **test_scores)
    return {"version": version, "best": best, "temperature": temperature, "validation": results,
            "test": test_scores, "baseline": baseline_scores, "pre_market": pre_market,
            "closing_market": closing_market, "goals": goal_metrics, "backtest": backtest}
