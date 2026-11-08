from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sklearn.dummy import DummyClassifier, DummyRegressor

from app.config import get_settings
from app.features.match_features import (
    ELO_START,
    FEATURES,
    TeamState,
    build_match_frame,
    expected_score,
    outcome_label,
    update_elo,
)
from app.features.squads import SquadPlayer, ga_per_90, squad_features
from app.models.match.inference import MatchModel, most_likely_score, score_matrix
from app.models.match.metrics import (
    apply_temperature,
    calibration_curve,
    confusion,
    fit_temperature,
    multiclass_brier,
    score,
)
from app.models.match.train import frequency_baseline, labels, split
from app.services.predictions import confidence_of, predict_rows

TEAMS = ["arsenal", "chelsea", "liverpool", "everton"]


def seed_matches(con, season="2023-24", start=date(2023, 8, 12), rounds=6, played_rounds=5):
    day = start
    rng = np.random.default_rng(0)
    for r in range(rounds):
        pairs = [(TEAMS[r % 4], TEAMS[(r + 1) % 4]), (TEAMS[(r + 2) % 4], TEAMS[(r + 3) % 4])]
        for home, away in pairs:
            fid = f"{season}:{home}:{away}:{r}"
            done = r < played_rounds
            con.execute(
                """INSERT INTO fixtures (fixture_id, season_id, matchday, match_date, home_team_id,
                   away_team_id, status, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'test')""",
                [fid, season, r + 1, day, home, away, "FINISHED" if done else "SCHEDULED"])
            if done:
                hg, ag = int(rng.integers(0, 4)), int(rng.integers(0, 3))
                con.execute(
                    """INSERT INTO match_results (fixture_id, source_id, match_date, home_goals,
                       away_goals) VALUES (?, 'test', ?, ?, ?)""", [fid, day, hg, ag])
        day += timedelta(days=7)


def test_rows_do_not_see_their_own_result(con):
    seed_matches(con)
    before = build_match_frame(con, today=date(2023, 12, 1))
    target = before[before["matchday"] == 3].iloc[0]["fixture_id"]
    con.execute("UPDATE match_results SET home_goals = 9, away_goals = 0 WHERE fixture_id = ?", [target])
    after = build_match_frame(con, today=date(2023, 12, 1))
    b = before.set_index("fixture_id").loc[target, FEATURES].astype(float)
    a = after.set_index("fixture_id").loc[target, FEATURES].astype(float)
    pd.testing.assert_series_equal(b, a)


def test_changing_a_future_result_never_changes_the_past(con):
    seed_matches(con)
    before = build_match_frame(con, today=date(2023, 12, 1))
    last = before[before["matchday"] == 5]["fixture_id"]
    con.execute("UPDATE match_results SET home_goals = 9 WHERE fixture_id IN (SELECT unnest(?))", [list(last)])
    after = build_match_frame(con, today=date(2023, 12, 1))
    early = before["matchday"] <= 5
    pd.testing.assert_frame_equal(
        before.loc[early, FEATURES].astype(float).reset_index(drop=True),
        after.loc[early, FEATURES].astype(float).reset_index(drop=True))
    # Rows after the change do move, which proves the check can fail.
    assert not before.loc[~early, "elo_diff"].equals(after.loc[~early, "elo_diff"])


def test_first_match_has_no_form(con):
    seed_matches(con)
    first = build_match_frame(con, today=date(2023, 12, 1)).iloc[0]
    assert np.isnan(first["ppg5_home"]) and np.isnan(first["season_ppg_away"])


def test_rolling_form_uses_only_earlier_games(con):
    seed_matches(con)
    frame = build_match_frame(con, today=date(2023, 12, 1))
    team = frame.iloc[0]["home_team_id"]
    games = frame[(frame["home_team_id"] == team) | (frame["away_team_id"] == team)]
    second = games.iloc[1]
    first = games.iloc[0]
    is_home = first["home_team_id"] == team
    gf = first["home_goals"] if is_home else first["away_goals"]
    side = "home" if second["home_team_id"] == team else "away"
    assert second[f"gf10_{side}"] == gf


def test_new_season_resets_table_form_and_regresses_elo(con):
    seed_matches(con, "2023-24", date(2023, 8, 12), rounds=4, played_rounds=4)
    seed_matches(con, "2024-25", date(2024, 8, 12), rounds=2, played_rounds=2)
    frame = build_match_frame(con, today=date(2024, 12, 1))
    opener = frame[(frame["season_id"] == "2024-25")].iloc[0]
    assert np.isnan(opener["season_ppg_home"])
    assert not np.isnan(opener["ppg5_home"])


def test_elo_is_zero_sum_and_favours_winners():
    a, b = TeamState(), TeamState()
    update_elo(a, b, 2, 0)
    assert a.elo > ELO_START > b.elo
    assert a.elo + b.elo == pytest.approx(2 * ELO_START)
    assert expected_score(1500, 1500) > 0.5  # home advantage


def test_outcome_labels():
    assert [outcome_label(2, 1), outcome_label(1, 1), outcome_label(0, 1)] == [0, 1, 2]


def test_split_is_chronological_and_rejects_overlap():
    rows = []
    for season, day in [("2022-23", date(2022, 9, 1)), ("2023-24", date(2023, 9, 1)),
                        ("2024-25", date(2024, 9, 1)), ("2025-26", date(2025, 9, 1))]:
        rows.append({"played": True, "season_id": season, "date": day, "home_goals": 1, "away_goals": 0})
    train, val, test = split(pd.DataFrame(rows))
    assert train["date"].max() < val["date"].min()
    assert val["date"].max() < test["date"].min()
    bad = pd.DataFrame(rows)
    bad.loc[0, "date"] = date(2030, 1, 1)
    with pytest.raises(AssertionError):
        split(bad)


def test_metrics():
    y = np.array([0, 1, 2])
    perfect = np.eye(3)[y]
    assert multiclass_brier(y, perfect) == 0
    assert score(y, np.clip(perfect, 0.001, 1))["accuracy"] == 1
    assert confusion(y, perfect) == [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    assert set(calibration_curve(y, perfect)) == {"home", "draw", "away"}


def test_temperature_scaling():
    p = np.array([[0.7, 0.2, 0.1]])
    assert apply_temperature(p, 1.0) == pytest.approx(p, rel=1e-6)
    softened = apply_temperature(p, 2.0)
    assert softened[0, 0] < 0.7 and softened.sum() == pytest.approx(1)
    # Overconfident forecasts on noise should pull temperature above 1.
    rng = np.random.default_rng(1)
    y = rng.integers(0, 3, 600)
    sharp = np.tile([0.8, 0.1, 0.1], (600, 1))
    assert fit_temperature(y, sharp) > 1


def test_frequency_baseline_uses_training_rates():
    train = pd.DataFrame({"home_goals": [1, 1, 0, 0], "away_goals": [0, 0, 0, 1]})
    assert labels(train).tolist() == [0, 0, 1, 2]
    assert frequency_baseline(train, 2)[0].tolist() == [0.5, 0.25, 0.25]


def test_score_matrix_sums_to_one_and_matches_classifier():
    proba = np.array([0.5, 0.3, 0.2])
    grid = score_matrix(1.6, 1.1, proba)
    assert grid.sum() == pytest.approx(1)
    assert np.tril(grid, -1).sum() == pytest.approx(0.5)
    assert np.trace(grid) == pytest.approx(0.3)
    assert most_likely_score(score_matrix(3.4, 0.2)) == "3-0"


def test_squad_features():
    p = [SquadPlayer("a", "A", 10e6, 9, 900), SquadPlayer("b", "B", None, 0, 0)]
    value, ga = squad_features(p)
    assert value == pytest.approx(np.log1p(20e6))  # unknown value takes the known median
    assert ga == pytest.approx(np.mean([ga_per_90(9, 900), 0]))
    assert np.isnan(squad_features([])[0])


def test_better_replacement_raises_squad_inputs():
    roster = [SquadPlayer("a", "A", 10e6, 2, 900), SquadPlayer("b", "B", 10e6, 2, 900)]
    upgraded = [SquadPlayer("c", "C", 90e6, 20, 900), roster[1]]
    assert squad_features(upgraded)[0] > squad_features(roster)[0]
    assert squad_features(upgraded)[1] > squad_features(roster)[1]


def tiny_model():
    x = pd.DataFrame(np.zeros((6, len(FEATURES))), columns=FEATURES)
    clf = DummyClassifier(strategy="prior").fit(x, [0, 0, 0, 1, 1, 2])
    return MatchModel("match-test", clf, DummyRegressor(constant=1.5, strategy="constant").fit(x, [1] * 6),
                      DummyRegressor(constant=1.0, strategy="constant").fit(x, [1] * 6), 1.0)


def test_predictions_are_valid_probabilities():
    frame = pd.DataFrame(np.zeros((2, len(FEATURES))), columns=FEATURES)
    frame["fixture_id"] = ["a", "b"]
    rows = predict_rows(tiny_model(), frame)
    assert rows[0]["p_home"] + rows[0]["p_draw"] + rows[0]["p_away"] == pytest.approx(1)
    assert rows[0]["xg_home"] == 1.5


def test_confidence_is_higher_for_decisive_forecasts():
    assert confidence_of((0.8, 0.1, 0.1))["score"] > confidence_of((0.4, 0.3, 0.3))["score"]
    assert confidence_of((1 / 3, 1 / 3, 1 / 3))["label"] == "Low"


@pytest.fixture
def client(con, monkeypatch):
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    get_settings.cache_clear()
    from app.main import app
    with TestClient(app) as c:
        yield c
    get_settings.cache_clear()


def test_fixture_routes(client, con):
    seed_matches(con, season="2026-27", start=date(2026, 8, 15))
    page = client.get("/api/v1/fixtures", params={"team": "arsenal", "limit": 2}).json()
    assert page["limit"] == 2 and page["total"] >= 2
    assert page["items"][0]["prediction"] is None  # never invented
    fid = page["items"][0]["fixture_id"]
    assert client.get(f"/api/v1/fixtures/{fid}").status_code == 200
    assert client.get(f"/api/v1/fixtures/{fid}/prediction").status_code == 404
    assert client.get("/api/v1/fixtures/nope").status_code == 404
    assert client.get("/api/v1/fixtures", params={"limit": 999}).status_code == 422
    assert client.get("/api/v1/fixtures", params={"status": "DROP"}).status_code == 422


def test_prediction_route_returns_stored_values(client, con):
    seed_matches(con, season="2026-27", start=date(2026, 8, 15))
    fid = con.execute("SELECT fixture_id FROM fixtures WHERE status='SCHEDULED' LIMIT 1").fetchone()[0]
    con.execute(
        """INSERT INTO match_predictions VALUES (?, 'match-test', now(), now(), .5, .3, .2,
           1.5, 1.0, '1-0', '[[0.1]]', NULL)""", [fid])
    body = client.get(f"/api/v1/fixtures/{fid}/prediction").json()
    assert body["probabilities"]["home_win"] == 0.5
    assert body["expected_goals"]["total"] == 2.5
    assert body["limitations"]


def test_team_form_and_standings(client, con):
    seed_matches(con, season="2026-27", start=date(2026, 8, 15))
    form = client.get("/api/v1/matches/teams/arsenal/form").json()
    assert form["matches"] and form["matches"][0]["result"] in "WDL"
    assert client.get("/api/v1/matches/teams/nobody/form").status_code == 404
    assert client.get("/api/v1/standings").json()["table"] == []


def test_admin_retrain_is_locked(client):
    assert client.post("/api/v1/admin/models/retrain").status_code == 403


def test_admin_retrain_rejects_wrong_token(client, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "right")
    get_settings.cache_clear()
    r = client.post("/api/v1/admin/models/retrain", headers={"X-Admin-Token": "wrong"})
    assert r.status_code == 401


def test_missing_share_weighs_value_and_chance():
    from app.features.squads import SquadPlayer, missing_share

    def player(value, availability=None, chance=None):
        return SquadPlayer("p", "p", value, 0, 0, availability=availability, chance=chance)

    assert missing_share([player(30, "i"), player(10)]) == 0.75
    assert missing_share([player(10, "d", 75), player(10)]) == 0.125
    assert missing_share([player(10, "d"), player(10)]) == 0.25


def test_expected_return_reads_fpl_news():
    from app.features.squads import expected_return

    assert expected_return("Knee injury - Expected back 21 Nov", 0) == "21 Nov"
    assert expected_return("Suspended until 29 Nov", 0) == "29 Nov"
    assert expected_return("Calf injury - 50% chance of playing", 50) == "50% chance of playing"
    assert expected_return("Thigh injury - Unknown return date", 0) == "Unknown"
    assert expected_return(None, None) == "Unknown"
