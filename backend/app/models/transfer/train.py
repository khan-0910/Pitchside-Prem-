"""Next-valuation model. Target: log1p(market value). Splits by valuation date.

train: before 2024   validation: 2024   test: 2025 onward
Compared with two honest references: "value stays the same" and a performance-only model.
Model estimates are not transfer fees.
"""

import json
from datetime import UTC, date, datetime
from typing import Any

import duckdb
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    GradientBoostingRegressor,
    HistGradientBoostingRegressor,
    RandomForestRegressor,
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.metrics import mean_squared_error, median_absolute_error, r2_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

from app.config import get_settings
from app.core.logging import log
from app.database.connection import write_lock
from app.features.valuation_features import (
    ALL_FEATURES,
    PERFORMANCE,
    build_current_frame,
    build_training_frame,
)

VALIDATION_FROM = date(2024, 1, 1)
TEST_FROM = date(2025, 1, 1)
SEED = 42
BANDS = [(0, 5e6, "under 5m"), (5e6, 20e6, "5-20m"), (20e6, 50e6, "20-50m"), (50e6, 1e12, "over 50m")]


def _linear(model: Any) -> Any:
    return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), model)


def candidates() -> dict[str, Any]:
    return {
        "linear": _linear(LinearRegression()),
        "ridge": _linear(Ridge(alpha=10)),
        "random_forest": make_pipeline(
            SimpleImputer(strategy="median"),
            RandomForestRegressor(n_estimators=300, min_samples_leaf=5, max_features=0.5,
                                  n_jobs=-1, random_state=SEED)),
        "gradient_boosting": make_pipeline(
            SimpleImputer(strategy="median"),
            GradientBoostingRegressor(n_estimators=250, learning_rate=0.05, max_depth=3,
                                      subsample=0.8, random_state=SEED)),
        "hist_gradient_boosting": HistGradientBoostingRegressor(
            max_iter=350, learning_rate=0.05, max_depth=4, min_samples_leaf=15, random_state=SEED),
        "xgboost": XGBRegressor(n_estimators=350, learning_rate=0.05, max_depth=4, subsample=0.8,
                                colsample_bytree=0.8, min_child_weight=5, random_state=SEED, n_jobs=-1),
    }


def evaluate(y_log: np.ndarray, pred_log: np.ndarray) -> dict[str, float]:
    actual, pred = np.expm1(y_log), np.expm1(pred_log)
    return {
        "mae_eur": float(np.mean(np.abs(actual - pred))),
        "rmse_eur": float(np.sqrt(mean_squared_error(actual, pred))),
        "median_ae_eur": float(median_absolute_error(actual, pred)),
        "r2_log": float(r2_score(y_log, pred_log)),
        "mae_log": float(np.mean(np.abs(y_log - pred_log))),
        "n": float(len(y_log)),
    }


def by_slice(test: pd.DataFrame, y: np.ndarray, pred: np.ndarray) -> dict[str, list[dict]]:
    groups = []
    for group, part in test.groupby("position_group"):
        idx = test.index.get_indexer(part.index)
        groups.append({"slice": group, **evaluate(y[idx], pred[idx])})
    bands = []
    for lo, hi, label in BANDS:
        mask = ((test["value_eur"] >= lo) & (test["value_eur"] < hi)).to_numpy()
        if mask.sum() >= 10:
            bands.append({"slice": label, **evaluate(y[mask], pred[mask])})
    return {"by_position": groups, "by_value_band": bands}


def interval_table(y: np.ndarray, pred: np.ndarray, values: np.ndarray) -> list[dict]:
    """10th and 90th percentile errors by value band, measured out of sample."""
    table = []
    for lo, hi, label in BANDS:
        mask = (values >= lo) & (values < hi)
        errors = (y - pred)[mask] if mask.sum() >= 30 else (y - pred)
        table.append({"lo": lo, "hi": hi, "label": label, "q10": float(np.quantile(errors, 0.1)),
                      "q90": float(np.quantile(errors, 0.9))})
    return table


def apply_interval(pred_log: np.ndarray, current: np.ndarray, table: list[dict]):
    low, high = pred_log.copy(), pred_log.copy()
    for row in table:
        mask = (current >= row["lo"]) & (current < row["hi"])
        low[mask] += row["q10"]
        high[mask] += row["q90"]
    return np.expm1(low), np.expm1(high)


def train_transfer_model(con: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    frame = build_training_frame(con).sort_values("valuation_date").reset_index(drop=True)
    frame["y"] = np.log1p(frame["value_eur"])
    train = frame[frame["valuation_date"] < VALIDATION_FROM]
    val = frame[(frame["valuation_date"] >= VALIDATION_FROM) & (frame["valuation_date"] < TEST_FROM)]
    test = frame[frame["valuation_date"] >= TEST_FROM]
    assert train["valuation_date"].max() < val["valuation_date"].min()
    assert val["valuation_date"].max() < test["valuation_date"].min()

    scores: dict[str, dict[str, float]] = {}
    for name, est in candidates().items():
        est.fit(train[ALL_FEATURES], train["y"])
        scores[name] = evaluate(val["y"].to_numpy(), est.predict(val[ALL_FEATURES]))
        log.info("transfer_candidate", model=name, **scores[name])
    best = min(scores, key=lambda n: scores[n]["mae_log"])

    # Intervals come from a model that never saw validation.
    pre = candidates()[best].fit(train[ALL_FEATURES], train["y"])
    val_pred = pre.predict(val[ALL_FEATURES])
    intervals = interval_table(val["y"].to_numpy(), val_pred, val["value_eur"].to_numpy())

    fit_set = pd.concat([train, val])
    final = candidates()[best].fit(fit_set[ALL_FEATURES], fit_set["y"])
    y_test = test["y"].to_numpy()
    test_pred = final.predict(test[ALL_FEATURES])
    test_scores = evaluate(y_test, test_pred)
    persistence = evaluate(y_test, test["last_value_log"].to_numpy())
    performance_only = candidates()[best].fit(fit_set[PERFORMANCE], fit_set["y"])
    perf_scores = evaluate(y_test, performance_only.predict(test[PERFORMANCE]))
    low, high = apply_interval(test_pred, test["last_value_log"].pipe(np.expm1).to_numpy(), intervals)
    actual = test["value_eur"].to_numpy()
    coverage = float(np.mean((actual >= low) & (actual <= high)))

    version = f"transfer-v1.{datetime.now(UTC):%Y%m%d%H%M}"
    production = candidates()[best].fit(frame[ALL_FEATURES], frame["y"])
    settings = get_settings()
    settings.artifact_dir.mkdir(parents=True, exist_ok=True)
    path = settings.artifact_dir / f"{version}.joblib"
    joblib.dump(production, path)

    current = build_current_frame(con)
    now = datetime.now(UTC)
    pred_log = production.predict(current[ALL_FEATURES])
    c_low, c_high = apply_interval(pred_log, current["value_eur"].to_numpy(), intervals)
    rows = pd.DataFrame({
        "model_version": version, "player_id": current["player_id"],
        "valuation_date": current["valuation_date"], "actual_eur": current["value_eur"],
        "predicted_eur": np.expm1(pred_log), "low_eur": c_low, "high_eur": c_high, "predicted_at": now,
    })

    metrics = [("validation", n, k, v) for n, s in scores.items() for k, v in s.items()]
    metrics += [("test", "model", k, v) for k, v in test_scores.items()]
    metrics += [("test", "baseline_no_change", k, v) for k, v in persistence.items()]
    metrics += [("test", "performance_only", k, v) for k, v in perf_scores.items()]
    metrics.append(("test", "model", "interval_coverage_80", coverage))
    periods = {"train": [str(train["valuation_date"].min()), str(train["valuation_date"].max())],
               "validation": [str(val["valuation_date"].min()), str(val["valuation_date"].max())],
               "test": [str(test["valuation_date"].min()), str(test["valuation_date"].max())]}
    with write_lock:
        con.execute("BEGIN")
        con.execute("UPDATE model_registry SET is_active = FALSE WHERE model_type = 'transfer'")
        con.execute(
            """INSERT INTO model_registry (model_version, model_type, algorithm, trained_at, train_start,
               train_end, test_start, test_end, n_train, n_test, artifact_path, params, is_active, notes)
               VALUES (?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)""",
            [version, best, now, train["valuation_date"].min(), val["valuation_date"].max(),
             test["valuation_date"].min(), test["valuation_date"].max(), len(fit_set), len(test), path.name,
             json.dumps({"best": best, "intervals": intervals, "features": ALL_FEATURES}),
             "Estimates the next recorded valuation. Not a transfer fee."],
        )
        con.executemany(
            "INSERT INTO model_metrics (model_version, scope, candidate, metric, value) VALUES (?, ?, ?, ?, ?)",
            [[version, s, c, m, v] for s, c, m, v in metrics],
        )
        con.executemany("INSERT INTO model_reports VALUES (?, ?, ?)", [
            [version, "slices", json.dumps(by_slice(test.reset_index(drop=True), y_test, test_pred))],
            [version, "periods", json.dumps(periods)],
        ])
        con.register("_t", rows)
        con.execute("INSERT INTO transfer_predictions BY NAME SELECT * FROM _t")
        con.unregister("_t")
        con.execute("COMMIT")
    return {"version": version, "best": best, "validation": scores, "test": test_scores,
            "no_change": persistence, "performance_only": perf_scores, "interval_coverage_80": coverage,
            "players_scored": len(rows)}
