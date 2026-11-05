import math
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from app.features.valuation_features import Appearances, _value_history, _windows
from app.models.transfer.train import apply_interval, evaluate, interval_table
from app.services.transfers import classify


def apps():
    days = [date(2024, 1, 1), date(2024, 6, 1), date(2025, 1, 1)]
    cum = lambda v: np.concatenate([[0.0], np.cumsum(v)])  # noqa: E731
    return Appearances(days, cum([90, 90, 90]), cum([1, 0, 2]), cum([0, 1, 0]), cum([90, 0, 90]), cum([1, 1, 1]))


def test_windows_stop_before_the_valuation_date():
    out = _windows(apps(), date(2025, 1, 1))
    assert out["min_365"] == 90  # the game on the day itself is excluded
    after = _windows(apps(), date(2025, 1, 2))
    assert after["min_365"] == 180 and after["g90_365"] == 1.0  # June and January games


def test_previous_window_and_league_share():
    out = _windows(apps(), date(2025, 2, 1))
    assert out["min_365"] == 180
    assert out["pl_share_365"] == 0.5
    assert out["min_prev"] == 90


def test_no_appearances_gives_empty_window():
    out = _windows(None, date(2025, 1, 1))
    assert out["min_365"] == 0 and math.isnan(out["g90_365"])


def test_value_history_uses_only_earlier_values():
    dates, logs = [date(2023, 1, 1), date(2024, 1, 1)], [1.0, 2.0]
    assert _value_history(dates, logs, date(2023, 1, 1)) is None  # same day never counts
    h = _value_history(dates, logs, date(2024, 6, 1))
    assert h["last_value_log"] == 2.0 and h["value_trend"] == 1.0
    assert h["last_value_age_days"] == (date(2024, 6, 1) - date(2024, 1, 1)).days


def test_evaluate_reports_euros_and_log_scale():
    y = np.log1p(np.array([1e6, 2e6]))
    assert evaluate(y, y)["mae_eur"] == pytest.approx(0, abs=1e-3)
    assert evaluate(y, y + 1)["mae_log"] == pytest.approx(1)


def test_intervals_widen_around_prediction():
    rng = np.random.default_rng(0)
    y = rng.normal(15, 1, 500)
    pred = y + rng.normal(0, 0.3, 500)
    table = interval_table(y, pred, np.full(500, 1e6))
    low, high = apply_interval(np.array([15.0]), np.array([1e6]), table)
    assert low[0] < np.expm1(15) < high[0]


def test_valuation_gap_needs_more_than_a_positive_number():
    row = {"minutes": 1500, "actual_eur": 10e6, "low_eur": 9e6, "high_eur": 20e6, "predicted_eur": 14e6}
    assert classify(row) == "within_uncertainty"  # 40% up, but inside the range
    assert classify({**row, "low_eur": 11e6}) == "model_undervalued"
    assert classify({**row, "high_eur": 9e6}) == "model_overvalued"
    assert classify({**row, "low_eur": 11e6, "minutes": 100}) == "small_sample"


def test_future_transfer_values_cannot_reach_training_features(con):
    # A later valuation must leave earlier rows untouched.
    from app.features.valuation_features import build_training_frame
    con.execute("INSERT INTO players (player_id, name, date_of_birth, sub_position) VALUES ('p', 'P', DATE '2000-01-01', 'Centre-Forward')")
    start = date(2023, 1, 1)
    for i in range(12):
        con.execute(
            """INSERT INTO player_appearances (game_id, player_id, source_id, game_date, tm_club_id, competition_id,
               minutes, goals, assists, yellow_cards, red_cards) VALUES (?, 'p', 't', ?, '11', 'GB1', 90, 1, 0, 0, 0)""",
            [str(i), start + timedelta(days=14 * i)])
    for day, value in [(date(2023, 1, 1), 1e6), (date(2023, 6, 1), 2e6)]:
        con.execute(
            """INSERT INTO player_market_values (player_id, valuation_date, source_id, value_eur, tm_club_id)
               VALUES ('p', ?, 't', ?, '11')""", [day, value])
    before = build_training_frame(con)
    con.execute(
        """INSERT INTO player_market_values (player_id, valuation_date, source_id, value_eur, tm_club_id)
           VALUES ('p', DATE '2024-01-01', 't', 90e6, '11')""")
    after = build_training_frame(con)
    pd.testing.assert_frame_equal(before, after[after["valuation_date"] <= date(2023, 6, 1)])


def seed_valuation(con, pid, actual, predicted, low, minutes=1200, age_days=30):
    con.execute("INSERT INTO players (player_id, name, date_of_birth, current_team_id) VALUES (?, ?, DATE '2000-01-01', 'arsenal')", [pid, pid])
    con.execute(
        """INSERT INTO player_statistics (player_id, season_id, source_id, observation_date, minutes)
           VALUES (?, '2026-27', 'fpl', current_date, ?)""", [pid, minutes])
    con.execute(
        """INSERT INTO transfer_predictions VALUES ('t', ?, current_date - CAST(? AS INTEGER), ?, ?, ?, ?, now())""",
        [pid, age_days, actual, predicted, low, predicted * 1.3])


def test_undervalued_ranks_positive_gaps_and_marks_clear_signals(con):
    from app.services.transfers import undervalued
    con.execute("INSERT INTO model_registry (model_version, model_type, is_active) VALUES ('t', 'transfer', TRUE)")
    seed_valuation(con, "clear", 10e6, 20e6, 15e6)
    seed_valuation(con, "weak", 10e6, 11e6, 9e6)
    seed_valuation(con, "negative", 10e6, 8e6, 6e6)
    seed_valuation(con, "stale", 10e6, 30e6, 25e6, age_days=900)
    seed_valuation(con, "short", 10e6, 30e6, 25e6, minutes=100)
    out = undervalued(con)
    assert [r["player_id"] for r in out["items"]] == ["clear", "weak"]
    assert out["clear_signals"] == 1
    assert out["items"][1]["assessment"] == "within_uncertainty"
