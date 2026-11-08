import numpy as np
import pandas as pd
import pytest

from app.features.match_features import FEATURES
from app.models.match.explain import STAGES, explain
from app.models.match.inference import MatchModel
from app.models.match.train import candidates
from app.services.predictions import predict_rows
from app.tests.test_match_model import tiny_model


def logistic_model() -> tuple[MatchModel, pd.DataFrame]:
    rng = np.random.default_rng(0)
    x = pd.DataFrame(rng.normal(size=(300, len(FEATURES))), columns=FEATURES)
    y = np.where(x["elo_diff"] > 0.5, 0, np.where(x["elo_diff"] < -0.5, 2, 1))
    clf = candidates()["logistic"].set_params(logisticregression__C=1.0).fit(x, y)
    model = tiny_model()
    model.classifier, model.temperature = clf, 0.9
    frame = x.head(4).copy()
    frame.loc[0, "rest_home"] = np.nan
    frame["fixture_id"] = list("abcd")
    return model, frame


def test_every_input_is_counted_once():
    used = [name for _, _, _, inputs, _ in STAGES for name in inputs]
    assert sorted(used) == sorted(FEATURES)


def test_steps_land_exactly_on_the_prediction():
    model, frame = logistic_model()
    expected = model.predict_proba(frame)
    for row, steps in enumerate(explain(model, frame)):
        assert steps is not None
        assert [s["key"] for s in steps] == ["start"] + [s[0] for s in STAGES]
        end = steps[-1]["probabilities"]
        assert [end["home_win"], end["draw"], end["away_win"]] == pytest.approx(expected[row], abs=1e-4)
        assert all(sum(s["probabilities"].values()) == pytest.approx(1, abs=1e-3) for s in steps)
    first = explain(model, frame)[0]
    rest = next(s for s in first if s["key"] == "rest")["facts"][0]
    assert rest["home"] is None and rest["edge"] is None


def test_strength_edge_follows_the_better_side():
    model, frame = logistic_model()
    frame.loc[1, ["elo_home", "elo_away"]] = [1600, 1400]
    fact = explain(model, frame)[1][1]["facts"][0]
    assert fact == {"label": "Elo rating", "home": "1,600", "away": "1,400", "edge": "home"}


def test_models_that_do_not_add_up_get_no_steps():
    frame = pd.DataFrame(np.zeros((2, len(FEATURES))), columns=FEATURES)
    frame["fixture_id"] = ["a", "b"]
    assert explain(tiny_model(), frame) == [None, None]
    assert predict_rows(tiny_model(), frame)[0]["explanation"] is None
