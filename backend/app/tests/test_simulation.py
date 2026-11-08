import json
from datetime import date

import numpy as np
import pandas as pd
import pytest

from app.core.exceptions import InvalidRequestError, NotFoundError, ServiceUnavailableError
from app.features.match_features import FEATURES
from app.features.squads import SquadPlayer
from app.models.match.inference import score_matrix
from app.services import simulations, what_if
from app.simulation.season import (
    RemainingFixture,
    TeamRow,
    rank_iterations,
    simulate_season,
    summarise,
)
from app.tests.test_match_model import tiny_model


def certain(hg, ag):
    grid = np.zeros((9, 9))
    grid[hg, ag] = 1.0
    return grid


TABLE = [TeamRow("a", 10, 10, 5), TeamRow("b", 9, 8, 5), TeamRow("c", 3, 3, 8), TeamRow("d", 1, 2, 10)]


def test_certain_results_give_exact_table():
    remaining = [RemainingFixture("c", "a", certain(3, 0)), RemainingFixture("d", "b", certain(0, 1))]
    r = simulate_season(TABLE, remaining, [], 50, 1)
    t = {x: i for i, x in enumerate(r.teams)}
    assert (r.points[:, t["a"]] == 10).all() and (r.points[:, t["b"]] == 12).all()
    assert (r.points[:, t["c"]] == 6).all()
    assert (r.positions[:, t["b"]] == 0).all()


def test_no_remaining_fixtures_means_the_table_is_final():
    r = simulate_season(TABLE, [], [], 20, 1)
    rows = summarise(r)
    assert rows[0]["team_id"] == "a" and rows[0]["p_title"] == 1
    assert rows[0]["expected_points"] == 10  # played results are kept, not re-simulated


def test_same_seed_reproduces_and_new_seed_differs():
    remaining = [RemainingFixture("a", "b", score_matrix(1.4, 1.2)), RemainingFixture("c", "d", score_matrix(1.5, 1))]
    one = simulate_season(TABLE, remaining, [], 2000, 7)
    two = simulate_season(TABLE, remaining, [], 2000, 7)
    three = simulate_season(TABLE, remaining, [], 2000, 8)
    assert (one.positions == two.positions).all()
    assert not (one.points == three.points).all()


def test_probabilities_are_consistent():
    remaining = [RemainingFixture("a", "b", score_matrix(1.4, 1.2))]
    teams = [TeamRow(f"t{i}", 20 - i, 10, 10) for i in range(19)] + [TeamRow("a", 21, 10, 10)]
    teams[0] = TeamRow("b", 20, 10, 10)
    rows = summarise(simulate_season(teams, remaining, [], 5000, 3))
    assert sum(r["p_title"] for r in rows) == pytest.approx(1)
    assert sum(r["p_top4"] for r in rows) == pytest.approx(4)
    assert sum(r["p_relegation"] for r in rows) == pytest.approx(3)
    for r in rows:
        assert sum(r["position_distribution"]) == pytest.approx(1, abs=1e-3)
        assert r["p_title"] <= r["p_top4"] <= r["p_top6"]


def test_sample_probabilities_match_the_grid():
    proba = np.array([0.5, 0.3, 0.2])
    grid = score_matrix(1.5, 1.1, proba)
    r = simulate_season([TeamRow("h", 0, 0, 0), TeamRow("a", 0, 0, 0)],
                        [RemainingFixture("h", "a", grid)], [], 40_000, 11)
    wins = (r.points[:, 0] == 3).mean()
    assert wins == pytest.approx(0.5, abs=0.01)


def rank(points, gf, ga, fixtures=(), hg=None, ag=None, played=()):
    return rank_iterations(np.array([points]), np.array([gf]), np.array([ga]), list(fixtures),
                           hg if hg is not None else np.zeros((1, 0)), ag if ag is not None else np.zeros((1, 0)),
                           list(played), np.random.default_rng(0))[0].tolist()


def test_tiebreak_goal_difference_then_goals():
    assert rank([50, 50], [40, 40], [20, 10]) == [1, 0]  # better difference ranks higher
    assert rank([50, 50], [60, 40], [30, 10]) == [0, 1]  # same difference, more scored


def test_tiebreak_head_to_head_when_everything_else_matches():
    played = [(1, 0, 2, 0), (0, 1, 1, 1)]  # team 1 beat team 0 and drew the return
    assert rank([50, 50], [40, 40], [20, 20], played=played) == [1, 0]


def test_tiebreak_head_to_head_away_goals():
    played = [(0, 1, 1, 2), (1, 0, 0, 1)]
    # Each won away. Team 1 scored 2 away, team 0 scored 1.
    assert rank([50, 50], [40, 40], [20, 20], played=played) == [1, 0]


def test_swap_replaces_only_the_outgoing_player():
    a, b, c = [SquadPlayer(x, x, 1e6, 1, 900) for x in "abc"]
    assert [p.player_id for p in what_if.swap([a, b], "a", c)] == ["c", "b"]


def test_apply_squad_changes_only_that_club():
    frame = pd.DataFrame(np.ones((2, len(FEATURES))), columns=FEATURES)
    frame["home_team_id"] = ["x", "y"]
    frame["away_team_id"] = ["y", "x"]
    out = what_if.apply_squad(frame, "x", 5.0, 0.5)
    assert out.loc[0, "squad_value_home"] == 5 and out.loc[0, "squad_value_away"] == 1
    assert out.loc[1, "squad_value_away"] == 5 and out.loc[1, "squad_value_home"] == 1
    assert out.loc[0, "squad_value_diff"] == 4 and out.loc[1, "squad_value_diff"] == -4
    assert out.loc[0, "elo_diff"] == 1


def test_trade_offs_respect_direction_of_goals_conceded():
    profile = lambda v: {"position_group": "GK", "per90": {s: v for s in  # noqa: E731
                         ("saves", "xgc", "goals_conceded", "influence", "bps", "recoveries")}}
    result = what_if.trade_offs({"profile": profile(2.0)}, {"profile": profile(1.0)})
    assert any("Goals conceded" in x for x in result["advantages"])
    assert any("Saves" in x for x in result["disadvantages"])


# ---------- service level, on a small synthetic league ----------
def seed_league(con):
    for team in ("arsenal", "chelsea"):
        for i in range(16):
            pid = f"{team}{i}"
            con.execute(
                """INSERT INTO players (player_id, name, position, current_team_id, availability)
                   VALUES (?, ?, 'Midfielder', ?, 'a')""", [pid, pid, team])
            con.execute(
                """INSERT INTO player_statistics (player_id, season_id, source_id, observation_date, team_id,
                   minutes, goals, assists) VALUES (?, '2026-27', 'fpl', DATE '2026-11-01', ?, ?, ?, 0)""",
                [pid, team, 900 - i * 10, 3 if team == "arsenal" else 1])
            con.execute(
                """INSERT INTO player_market_values (player_id, valuation_date, source_id, value_eur)
                   VALUES (?, DATE '2026-06-01', 't', ?)""", [pid, 20e6 if team == "arsenal" else 5e6])
    con.execute(
        """INSERT INTO fixtures (fixture_id, season_id, matchday, match_date, home_team_id, away_team_id, status)
           VALUES ('2026-27:arsenal:chelsea', '2026-27', 10, DATE '2026-12-01', 'arsenal', 'chelsea', 'SCHEDULED')""")


def frame_for_upcoming():
    row = {f: 0.0 for f in FEATURES}
    row.update({"fixture_id": "2026-27:arsenal:chelsea", "home_team_id": "arsenal", "away_team_id": "chelsea",
                "date": date(2026, 12, 1), "status": "SCHEDULED", "season_id": "2026-27"})
    return pd.DataFrame([row])


@pytest.fixture
def patched(con, monkeypatch):
    seed_league(con)
    monkeypatch.setattr(what_if, "require_model", lambda c: tiny_model())
    monkeypatch.setattr(what_if, "_upcoming", lambda c: frame_for_upcoming())
    return con


def test_replacement_changes_squad_inputs_and_value(patched):
    out = what_if.run_replacement(patched, "chelsea", "chelsea0", "arsenal15", [])
    assert out["hypothetical"] is True
    assert out["model_inputs_changed"] is True
    assert out["model_inputs"]["squad_value_log"]["after"] > out["model_inputs"]["squad_value_log"]["before"]
    assert out["squad_value"]["change"] == 15e6
    assert out["assumptions"] and out["matches"]
    assert what_if.get_scenario(patched, out["scenario_id"])["team"] == "Chelsea"


def test_fringe_player_swap_reports_no_model_change(patched):
    out = what_if.run_replacement(patched, "chelsea", "chelsea15", "arsenal0", [])
    assert out["model_inputs_changed"] is False
    assert out["notes"]
    assert out["matches"][0]["win_change"] == 0


@pytest.mark.parametrize("args,error", [
    (("chelsea", "chelsea0", "chelsea0", []), InvalidRequestError),
    (("chelsea", "arsenal0", "arsenal1", []), InvalidRequestError),
    (("chelsea", "chelsea0", "chelsea1", []), InvalidRequestError),
    (("chelsea", "chelsea0", "ghost", []), NotFoundError),
    (("nobody", "chelsea0", "arsenal0", []), NotFoundError),
    (("chelsea", "chelsea0", "arsenal0", ["bad-fixture"]), InvalidRequestError),
])
def test_replacement_validation(patched, args, error):
    with pytest.raises(error):
        what_if.run_replacement(patched, *args)


def test_simulation_needs_predictions(con):
    seed_league(con)
    con.execute("""INSERT INTO model_registry (model_version, model_type, is_active) VALUES ('m', 'match', TRUE)""")
    with pytest.raises(ServiceUnavailableError):
        simulations.run_simulation(con, 100)


def test_simulation_is_stored_and_deduplicated(con):
    seed_league(con)
    con.execute("""INSERT INTO model_registry (model_version, model_type, is_active) VALUES ('m', 'match', TRUE)""")
    con.execute("""INSERT INTO match_predictions VALUES ('2026-27:arsenal:chelsea', 'm', now(), now(),
                   .5, .3, .2, 1.5, 1.0, '1-0', '[]', NULL)""")
    first = simulations.run_simulation(con, 500, 3)
    second = simulations.run_simulation(con, 500, 3)
    assert first["simulation_id"] == second["simulation_id"]
    assert first["model_version"] == "m" and first["seed"] == 3
    assert {r["team_id"] for r in first["results"]} == {"arsenal", "chelsea"}
    assert sum(r["p_title"] for r in first["results"]) == pytest.approx(1, abs=1e-3)
    assert simulations.latest_simulation(con)["simulation_id"] == first["simulation_id"]
    assert simulations.simulation_history(con)[0]["title_favourite"] in {"Arsenal", "Chelsea"}
    assert json.dumps(first, default=str)


def test_demo_is_skipped_quietly_without_models(con):
    assert what_if.refresh_demo(con) is None


def test_iteration_cap(con):
    with pytest.raises(InvalidRequestError):
        simulations.run_simulation(con, 10_000_000)


def test_replacement_rejects_scores_as_plain_percent_bump(patched):
    # Same inputs must give identical predictions: nothing is added by hand.
    out = what_if.run_replacement(patched, "chelsea", "chelsea15", "arsenal0", [])
    m = out["matches"][0]
    assert m["before"] == m["after"]
