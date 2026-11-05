"""Everything here is synthetic. It exists to test code paths, never to feed the app."""

import json

import duckdb
import pytest

from app.data.cache import SnapshotCache
from app.data.http import Fetcher
from app.data.matching.teams import seed_teams
from app.database.connection import set_connection
from app.database.schema import migrate


@pytest.fixture
def con():
    connection = duckdb.connect(":memory:")
    migrate(connection)
    seed_teams(connection)
    set_connection(connection)
    yield connection
    set_connection(None)
    connection.close()


@pytest.fixture
def cache(tmp_path):
    return SnapshotCache(tmp_path / "cache")


@pytest.fixture
def fetcher(cache):
    return Fetcher(cache, min_interval=0, backoff_base=0, max_attempts=3)


def fpl_payloads():
    boot = {
        "events": [{"id": 1, "deadline_time": "2026-08-14T17:30:00Z"}],
        "teams": [{"id": 1, "code": 3, "name": "Arsenal"}, {"id": 2, "code": 1, "name": "Man Utd"}],
        "elements": [
            {"id": 10, "code": 1001, "first_name": "Ada", "second_name": "Test", "known_name": "",
             "birth_date": "2000-01-02", "element_type": 4, "team": 1, "now_cost": 85,
             "minutes": 900, "starts": 10, "goals_scored": 5, "assists": 2,
             "expected_goals": "4.50", "expected_assists": "1.20", "status": "a", "news": ""},
            {"id": 11, "code": 1002, "first_name": "Bo", "second_name": "Sample", "known_name": "",
             "birth_date": None, "element_type": 1, "team": 2, "now_cost": 50, "minutes": 0,
             "status": "i", "news": "Knee injury", "news_added": "2026-09-01T10:00:00Z",
             "chance_of_playing_next_round": 25},
        ],
    }
    fixtures = [
        {"id": 1, "event": 1, "team_h": 1, "team_a": 2, "kickoff_time": "2026-08-15T14:00:00Z",
         "finished": True, "started": True, "team_h_score": 2, "team_a_score": 1},
        {"id": 2, "event": 2, "team_h": 2, "team_a": 1, "kickoff_time": "2026-08-22T14:00:00Z",
         "finished": False, "started": False, "team_h_score": None, "team_a_score": None},
    ]
    return json.dumps(boot).encode(), json.dumps(fixtures).encode()
