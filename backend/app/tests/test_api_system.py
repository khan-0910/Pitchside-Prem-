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
