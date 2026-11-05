import pytest
from fastapi.testclient import TestClient

from app.config import get_settings


@pytest.fixture
def client(con, monkeypatch):
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    get_settings.cache_clear()
    from app.main import app
    with TestClient(app) as c:
        yield c
    get_settings.cache_clear()


def test_health(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"


def test_ready_is_503_with_no_data(client):
    r = client.get("/api/v1/ready")
    assert r.status_code == 503 and r.json()["ready"] is False


def test_sources_start_unavailable_never_live(client):
    sources = client.get("/api/v1/data/sources").json()
    assert len(sources) == 6
    assert {s["status"] for s in sources} == {"UNAVAILABLE"}


def test_data_health_shape(client):
    body = client.get("/api/v1/data/health").json()
    assert set(body) >= {"sources", "failed_runs", "quality_checks", "unresolved_entities"}


def test_unknown_route_uses_error_envelope(client):
    r = client.get("/api/v1/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "http_error"


def test_site_serves_files_and_routes_but_never_escapes_its_folder(tmp_path, con, monkeypatch):
    monkeypatch.setenv("SCHEDULER_ENABLED", "false")
    get_settings.cache_clear()
    from app.main import create_app
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>site</html>")
    (dist / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("private")
    with TestClient(create_app(dist)) as c:
        assert "site" in c.get("/").text
        assert "site" in c.get("/app/players").text  # client-side route
        assert c.get("/favicon.svg").text == "<svg/>"
        assert "private" not in c.get("/..%2fsecret.txt").text
        assert c.get("/api/v1/nope").status_code == 404
        assert c.get("/api/v1/health").json()["status"] == "ok"
    get_settings.cache_clear()


def test_sources_explain_themselves(con):
    from app.services.data_health import list_sources
    con.execute(
        """INSERT INTO source_registry (source_id, name, ttl_seconds, stale_after_seconds, last_success_at,
           last_attempt_ok, records, upstream_updated_at) VALUES
           ('transfermarkt', 'TM', 3600, 3600, now(), TRUE, 10, now() - INTERVAL 90 DAY),
           ('fpl', 'FPL', 3600, 3600, now(), TRUE, 10, NULL),
           ('understat', 'Understat', 3600, 3600, NULL, FALSE, 0, NULL)""")
    rows = {r["source_id"]: r for r in list_sources(con)}
    assert rows["transfermarkt"]["status"] == "STALE" and "paused" in rows["transfermarkt"]["note"]
    assert rows["fpl"]["status"] == "LIVE" and rows["fpl"]["note"] is None
    assert rows["understat"]["status"] == "UNAVAILABLE"  # the state stays honest
    assert rows["understat"]["optional"] is True and "Nothing depends" in rows["understat"]["note"]
    assert [r["source_id"] for r in list_sources(con)][-1] == "understat"  # essentials come first


def test_team_news_lists_flagged_regulars_only(con):
    from app.services.players import team_news

    con.execute("INSERT INTO teams (team_id, name) VALUES ('ars', 'Arsenal')")
    for pid, status in (("hurt", "i"), ("gone", "u"), ("fit", "a")):
        con.execute("INSERT INTO players (player_id, name, current_team_id, availability) VALUES (?, ?, 'ars', ?)",
                    [pid, pid, status])
        con.execute(
            """INSERT INTO player_statistics (player_id, source_id, season_id, observation_date, minutes)
               VALUES (?, 'fpl', '2026-27', DATE '2026-11-01', 900)""", [pid])
    news = team_news(con)
    assert [p["player_id"] for p in news["ars"]] == ["hurt"]


def test_exported_snapshot_never_claims_to_be_live():
    from scripts.export_static import not_live

    assert not_live([{"status": "LIVE"}, {"status": "STALE"}]) == [{"status": "CACHED"}, {"status": "STALE"}]
