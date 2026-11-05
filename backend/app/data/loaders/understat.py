"""Understat team xG. Optional, and never needed at startup.

Probe first: the site answers HTTP 200 with a maintenance page when it is down, so the
status code proves nothing. soccerdata is imported only if the site is really up.
"""

import importlib
from datetime import UTC, datetime
from typing import Any

import duckdb
import pandas as pd

from app.core.exceptions import SourceUnavailableError
from app.data.cache import Snapshot
from app.data.loaders.base import Loader, LoadResult
from app.data.matching.teams import TeamResolver
from app.data.normalizers.seasons import season_id, season_start_year
from app.database.repositories.football import upsert

SOURCE = "understat"
PROBE_URL = "https://understat.com/league/EPL"
MAINTENANCE_MARKERS = (b"We will come back soon", b"/css/errors.css")


def site_is_up(body: bytes) -> bool:
    return not any(marker in body for marker in MAINTENANCE_MARKERS)


class UnderstatLoader(Loader):
    source_id = SOURCE
    name = "Understat"
    description = "Team expected goals per match, via the soccerdata package (optional)"
    ttl_hours = 48
    stale_after_hours = 24 * 14

    def fetch(self) -> list[Snapshot]:
        response = self.fetcher.client.get(PROBE_URL)
        if response.status_code != 200 or not site_is_up(response.content):
            cached = self.fetcher.cache.get(SOURCE, "team_match.csv")
            if cached:
                return [Snapshot(cached.source_id, cached.key, cached.path, cached.sha256,
                                 cached.retrieved_at, from_cache=True,
                                 error="site shows a maintenance page")]
            raise SourceUnavailableError("understat.com shows a maintenance page")
        try:
            soccerdata: Any = importlib.import_module("soccerdata")
        except ImportError as exc:
            raise SourceUnavailableError("soccerdata package is not installed") from exc
        year = season_start_year(datetime.now(UTC))
        reader = soccerdata.Understat(leagues="ENG-Premier League", seasons=[year])
        frame = reader.read_team_match_stats().reset_index()
        return [self.fetcher.cache.put(SOURCE, "team_match.csv", frame.to_csv(index=False).encode())]

    def load(self, con: duckdb.DuckDBPyConnection, snapshots: list[Snapshot]) -> LoadResult:
        df = pd.read_csv(snapshots[0].path)
        needed = {"season", "home_team", "away_team", "home_xg", "away_xg"}
        if not needed <= set(df.columns):
            raise ValueError(f"Understat schema changed, missing {sorted(needed - set(df.columns))}")
        resolver = TeamResolver(con)
        rows = []
        for r in df.itertuples():
            home = resolver.resolve(SOURCE, r.home_team, r.home_team)
            away = resolver.resolve(SOURCE, r.away_team, r.away_team)
            if not home or not away or pd.isna(r.home_xg):
                continue
            start = season_start_year(datetime.now(UTC))
            fid = f"{season_id(start)}:{home}:{away}"
            rows.append({"fixture_id": fid, "team_id": home, "source_id": SOURCE,
                         "is_home": True, "xg": float(r.home_xg)})
            rows.append({"fixture_id": fid, "team_id": away, "source_id": SOURCE,
                         "is_home": False, "xg": float(r.away_xg)})
        upsert(con, "team_statistics", pd.DataFrame(rows))
        return LoadResult(records=len(rows), coverage=f"{len(rows) // 2} matches with xG",
                          checks=[("has_rows", bool(rows), f"{len(rows)} team-matches")])
