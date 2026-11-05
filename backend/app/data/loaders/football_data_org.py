"""football-data.org v4. Needs a free key. Adds official standings with point deductions."""

import json
from datetime import UTC, date, datetime

import duckdb
import pandas as pd

from app.config import get_settings
from app.data.cache import Snapshot
from app.data.loaders.base import Loader, LoadResult
from app.data.matching.teams import TeamResolver
from app.data.normalizers.seasons import season_id, season_start_year
from app.database.repositories.football import upsert

SOURCE = "football_data_org"
BASE_URL = "https://api.football-data.org/v4/competitions/PL"
STATUS_MAP = {
    "SCHEDULED": "SCHEDULED", "TIMED": "SCHEDULED", "IN_PLAY": "IN_PLAY", "PAUSED": "IN_PLAY",
    "FINISHED": "FINISHED", "AWARDED": "FINISHED", "POSTPONED": "POSTPONED",
    "SUSPENDED": "POSTPONED", "CANCELLED": "POSTPONED",
}


class FootballDataOrgLoader(Loader):
    source_id = SOURCE
    name = "football-data.org"
    description = "Official-style fixtures, results and standings (free key required)"
    requires_key = True
    ttl_hours = 12
    stale_after_hours = 72

    def unavailable_reason(self) -> str | None:
        return None if get_settings().football_data_api_key else "FOOTBALL_DATA_API_KEY is not set"

    def fetch(self) -> list[Snapshot]:
        headers = {"X-Auth-Token": get_settings().football_data_api_key}
        year = season_start_year(datetime.now(UTC))
        return [
            self.fetcher.fetch(SOURCE, "matches.json", f"{BASE_URL}/matches?season={year}", headers),
            self.fetcher.fetch(SOURCE, "standings.json", f"{BASE_URL}/standings", headers),
        ]

    def load(self, con: duckdb.DuckDBPyConnection, snapshots: list[Snapshot]) -> LoadResult:
        matches = json.loads(snapshots[0].read_bytes())
        standings = json.loads(snapshots[1].read_bytes())
        if "matches" not in matches:
            raise ValueError("football-data.org matches payload has no 'matches'")

        resolver = TeamResolver(con)
        def team(t: dict) -> str | None:
            return resolver.resolve(SOURCE, str(t["id"]), t["name"])

        fix, ext, res = [], [], []
        last: date | None = None
        for m in matches["matches"]:
            home, away = team(m["homeTeam"]), team(m["awayTeam"])
            if not home or not away:
                continue
            sid = season_id(int(m["season"]["startDate"][:4]))
            kickoff = datetime.fromisoformat(m["utcDate"].replace("Z", "+00:00"))
            status = STATUS_MAP.get(m["status"], "SCHEDULED")
            fid = f"{sid}:{home}:{away}"
            fix.append({
                "fixture_id": fid, "season_id": sid, "matchday": m.get("matchday"),
                "match_date": kickoff.date(), "kickoff_utc": kickoff, "home_team_id": home,
                "away_team_id": away, "status": status, "source_id": SOURCE,
            })
            ext.append({"source_id": SOURCE, "external_id": str(m["id"]), "fixture_id": fid})
            ft = (m.get("score") or {}).get("fullTime") or {}
            if status == "FINISHED" and ft.get("home") is not None:
                res.append({
                    "fixture_id": fid, "source_id": SOURCE, "match_date": kickoff.date(),
                    "home_goals": ft["home"], "away_goals": ft["away"],
                    "result": {"HOME_TEAM": "H", "AWAY_TEAM": "A", "DRAW": "D"}.get(
                        m["score"].get("winner"), None),
                })
                last = max(last or kickoff.date(), kickoff.date())

        upsert(con, "fixtures", pd.DataFrame(fix))
        upsert(con, "fixture_source_ids", pd.DataFrame(ext))
        upsert(con, "match_results", pd.DataFrame(res))

        table = next((t for t in standings.get("standings", []) if t.get("type") == "TOTAL"), None)
        rows = []
        if table:
            sid = season_id(int(standings["season"]["startDate"][:4]))
            for r in table["table"]:
                team_id = team(r["team"])
                if team_id:
                    rows.append({
                        "season_id": sid, "team_id": team_id, "source_id": SOURCE,
                        "snapshot_date": snapshots[1].retrieved_at.date(),
                        "position": r["position"], "played": r["playedGames"], "won": r["won"],
                        "drawn": r["draw"], "lost": r["lost"], "goals_for": r["goalsFor"],
                        "goals_against": r["goalsAgainst"],
                        "goal_difference": r["goalDifference"], "points": r["points"],
                    })
            upsert(con, "league_standings", pd.DataFrame(rows))

        return LoadResult(
            records=len(fix) + len(rows),
            coverage=f"{len(fix)} fixtures, {len(res)} results, {len(rows)} table rows",
            data_as_of=last,
            checks=[("standings_present", len(rows) == 20, f"{len(rows)} table rows")],
        )
