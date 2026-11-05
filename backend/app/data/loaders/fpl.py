"""Public FPL API: live fixtures, scores, players, xG, prices, injury news.

FPL price is a game price in £m. It is stored as fpl_price and is never a market value.
"""

import json
from datetime import UTC, date, datetime

import duckdb
import pandas as pd

from app.core.exceptions import SourceUnavailableError
from app.data.cache import Snapshot
from app.data.loaders.base import Loader, LoadResult
from app.data.matching.players import canonical_player_id
from app.data.matching.teams import TeamResolver
from app.data.normalizers.seasons import expected_matches, season_id_for, season_start_year
from app.database.repositories.football import derive_standings, refresh_season_coverage, upsert

SOURCE = "fpl"
BASE_URL = "https://fantasy.premierleague.com/api"
POSITIONS = {1: "Goalkeeper", 2: "Defender", 3: "Midfielder", 4: "Forward"}
REQUIRED_KEYS = {"events", "teams", "elements"}


def _num(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fixture_status(f: dict) -> str:
    if f.get("finished") or f.get("finished_provisional"):
        return "FINISHED"
    if f.get("started"):
        return "IN_PLAY"
    # FPL clears the gameweek when a match is postponed with no new date.
    return "SCHEDULED" if f.get("event") and f.get("kickoff_time") else "POSTPONED"


def stat_row(e: dict) -> dict:
    return {
        "minutes": _num(e.get("minutes")), "starts": _num(e.get("starts")),
        "goals": _num(e.get("goals_scored")), "assists": _num(e.get("assists")),
        "xg": _num(e.get("expected_goals")), "xa": _num(e.get("expected_assists")),
        "xgc": _num(e.get("expected_goals_conceded")), "tackles": _num(e.get("tackles")),
        "cbi": _num(e.get("clearances_blocks_interceptions")),
        "recoveries": _num(e.get("recoveries")),
        "defensive_contribution": _num(e.get("defensive_contribution")),
        "clean_sheets": _num(e.get("clean_sheets")),
        "goals_conceded": _num(e.get("goals_conceded")), "saves": _num(e.get("saves")),
        "yellow_cards": _num(e.get("yellow_cards")), "red_cards": _num(e.get("red_cards")),
        "bonus": _num(e.get("bonus")), "bps": _num(e.get("bps")),
        "influence": _num(e.get("influence")), "creativity": _num(e.get("creativity")),
        "threat": _num(e.get("threat")), "ict_index": _num(e.get("ict_index")),
    }


class FplLoader(Loader):
    source_id = SOURCE
    name = "Fantasy Premier League API"
    description = "Current fixtures, scores, players, xG/xA, prices and injury news (unofficial)"
    ttl_hours = 6
    stale_after_hours = 48

    def fetch(self) -> list[Snapshot]:
        return [
            self.fetcher.fetch(SOURCE, "bootstrap-static.json", f"{BASE_URL}/bootstrap-static/"),
            self.fetcher.fetch(SOURCE, "fixtures.json", f"{BASE_URL}/fixtures/"),
        ]

    def load(self, con: duckdb.DuckDBPyConnection, snapshots: list[Snapshot]) -> LoadResult:
        boot = json.loads(snapshots[0].read_bytes())
        fixtures_raw = json.loads(snapshots[1].read_bytes())
        missing = REQUIRED_KEYS - set(boot)
        if missing or not boot["elements"]:
            raise ValueError(f"FPL schema changed, missing {sorted(missing)}")

        observed = snapshots[0].retrieved_at.date()
        first_deadline = datetime.fromisoformat(boot["events"][0]["deadline_time"])
        sid = season_id_for(first_deadline)
        start_year = season_start_year(first_deadline)

        resolver = TeamResolver(con)
        team_of: dict[int, str | None] = {
            t["id"]: resolver.resolve(SOURCE, str(t["code"]), t["name"]) for t in boot["teams"]
        }

        fix, ext, res = [], [], []
        last_played: date | None = None
        for f in fixtures_raw:
            home, away = team_of.get(f["team_h"]), team_of.get(f["team_a"])
            if not home or not away:
                continue
            fid = f"{sid}:{home}:{away}"
            kickoff = datetime.fromisoformat(f["kickoff_time"]) if f.get("kickoff_time") else None
            status = fixture_status(f)
            fix.append({
                "fixture_id": fid, "season_id": sid, "matchday": f.get("event"),
                "match_date": kickoff.date() if kickoff else None, "kickoff_utc": kickoff,
                "home_team_id": home, "away_team_id": away, "status": status,
                "source_id": SOURCE, "updated_at": snapshots[1].retrieved_at,
            })
            ext.append({"source_id": SOURCE, "external_id": str(f["id"]), "fixture_id": fid})
            if status == "FINISHED" and f.get("team_h_score") is not None and kickoff:
                hg, ag = f["team_h_score"], f["team_a_score"]
                res.append({
                    "fixture_id": fid, "source_id": SOURCE, "match_date": kickoff.date(),
                    "home_goals": hg, "away_goals": ag,
                    "result": "H" if hg > ag else "A" if ag > hg else "D",
                })
                last_played = max(last_played or kickoff.date(), kickoff.date())

        upsert(con, "fixtures", pd.DataFrame(fix))
        upsert(con, "fixture_source_ids", pd.DataFrame(ext))
        upsert(con, "match_results", pd.DataFrame(res))

        players, ids, stats, injuries, names = [], [], [], [], []
        for e in boot["elements"]:
            code = str(e["code"])
            pid = canonical_player_id(SOURCE, code)
            display = f"{e['first_name']} {e['second_name']}".strip()
            names.append(pid)
            players.append({
                "player_id": pid, "name": e.get("known_name") or display,
                "date_of_birth": e.get("birth_date"),
                "position": POSITIONS.get(e["element_type"]),
                "current_team_id": team_of.get(e["team"]),
                "availability": e.get("status"),
                "chance_next_round": e.get("chance_of_playing_next_round"),
            })
            ids.append({"source_id": SOURCE, "external_id": code, "player_id": pid,
                        "source_name": display, "confidence": 1.0, "method": "source_id"})
            stats.append({
                "player_id": pid, "season_id": sid, "source_id": SOURCE,
                "observation_date": observed, "team_id": team_of.get(e["team"]),
                "fpl_price": e["now_cost"] / 10 if e.get("now_cost") else None, **stat_row(e),
            })
            if e.get("status") != "a" or e.get("news"):
                injuries.append({
                    "player_id": pid, "source_id": SOURCE, "status": e.get("status"),
                    "news": e.get("news") or "", "news_added": e.get("news_added"),
                    "chance_next_round": e.get("chance_of_playing_next_round"),
                })

        df = pd.DataFrame(players)
        con.register("_p", df)
        con.execute(
            """INSERT INTO players (player_id, name, date_of_birth, position, current_team_id,
                                  availability, chance_next_round)
               SELECT player_id, name, CAST(date_of_birth AS DATE), position, current_team_id,
                      availability, CAST(chance_next_round AS INTEGER)
               FROM _p
               ON CONFLICT (player_id) DO UPDATE SET
                 name = excluded.name, position = excluded.position,
                 current_team_id = excluded.current_team_id,
                 availability = excluded.availability,
                 chance_next_round = excluded.chance_next_round,
                 date_of_birth = coalesce(excluded.date_of_birth, players.date_of_birth),
                 updated_at = now()"""
        )
        con.unregister("_p")
        # Anyone who left the league is no longer at a current PL club.
        con.execute(
            """UPDATE players SET current_team_id = NULL WHERE current_team_id IS NOT NULL
               AND player_id NOT IN (SELECT unnest(?))""", [names]
        )
        upsert(con, "player_source_ids", pd.DataFrame(ids), mode="IGNORE")
        upsert(con, "player_statistics", pd.DataFrame(stats))
        if injuries:
            inj = pd.DataFrame(injuries)
            inj["news_added"] = pd.to_datetime(inj["news_added"], utc=True)
            upsert(con, "injury_records", inj, mode="IGNORE")

        refresh_season_coverage(con, sid, start_year, expected_matches(start_year))
        derive_standings(con, sid, observed)

        finished = sum(1 for f in fix if f["status"] == "FINISHED")
        unresolved = sum(1 for t in team_of.values() if t is None)
        return LoadResult(
            records=len(fix) + len(players),
            coverage=f"{sid}: {finished}/{len(fix)} fixtures played, {len(players)} players",
            data_as_of=last_played,
            checks=[
                ("teams_resolved", unresolved == 0, f"{unresolved} unknown FPL teams"),
                ("twenty_teams", len(team_of) == 20, f"{len(team_of)} teams"),
                ("fixture_count", len(fix) == 380, f"{len(fix)} fixtures"),
            ],
        )


class FplHistoryLoader(Loader):
    """Past-season player totals. One request per player, so it runs weekly."""

    source_id = "fpl_history"
    name = "FPL player history"
    description = "Season-by-season player totals, including xG since 2022-23"
    ttl_hours = 24 * 8
    stale_after_hours = 24 * 30
    bundle_key = "history_past.json"

    def fetch(self) -> list[Snapshot]:
        cache = self.fetcher.cache
        boot = cache.get(SOURCE, "bootstrap-static.json")
        if boot is None:
            raise SourceUnavailableError("run the fpl source first")
        elements = json.loads(boot.read_bytes())["elements"]
        previous = cache.get(self.source_id, self.bundle_key)
        bundle: dict[str, list] = json.loads(previous.read_bytes()) if previous else {}
        failures = 0
        for e in elements:
            url = f"{BASE_URL}/element-summary/{e['id']}/"
            try:
                response = self.fetcher._get(url, {})
                response.raise_for_status()
                bundle[str(e["code"])] = response.json().get("history_past", [])
            except Exception:  # noqa: BLE001, S110 - one bad player must not lose the rest
                failures += 1
        if failures > len(elements) / 2 and previous:
            return [Snapshot(previous.source_id, previous.key, previous.path, previous.sha256,
                             previous.retrieved_at, from_cache=True,
                             error=f"{failures} player requests failed")]
        return [cache.put(self.source_id, self.bundle_key, json.dumps(bundle).encode())]

    def load(self, con: duckdb.DuckDBPyConnection, snapshots: list[Snapshot]) -> LoadResult:
        bundle = json.loads(snapshots[0].read_bytes())
        rows = []
        for code, seasons in bundle.items():
            pid = canonical_player_id(SOURCE, code)
            for s in seasons:
                # "2024/25" -> "2024-25"; totals are as of that season's end.
                sid = s["season_name"].replace("/", "-")
                rows.append({
                    "player_id": pid, "season_id": sid, "source_id": self.source_id,
                    "observation_date": date(int(sid[:4]) + 1, 6, 1), **stat_row(s),
                })
        upsert(con, "player_statistics", pd.DataFrame(rows))
        seasons_seen = sorted({r["season_id"] for r in rows})
        return LoadResult(
            records=len(rows),
            coverage=f"{seasons_seen[0]} to {seasons_seen[-1]}, {len(bundle)} players"
            if rows else "no rows",
            data_as_of=snapshots[0].retrieved_at.astimezone(UTC).date(),
            checks=[("has_rows", bool(rows), f"{len(rows)} player-seasons")],
        )
