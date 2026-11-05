import gzip
import json
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
import respx

from app.core.exceptions import SourceUnavailableError
from app.data.loaders.base import Loader, LoadResult
from app.data.loaders.football_data_org import FootballDataOrgLoader
from app.data.loaders.football_data_uk import (
    FootballDataUkLoader,
    odds_rows,
    parse_date,
    parse_rows,
)
from app.data.loaders.fpl import FplHistoryLoader, FplLoader, fixture_status
from app.data.loaders.transfermarkt import TransfermarktLoader
from app.data.loaders.understat import UnderstatLoader, site_is_up
from app.data.normalizers.seasons import csv_code, season_id_for
from app.data.runner import _run, register_sources
from app.data.status import SourceStatus, derive_status
from app.database.schema import migrate
from app.tests.conftest import fpl_payloads

OLD_CSV = (
    b"Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,,\r\n"
    b"E0,14/08/93,Arsenal,Coventry,0,3,A,,\r\n"
    b",,,,,,,,\r\n"
)
NEW_CSV = (
    "﻿Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,Referee,HxG,AxG,HS,AS,"
    "HST,AST,HF,AF,HC,AC,HY,AY,HR,AR,B365H,B365D,B365A,B365CH,B365CD,B365CA,AHh\n"
    "E0,01/11/2026,16:30,Liverpool,Arsenal,0,1,A,0,1,A,A Ref,1.05,0.96,17,10,0,3,18,10,7,4,4,4,"
    "0,0,2.9,3.4,2.4,2.8,3.3,2.5,0.25\n"
).encode()


# ---------- seasons ----------
def test_season_rollover():
    assert season_id_for(date(2026, 8, 1)) == "2026-27"
    assert season_id_for(date(2027, 5, 1)) == "2026-27"
    assert csv_code(1993) == "9394" and csv_code(2026) == "2627" and csv_code(1999) == "9900"


# ---------- status ----------
NOW = datetime(2026, 11, 5, tzinfo=UTC)


def status(**kw):
    base = dict(has_data=True, last_success_at=NOW - timedelta(hours=1), last_attempt_ok=True,
                upstream_updated_at=None, ttl_seconds=3600 * 6, stale_after_seconds=3600 * 48,
                now=NOW)
    return derive_status(**{**base, **kw})


def test_status_states():
    assert status() is SourceStatus.LIVE
    assert status(last_attempt_ok=False) is SourceStatus.CACHED
    assert status(last_success_at=NOW - timedelta(hours=10)) is SourceStatus.CACHED
    assert status(last_success_at=NOW - timedelta(days=5)) is SourceStatus.STALE
    assert status(has_data=False) is SourceStatus.UNAVAILABLE
    assert status(last_success_at=None) is SourceStatus.UNAVAILABLE


def test_fresh_download_of_old_dataset_is_stale_not_live():
    assert status(upstream_updated_at=NOW - timedelta(days=30)) is SourceStatus.STALE


# ---------- http and cache ----------
@respx.mock
def test_fetch_stores_snapshot_and_revalidates_with_etag(fetcher, cache):
    route = respx.get("https://x.test/a").mock(
        return_value=httpx.Response(200, content=b"one", headers={"ETag": '"v1"'}))
    first = fetcher.fetch("s", "a", "https://x.test/a")
    assert first.read_bytes() == b"one" and not first.from_cache

    route.mock(return_value=httpx.Response(304))
    second = fetcher.fetch("s", "a", "https://x.test/a")
    assert route.calls.last.request.headers["If-None-Match"] == '"v1"'
    assert second.sha256 == first.sha256 and not second.from_cache


@respx.mock
def test_429_is_retried_and_honours_retry_after(fetcher):
    route = respx.get("https://x.test/r").mock(side_effect=[
        httpx.Response(429, headers={"Retry-After": "0"}), httpx.Response(200, content=b"ok")])
    assert fetcher.fetch("s", "r", "https://x.test/r").read_bytes() == b"ok"
    assert route.call_count == 2


@respx.mock
def test_provider_failure_falls_back_to_last_good_snapshot(fetcher, cache):
    cache.put("s", "a", b"good")
    respx.get("https://x.test/a").mock(return_value=httpx.Response(500))
    snap = fetcher.fetch("s", "a", "https://x.test/a")
    assert snap.from_cache and snap.read_bytes() == b"good" and snap.error


@respx.mock
def test_no_snapshot_and_no_provider_raises(fetcher):
    respx.get("https://x.test/a").mock(side_effect=httpx.ConnectError("boom"))
    with pytest.raises(SourceUnavailableError):
        fetcher.fetch("s", "a", "https://x.test/a")


# ---------- football-data.co.uk ----------
def test_csv_parser_handles_old_and_new_layouts():
    old = parse_rows(OLD_CSV)
    assert len(old) == 1 and old[0]["AwayTeam"] == "Coventry"
    assert parse_rows(NEW_CSV)[0]["HxG"] == "1.05"
    assert parse_date("14/08/93") == date(1993, 8, 14)
    assert parse_date("01/11/2026") == date(2026, 11, 1)


def test_csv_without_team_columns_is_rejected():
    with pytest.raises(ValueError):
        parse_rows(b"a,b\n1,2\n")


def test_odds_keep_prices_and_strip_margin():
    rows = odds_rows(parse_rows(NEW_CSV)[0], "f")
    by_timing = {r["timing"]: r for r in rows}
    assert set(by_timing) == {"pre_match", "closing"}
    pre = by_timing["pre_match"]
    assert pre["home_odds"] == 2.9
    assert pre["implied_home"] + pre["implied_draw"] + pre["implied_away"] == pytest.approx(1)
    assert pre["overround"] > 0


def test_bad_odds_are_skipped():
    row = {"B365H": "", "B365D": "3", "B365A": "4", "ZZH": "2", "ZZD": "2", "ZZA": "2"}
    assert odds_rows(row, "f") == []


def test_csv_load_writes_results_stats_and_odds(con, cache, fetcher):
    snaps = [cache.put("football_data_uk", "E0_9394.csv", OLD_CSV),
             cache.put("football_data_uk", "E0_2627.csv", NEW_CSV, last_modified=None)]
    result = FootballDataUkLoader(fetcher).load(con, snaps)
    assert con.execute("SELECT count(*) FROM match_results").fetchone()[0] == 2
    xg = con.execute(
        "SELECT xg FROM team_statistics WHERE team_id = 'liverpool'").fetchone()[0]
    assert xg == 1.05
    assert dict((c[0], c[1]) for c in result.checks)["teams_resolved"]
    # 1993-94 only has one match loaded, so it is flagged rather than trusted.
    assert con.execute(
        "SELECT is_complete FROM seasons WHERE season_id = '1993-94'").fetchone()[0] is False


# ---------- FPL ----------
def test_fixture_status_mapping():
    assert fixture_status({"finished": True}) == "FINISHED"
    assert fixture_status({"started": True}) == "IN_PLAY"
    assert fixture_status({"event": 3, "kickoff_time": "x"}) == "SCHEDULED"
    assert fixture_status({"event": None, "kickoff_time": None}) == "POSTPONED"


def fpl_snaps(cache):
    boot, fixtures = fpl_payloads()
    return [cache.put("fpl", "bootstrap-static.json", boot),
            cache.put("fpl", "fixtures.json", fixtures)]


def test_fpl_load(con, cache, fetcher):
    FplLoader(fetcher).load(con, fpl_snaps(cache))
    assert con.execute("SELECT count(*) FROM players").fetchone()[0] == 2
    assert con.execute("SELECT status FROM fixtures ORDER BY matchday").fetchall() == [
        ("FINISHED",), ("SCHEDULED",)]
    # Price is stored as a game price and goes nowhere near market values.
    assert con.execute("SELECT max(fpl_price) FROM player_statistics").fetchone()[0] == 8.5
    assert con.execute("SELECT count(*) FROM player_market_values").fetchone()[0] == 0
    assert con.execute("SELECT status, news FROM injury_records").fetchone() == ("i", "Knee injury")
    top = con.execute(
        "SELECT team_id, points FROM league_standings ORDER BY position LIMIT 1").fetchone()
    assert top == ("arsenal", 3)


def test_fpl_player_leaving_loses_current_club_but_keeps_history(con, cache, fetcher):
    loader = FplLoader(fetcher)
    loader.load(con, fpl_snaps(cache))
    boot = json.loads(fpl_payloads()[0])
    boot["elements"] = boot["elements"][:1]
    snaps = fpl_snaps(cache)
    loader.load(con, [cache.put("fpl", "bootstrap-static.json", json.dumps(boot).encode()), snaps[1]])
    assert con.execute(
        "SELECT count(*) FROM players WHERE current_team_id IS NULL").fetchone()[0] == 1
    assert con.execute("SELECT count(*) FROM player_statistics").fetchone()[0] == 2


def test_fpl_schema_change_is_rejected(con, cache, fetcher):
    snaps = [cache.put("fpl", "bootstrap-static.json", b'{"teams": []}'),
             cache.put("fpl", "fixtures.json", b"[]")]
    with pytest.raises(ValueError):
        FplLoader(fetcher).load(con, snaps)


def test_fpl_history_uses_season_totals(con, cache, fetcher):
    FplLoader(fetcher).load(con, fpl_snaps(cache))
    bundle = {"1001": [{"season_name": "2024/25", "minutes": 1000, "goals_scored": 4,
                        "expected_goals": "3.1"}]}
    snap = cache.put("fpl_history", "history_past.json", json.dumps(bundle).encode())
    FplHistoryLoader(fetcher).load(con, [snap])
    row = con.execute(
        "SELECT season_id, xg FROM player_statistics WHERE source_id = 'fpl_history'").fetchone()
    assert row == ("2024-25", 3.1)


# ---------- football-data.org ----------
def test_football_data_org_needs_key(fetcher, monkeypatch):
    monkeypatch.setattr("app.data.loaders.football_data_org.get_settings",
                        lambda: type("S", (), {"football_data_api_key": ""})())
    assert "not set" in FootballDataOrgLoader(fetcher).unavailable_reason()


def test_football_data_org_load(con, cache, fetcher):
    season = {"startDate": "2026-08-14"}
    matches = {"matches": [{
        "id": 7, "season": season, "utcDate": "2026-08-15T14:00:00Z", "status": "FINISHED",
        "matchday": 1, "homeTeam": {"id": 57, "name": "Arsenal FC"},
        "awayTeam": {"id": 66, "name": "Manchester United FC"},
        "score": {"winner": "HOME_TEAM", "fullTime": {"home": 2, "away": 1}},
    }]}
    table = {"season": season, "standings": [{"type": "TOTAL", "table": [{
        "position": 1, "team": {"id": 57, "name": "Arsenal FC"}, "playedGames": 1, "won": 1,
        "draw": 0, "lost": 0, "points": 3, "goalsFor": 2, "goalsAgainst": 1, "goalDifference": 1,
    }]}]}
    snaps = [cache.put("football_data_org", "matches.json", json.dumps(matches).encode()),
             cache.put("football_data_org", "standings.json", json.dumps(table).encode())]
    FootballDataOrgLoader(fetcher).load(con, snaps)
    assert con.execute("SELECT result FROM match_results").fetchone()[0] == "H"
    assert con.execute(
        "SELECT source_id, points FROM league_standings").fetchone() == ("football_data_org", 3)


# ---------- Understat ----------
def test_understat_maintenance_page_is_detected_despite_http_200():
    assert not site_is_up(b"<html>We will come back soon</html>")
    assert site_is_up(b"<html>teamsData</html>")


@respx.mock
def test_understat_down_without_cache_reports_unavailable(fetcher):
    respx.get("https://understat.com/league/EPL").mock(
        return_value=httpx.Response(200, content=b"We will come back soon"))
    with pytest.raises(SourceUnavailableError):
        UnderstatLoader(fetcher).fetch()


# ---------- Transfermarkt ----------
def gz(text: str) -> bytes:
    return gzip.compress(text.encode())


def test_transfermarkt_links_by_birth_date_and_keeps_historic_club(con, cache, fetcher):
    FplLoader(fetcher).load(con, fpl_snaps(cache))
    files = {
        "clubs": 'club_id,name,domestic_competition_id\n11,Arsenal FC,GB1\n',
        "players": (
            "player_id,name,first_name,last_name,date_of_birth,position,sub_position,foot,"
            "height_in_cm,country_of_citizenship,current_club_id,"
            "current_club_domestic_competition_id,last_season\n"
            "501,Ada Test,Ada,Test,2000-01-02 00:00:00,Attack,Centre-Forward,left,180,England,"
            "11,GB1,2026\n"
            "502,Old Timer,Old,Timer,1980-01-01 00:00:00,Attack,Centre-Forward,left,180,England,"
            "99,XX1,2015\n"
        ),
        "player_valuations": (
            "player_id,date,market_value_in_eur,current_club_name,current_club_id,"
            "player_club_domestic_competition_id\n"
            "501,2024-01-01,1000000,Hull City,3008,GB1\n"
            "501,2026-01-01,5000000,Arsenal FC,11,GB1\n"
            "502,2013-01-01,200000,Hull City,3008,GB1\n"
        ),
        "transfers": (
            "player_id,transfer_date,transfer_season,from_club_id,to_club_id,from_club_name,"
            "to_club_name,transfer_fee,market_value_in_eur,player_name\n"
            "501,2025-07-01,25/26,3008,11,Hull City,Arsenal FC,4000000,3000000,Ada Test\n"
            "501,2030-06-30,29/30,11,3008,Arsenal FC,Hull City,0,0,Ada Test\n"
        ),
        "appearances": (
            "appearance_id,game_id,player_id,player_club_id,player_current_club_id,date,"
            "player_name,competition_id,yellow_cards,red_cards,goals,assists,minutes_played\n"
            "1_501,1,501,11,11,2026-02-01,Ada Test,GB1,0,0,1,0,90\n"
        ),
    }
    snaps = [cache.put("transfermarkt", f"{k}.csv.gz", gz(v)) for k, v in files.items()]
    TransfermarktLoader(fetcher).load(con, snaps)

    ada = con.execute(
        """SELECT p.player_id, p.sub_position, p.current_team_id FROM players p
           JOIN player_source_ids s USING (player_id) WHERE s.source_id = 'transfermarkt'
           AND s.external_id = '501'""").fetchone()
    assert ada[1] == "Centre-Forward" and ada[2] == "arsenal"
    clubs = con.execute(
        """SELECT club_name FROM player_market_values WHERE player_id = ?
           ORDER BY valuation_date""", [ada[0]]).fetchall()
    assert clubs == [("Hull City",), ("Arsenal FC",)]  # history, not the current club
    # A future-dated contract row in the dump must not become a transfer.
    assert con.execute("SELECT count(*) FROM player_transfers").fetchone()[0] == 1
    # A historic PL player gets a canonical record with no current club.
    assert con.execute(
        "SELECT current_team_id FROM players WHERE name = 'Old Timer'").fetchone()[0] is None


# ---------- runner ----------
class FakeLoader(Loader):
    source_id = "fake"
    name = "Fake"
    description = "test"

    def __init__(self, cache, fetch_result=None, boom=None, load_boom=False):
        self.cache, self.result, self.boom, self.load_boom = cache, fetch_result, boom, load_boom

    def fetch(self):
        if self.boom:
            raise self.boom
        return self.result

    def load(self, con, snapshots):
        con.execute("INSERT INTO teams VALUES ('fake-team', 'Fake', 'F', 'FAK')")
        if self.load_boom:
            raise ValueError("bad payload")
        return LoadResult(records=1, coverage="c", checks=[("c1", True, "ok")])


def test_runner_records_success_and_skips_unchanged(con, cache):
    snap = cache.put("fake", "k", b"x")
    loader = FakeLoader(cache, [snap])
    register_sources(con, [loader])
    assert _run(con, loader).status == "ok"
    con.execute("DELETE FROM teams WHERE team_id = 'fake-team'")
    assert _run(con, loader).status == "unchanged"
    assert con.execute(
        "SELECT count(*) FROM teams WHERE team_id = 'fake-team'").fetchone()[0] == 0


def test_runner_rolls_back_a_bad_payload(con, cache):
    loader = FakeLoader(cache, [cache.put("fake", "k", b"x")], load_boom=True)
    register_sources(con, [loader])
    assert _run(con, loader).status == "failed"
    assert con.execute(
        "SELECT count(*) FROM teams WHERE team_id = 'fake-team'").fetchone()[0] == 0
    assert con.execute("SELECT count(*) FROM ingestion_errors").fetchone()[0] == 1


def test_runner_survives_a_dead_source(con, cache):
    loader = FakeLoader(cache, boom=SourceUnavailableError("down"))
    register_sources(con, [loader])
    report = _run(con, loader)
    assert report.status == "unavailable" and report.error == "down"
    assert con.execute(
        "SELECT last_attempt_ok, last_error FROM source_registry").fetchone() == (False, "down")


def test_runner_marks_cached_fallback_as_not_live(con, cache):
    from dataclasses import replace
    snap = cache.put("fake", "k", b"x")
    loader = FakeLoader(cache, [snap])
    register_sources(con, [loader])
    _run(con, loader)
    loader.result = [replace(snap, from_cache=True, error="down")]
    assert _run(con, loader).status == "cached"
    assert con.execute("SELECT last_attempt_ok FROM source_registry").fetchone()[0] is False


def test_migrations_run_once(con):
    assert migrate(con) == []
