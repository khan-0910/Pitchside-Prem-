"""football-data.co.uk season CSVs: results, match stats and bookmaker odds since 1993."""

import csv
import io
from datetime import UTC, date, datetime
from email.utils import parsedate_to_datetime

import duckdb
import pandas as pd

from app.core.exceptions import SourceUnavailableError
from app.data.cache import Snapshot
from app.data.loaders.base import Loader, LoadResult
from app.data.matching.teams import TeamResolver
from app.data.normalizers.seasons import (
    csv_code,
    expected_matches,
    season_id,
    season_start_year,
)
from app.database.repositories.football import refresh_season_coverage, upsert

SOURCE = "football_data_uk"
BASE_URL = "https://www.football-data.co.uk/mmz4281"
FIRST_SEASON = 1993
# The site adds and drops bookmakers by year. Unknown prefixes are ignored on purpose.
BOOKMAKERS = {
    "B365", "BW", "BS", "GB", "IW", "LB", "PS", "SB", "SJ", "SO", "SY", "VC", "WH", "P",
    "Max", "Avg", "BbMx", "BbAv", "BFD", "BMGM", "BV", "CL", "PP", "SKB", "BFE",
}


def parse_rows(content: bytes) -> list[dict[str, str]]:
    """Tolerates BOMs, latin-1 files, trailing blanks and rows longer than the header."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    reader = csv.reader(io.StringIO(text))
    header = [h.strip() for h in next(reader, [])]
    if "HomeTeam" not in header or "AwayTeam" not in header:
        raise ValueError("CSV has no HomeTeam/AwayTeam columns")
    rows = []
    for values in reader:
        row = dict(zip(header, (v.strip() for v in values), strict=False))
        if row.get("HomeTeam") and row.get("AwayTeam"):
            rows.append(row)
    return rows


def parse_date(value: str) -> date:
    fmt = "%d/%m/%Y" if len(value.rsplit("/", 1)[-1]) == 4 else "%d/%m/%y"
    return datetime.strptime(value, fmt).date()


def _int(value: str | None) -> int | None:
    try:
        return int(float(value)) if value else None
    except ValueError:
        return None


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value else None
    except ValueError:
        return None


def odds_rows(row: dict[str, str], fixture_id: str) -> list[dict]:
    """All 1X2 prices in a row. Original odds kept; implied probabilities exclude margin."""
    out = []
    for column in row:
        if not column.endswith("H"):
            continue
        prefix = column[:-1]
        closing = prefix.endswith("C") and prefix[:-1] in BOOKMAKERS
        book = prefix[:-1] if closing else prefix
        if book not in BOOKMAKERS:
            continue
        h, d, a = (_float(row.get(prefix + s)) for s in "HDA")
        if not h or not d or not a or min(h, d, a) <= 1.0:
            continue
        total = 1 / h + 1 / d + 1 / a
        out.append({
            "fixture_id": fixture_id, "bookmaker": book, "market": "1X2",
            "timing": "closing" if closing else "pre_match", "source_id": SOURCE,
            "home_odds": h, "draw_odds": d, "away_odds": a,
            "implied_home": (1 / h) / total, "implied_draw": (1 / d) / total,
            "implied_away": (1 / a) / total, "overround": total - 1,
        })
    return out


class FootballDataUkLoader(Loader):
    source_id = SOURCE
    name = "football-data.co.uk"
    description = "Historical results, match statistics, xG (2026-27 on) and bookmaker odds"
    ttl_hours = 48
    stale_after_hours = 24 * 14

    def fetch(self) -> list[Snapshot]:
        current = season_start_year(datetime.now(UTC))
        snapshots = []
        for year in range(FIRST_SEASON, current + 1):
            key = f"E0_{csv_code(year)}.csv"
            cached = self.fetcher.cache.get(SOURCE, key)
            # Finished seasons never change, so they are fetched once.
            if cached and year < current:
                snapshots.append(cached)
                continue
            try:
                snapshots.append(
                    self.fetcher.fetch(SOURCE, key, f"{BASE_URL}/{csv_code(year)}/E0.csv")
                )
            except SourceUnavailableError:
                if year == current:  # no file until the season starts
                    continue
                raise
        return snapshots

    def load(self, con: duckdb.DuckDBPyConnection, snapshots: list[Snapshot]) -> LoadResult:
        resolver = TeamResolver(con)
        fixtures, results, stats, odds = [], [], [], []
        bad_dates = unresolved = 0
        seasons: list[tuple[str, int]] = []
        last_match: date | None = None

        for snap in snapshots:
            code = snap.key.split("_")[1].split(".")[0]
            start = int(code[:2])
            start += 1900 if start >= 90 else 2000
            sid = season_id(start)
            seasons.append((sid, start))
            for row in parse_rows(snap.read_bytes()):
                try:
                    day = parse_date(row["Date"])
                except (KeyError, ValueError):
                    bad_dates += 1
                    continue
                home = resolver.resolve(SOURCE, row["HomeTeam"], row["HomeTeam"])
                away = resolver.resolve(SOURCE, row["AwayTeam"], row["AwayTeam"])
                if not home or not away:
                    unresolved += 1
                    continue
                fixture_id = f"{sid}:{home}:{away}"
                fixtures.append({
                    "fixture_id": fixture_id, "season_id": sid, "match_date": day,
                    "home_team_id": home, "away_team_id": away, "status": "FINISHED",
                    "source_id": SOURCE,
                })
                hg, ag = _int(row.get("FTHG")), _int(row.get("FTAG"))
                if hg is not None and ag is not None:
                    results.append({
                        "fixture_id": fixture_id, "source_id": SOURCE, "match_date": day,
                        "home_goals": hg, "away_goals": ag,
                        "ht_home_goals": _int(row.get("HTHG")),
                        "ht_away_goals": _int(row.get("HTAG")),
                        "result": row.get("FTR"), "referee": row.get("Referee"),
                    })
                    last_match = max(last_match or day, day)
                for side, team, prefix in (("H", home, True), ("A", away, False)):
                    stats.append({
                        "fixture_id": fixture_id, "team_id": team, "source_id": SOURCE,
                        "is_home": prefix, "xg": _float(row.get(f"{side}xG")),
                        "shots": _int(row.get(f"{side}S")),
                        "shots_on_target": _int(row.get(f"{side}ST")),
                        "fouls": _int(row.get(f"{side}F")),
                        "corners": _int(row.get(f"{side}C")),
                        "yellow_cards": _int(row.get(f"{side}Y")),
                        "red_cards": _int(row.get(f"{side}R")),
                    })
                odds.extend(odds_rows(row, fixture_id))

        # FPL owns live fields for the current season, so never overwrite an existing fixture.
        upsert(con, "fixtures", pd.DataFrame(fixtures), mode="IGNORE")
        upsert(con, "match_results", pd.DataFrame(results))
        upsert(con, "team_statistics", pd.DataFrame(stats))
        upsert(con, "bookmaker_odds", pd.DataFrame(odds))
        for sid, start in seasons:
            refresh_season_coverage(con, sid, start, expected_matches(start))

        current_key = f"E0_{csv_code(season_start_year(datetime.now(UTC)))}.csv"
        current = next((s for s in snapshots if s.key == current_key), None)
        upstream = (parsedate_to_datetime(current.last_modified)
                    if current and current.last_modified else None)
        incomplete = con.execute(
            "SELECT season_id FROM seasons WHERE NOT is_complete ORDER BY season_id"
        ).fetchall()
        return LoadResult(
            records=len(results) + len(odds),
            coverage=f"{seasons[0][0]} to {seasons[-1][0]}, {len(results)} matches, "
                     f"{len(odds)} odds lines",
            data_as_of=last_match, upstream_updated_at=upstream,
            checks=[
                ("dates_valid", bad_dates == 0, f"{bad_dates} unparseable dates"),
                ("teams_resolved", unresolved == 0, f"{unresolved} rows with unknown teams"),
                ("seasons_complete", len(incomplete) <= 1,
                 f"incomplete: {[r[0] for r in incomplete]}"),
            ],
        )
