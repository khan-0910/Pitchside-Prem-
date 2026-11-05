import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.models.similarity.engine import (
    COMPARABLE,
    STATS,
    assign_roles,
    cosine,
    per_90,
    position_group,
    rank_similar,
    similarity_score,
    train_similarity,
    weight_vector,
    zscores,
)


def frame(n=40, seed=0):
    rng = np.random.default_rng(seed)
    data = {s: rng.uniform(0, 3, n) for s in STATS}
    df = pd.DataFrame(data, index=[f"p{i}" for i in range(n)])
    df["position_group"] = (["ST", "W", "CM", "CB"] * n)[:n]
    df.iloc[0, df.columns.get_loc("position_group")] = "GK"
    df["minutes"] = 900.0
    return df


def test_per_90_scales_by_minutes_and_handles_zero():
    df = pd.DataFrame({"minutes": [180.0, 0.0], **{s: [2.0, 2.0] for s in STATS}})
    out = per_90(df)
    assert out["xg"].tolist() == [1.0, 0.0]


def test_position_groups():
    assert position_group("Left-Back", "Defender") == "FB"
    assert position_group("Centre-Forward", "Forward") == "ST"
    assert position_group(None, "Goalkeeper") == "GK"
    assert position_group(None, None) is None


def test_goalkeepers_are_never_compared_with_outfielders():
    df = frame()
    z = zscores(df)
    ranked = rank_similar(z, df["position_group"], "p0")
    assert ranked == []  # only one keeper in the pool
    assert COMPARABLE["ST"].count("GK") == 0
    st = next(i for i, g in df["position_group"].items() if g == "ST")
    ids = [p for p, _ in rank_similar(z, df["position_group"], st)]
    assert "p0" not in ids and st not in ids


def test_scaling_outfield_is_independent_of_keepers():
    df = frame()
    df.loc["p0", "saves"] = 500.0
    z = zscores(df)
    assert abs(z.loc[df["position_group"] != "GK", "saves"]).max() < 4


def test_identical_styles_score_100_and_opposites_zero():
    a = np.array([1.0 if s in ("xg", "threat") else -1.0 for s in STATS])
    assert similarity_score(a, a * 2, "ST") == 100
    assert similarity_score(a, -a, "ST") == 0


def test_position_weights_change_the_answer():
    assert (weight_vector("ST") != weight_vector("CB")).any()
    assert cosine(np.zeros(3), np.ones(3)) == 0


def test_roles_cover_every_player_and_report_quality():
    df = frame(80)
    roles, quality = assign_roles(zscores(df), df["position_group"])
    assert roles.notna().all()
    assert all(-1 <= v <= 1 for v in quality.values())


def seed_real_shape(con):
    rng = np.random.default_rng(3)
    groups = ["Centre-Forward", "Right Winger", "Centre-Back", "Goalkeeper"]
    for i in range(32):
        pid = f"p{i}"
        sub = groups[i % 4]
        pos = {"Centre-Forward": "Forward", "Right Winger": "Midfielder", "Centre-Back": "Defender",
               "Goalkeeper": "Goalkeeper"}[sub]
        con.execute(
            """INSERT INTO players (player_id, name, date_of_birth, position, sub_position, current_team_id)
               VALUES (?, ?, DATE '2000-01-01', ?, ?, ?)""",
            [pid, f"Player {i}", pos, sub, "arsenal" if i % 2 else "chelsea"])
        values = {s: float(rng.uniform(0, 30)) for s in STATS}
        minutes = 100.0 if i == 31 else 2000.0
        cols = ", ".join(STATS)
        marks = ", ".join("?" for _ in STATS)
        con.execute(
            f"""INSERT INTO player_statistics (player_id, season_id, source_id, observation_date, minutes, {cols})
                VALUES (?, '2026-27', 'fpl', DATE '2026-11-01', ?, {marks})""",
            [pid, minutes, *values.values()])


@pytest.fixture
def client(con, monkeypatch):
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    get_settings.cache_clear()
    from app.main import app
    with TestClient(app) as c:
        yield c
    get_settings.cache_clear()


def test_full_pipeline_and_routes(client, con):
    seed_real_shape(con)
    result = train_similarity(con)
    assert result["players"] == 31  # the 100-minute player is filtered out

    listing = client.get("/api/v1/players", params={"position_group": "ST", "limit": 5}).json()
    assert listing["items"] and all(i["position_group"] == "ST" for i in listing["items"])

    assert client.get("/api/v1/players", params={"q": "player 3"}).json()["total"] >= 1
    assert client.get("/api/v1/players", params={"sort": "evil"}).status_code == 422

    similar = client.get("/api/v1/players/p0/similar", params={"limit": 3}).json()
    assert len(similar["items"]) == 3
    top = similar["items"][0]
    assert 0 <= top["similarity_score"] <= 100
    assert "probability" in similar["score_note"].lower()  # labelled as not one
    assert {"shared_strengths", "main_differences"} <= set(top)

    filtered = client.get("/api/v1/players/p0/similar", params={"exclude_team": True}).json()
    assert all(i["team_id"] != "chelsea" for i in filtered["items"])

    low = client.get("/api/v1/players/p31/similar").json()
    assert low["items"] == [] and low["note"]

    assert client.get("/api/v1/players/nobody").status_code == 404
    detail = client.get("/api/v1/players/p0").json()
    assert len(detail["profile"]["radar"]) == 6
    assert "_z" not in detail["profile"]
    compared = client.get("/api/v1/players/compare", params={"a": "p0", "b": "p4"}).json()
    assert compared["similarity_score"] is not None
    keeper = client.get("/api/v1/players/compare", params={"a": "p0", "b": "p3"}).json()
    assert keeper["similarity_score"] is None and keeper["note"]
