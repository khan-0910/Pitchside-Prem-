"""Point-in-time features for market value. Everything is read strictly before the valuation date.

Contract length is left out on purpose: the dump only holds today's contract, which would leak.
"""

import math
from bisect import bisect_left
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import duckdb
import numpy as np
import pandas as pd

from app.models.similarity.engine import GROUP_NAMES, position_group

TRAIN_FROM = date(2013, 7, 1)
GROUPS = list(GROUP_NAMES)
PERFORMANCE = ["age", "age_sq", "min_365", "apps_365", "g90_365", "a90_365", "pl_share_365", "min_prev",
               "ga90_prev", "xg90_last", "xa90_last", "club_mean_log"] + [f"is_{g}" for g in GROUPS]
HISTORY = ["last_value_log", "last_value_age_days", "value_trend"]
ALL_FEATURES = PERFORMANCE + HISTORY


@dataclass
class Appearances:
    dates: list[date]
    minutes: np.ndarray
    goals: np.ndarray
    assists: np.ndarray
    league_minutes: np.ndarray
    count: np.ndarray


def _windows(a: Appearances | None, day: date) -> dict[str, float]:
    empty = {"min_365": 0.0, "apps_365": 0.0, "g90_365": math.nan, "a90_365": math.nan,
             "pl_share_365": math.nan, "min_prev": 0.0, "ga90_prev": math.nan}
    if a is None:
        return empty
    end = bisect_left(a.dates, day)
    mid = bisect_left(a.dates, day - timedelta(days=365))
    start = bisect_left(a.dates, day - timedelta(days=730))
    minutes = a.minutes[end] - a.minutes[mid]
    old = a.minutes[mid] - a.minutes[start]
    out = dict(empty)
    out["min_365"], out["min_prev"] = float(minutes), float(old)
    out["apps_365"] = float(a.count[end] - a.count[mid])
    if minutes > 0:
        out["g90_365"] = float((a.goals[end] - a.goals[mid]) / (minutes / 90))
        out["a90_365"] = float((a.assists[end] - a.assists[mid]) / (minutes / 90))
        out["pl_share_365"] = float((a.league_minutes[end] - a.league_minutes[mid]) / minutes)
    if old > 0:
        ga = (a.goals[mid] - a.goals[start]) + (a.assists[mid] - a.assists[start])
        out["ga90_prev"] = float(ga / (old / 90))
    return out


def _value_history(dates: list[date], logs: list[float], day: date) -> dict[str, float] | None:
    i = bisect_left(dates, day)
    if i == 0:
        return None  # no earlier valuation, so nothing to carry forward
    year_ago = bisect_left(dates, day - timedelta(days=365))
    return {
        "last_value_log": logs[i - 1],
        "last_value_age_days": float((day - dates[i - 1]).days),
        "value_trend": logs[i - 1] - logs[max(year_ago - 1, 0)],
    }


class ValuationData:
    def __init__(self, con: duckdb.DuckDBPyConnection):
        self.players = {r[0]: r[1:] for r in con.execute(
            "SELECT player_id, date_of_birth, sub_position, position FROM players").fetchall()}
        rows = con.execute(
            """SELECT player_id, game_date, sum(minutes), sum(goals), sum(assists),
                      sum(CASE WHEN competition_id = 'GB1' THEN minutes ELSE 0 END), count(*)
               FROM player_appearances GROUP BY 1, 2 ORDER BY 1, 2"""
        ).df()
        self.apps: dict[str, Appearances] = {}
        for player, group in rows.groupby("player_id", sort=False):
            cols = group.iloc[:, 2:].fillna(0).to_numpy(dtype=float)
            cum = np.vstack([np.zeros(5), np.cumsum(cols, axis=0)])
            self.apps[player] = Appearances(
                [d.date() for d in group["game_date"]], cum[:, 0], cum[:, 1], cum[:, 2], cum[:, 3], cum[:, 4])

        self.value_rows = con.execute(
            """SELECT player_id, valuation_date, value_eur, tm_club_id, competition_id
               FROM player_market_values WHERE value_eur > 0 ORDER BY valuation_date"""
        ).fetchall()
        self.value_dates: dict[str, list[date]] = defaultdict(list)
        self.value_logs: dict[str, list[float]] = defaultdict(list)
        self.club_dates: dict[str, list[date]] = defaultdict(list)
        self.club_logs: dict[str, list[float]] = defaultdict(lambda: [0.0])
        for player, day, value, club, _ in self.value_rows:
            self.value_dates[player].append(day)
            self.value_logs[player].append(math.log1p(value))
            self.club_dates[club].append(day)
            self.club_logs[club].append(self.club_logs[club][-1] + math.log1p(value))

        self.fpl_seasons: dict[str, list[tuple[date, float, float, float]]] = defaultdict(list)
        for player, day, minutes, xg, xa in con.execute(
            """SELECT player_id, observation_date, minutes, xg, xa FROM player_statistics
               WHERE source_id = 'fpl_history' AND minutes > 0 AND season_id >= '2022-23'
               ORDER BY observation_date"""
        ).fetchall():
            self.fpl_seasons[player].append((day, minutes, xg or 0.0, xa or 0.0))

    def club_mean(self, club: str | None, day: date) -> float:
        dates = self.club_dates.get(club or "", [])
        end, start = bisect_left(dates, day), bisect_left(dates, day - timedelta(days=365))
        if end <= start:
            return math.nan
        logs = self.club_logs[club or ""]
        return (logs[end] - logs[start]) / (end - start)

    def xg_rates(self, player: str, day: date) -> tuple[float, float]:
        seasons = [s for s in self.fpl_seasons.get(player, []) if s[0] < day]
        if not seasons:
            return math.nan, math.nan
        _, minutes, xg, xa = seasons[-1]
        return xg / (minutes / 90), xa / (minutes / 90)

    def base(self, player: str, day: date, club: str | None) -> dict[str, float] | None:
        history = _value_history(self.value_dates[player], self.value_logs[player], day)
        if history is None:
            return None
        dob, sub, pos = self.players.get(player, (None, None, None))
        age = (day - dob).days / 365.25 if dob else math.nan
        group = position_group(sub, pos)
        xg90, xa90 = self.xg_rates(player, day)
        return {"age": age, "age_sq": age * age, "xg90_last": xg90, "xa90_last": xa90,
                "club_mean_log": self.club_mean(club, day), **history,
                **{f"is_{g}": float(group == g) for g in GROUPS}}


def build_training_frame(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    data = ValuationData(con)
    rows = []
    for player, day, value, club, _ in data.value_rows:
        if day < TRAIN_FROM:
            continue
        base = data.base(player, day, club)
        if base is None:
            continue
        window = _windows(data.apps.get(player), day)
        if window["min_365"] < 90:
            continue
        sub = data.players.get(player, (None, None, None))
        rows.append({"player_id": player, "valuation_date": day, "value_eur": value,
                     "position_group": position_group(sub[1], sub[2]), **base, **window})
    return pd.DataFrame(rows)


def build_current_frame(con: duckdb.DuckDBPyConnection, today: date | None = None) -> pd.DataFrame:
    """Today's feature row for each current PL player with a recorded value.

    The dump's appearances stop in June 2026, so the last 365 days are rebuilt from FPL totals:
    this season plus the unplayed share of last season. League-only, so pl_share is 1.
    """
    today = today or datetime.now(UTC).date()
    data = ValuationData(con)
    played_share = (con.execute(
        """SELECT count(*) FILTER (WHERE status = 'FINISHED') / greatest(count(*), 1) FROM fixtures
           WHERE season_id = (SELECT max(season_id) FROM fixtures)"""
    ).fetchone() or (0.0,))[0]
    rows = con.execute(
        """
        WITH c AS (
            SELECT * FROM player_statistics WHERE source_id = 'fpl'
            QUALIFY row_number() OVER (PARTITION BY player_id ORDER BY observation_date DESC) = 1
        ), h AS (
            SELECT * FROM player_statistics WHERE source_id = 'fpl_history'
              AND season_id = (SELECT max(season_id) FROM player_statistics WHERE source_id = 'fpl_history')
        ), latest_value AS (
            SELECT player_id, value_eur, valuation_date, tm_club_id FROM player_market_values
            QUALIFY row_number() OVER (PARTITION BY player_id ORDER BY valuation_date DESC) = 1
        )
        SELECT p.player_id, p.current_team_id, v.value_eur, v.valuation_date,
               s.external_id AS club, c.minutes, c.goals, c.assists,
               h.minutes AS h_minutes, h.goals AS h_goals, h.assists AS h_assists
        FROM players p
        JOIN c USING (player_id)
        JOIN latest_value v USING (player_id)
        LEFT JOIN h USING (player_id)
        LEFT JOIN team_source_ids s ON s.team_id = p.current_team_id AND s.source_id = 'transfermarkt'
        WHERE p.current_team_id IS NOT NULL
        """
    ).fetchall()
    out = []
    keep = 1 - float(played_share)
    for player, _, value, val_date, club, mins, goals, assists, h_mins, h_goals, h_assists in rows:
        base = data.base(player, today, club)
        if base is None:
            continue
        h_mins, h_goals, h_assists = h_mins or 0.0, h_goals or 0.0, h_assists or 0.0
        minutes = (mins or 0.0) + keep * h_mins
        ga = {"goals": (goals or 0.0) + keep * h_goals, "assists": (assists or 0.0) + keep * h_assists}
        per90 = minutes / 90
        window = {
            "min_365": minutes, "apps_365": minutes / 75, "pl_share_365": 1.0,
            "g90_365": ga["goals"] / per90 if per90 else math.nan,
            "a90_365": ga["assists"] / per90 if per90 else math.nan,
            "min_prev": (1 - keep) * h_mins,
            "ga90_prev": (h_goals + h_assists) / (h_mins / 90) if h_mins else math.nan,
        }
        sub = data.players.get(player, (None, None, None))
        out.append({"player_id": player, "valuation_date": val_date, "value_eur": value,
                    "position_group": position_group(sub[1], sub[2]), "season_minutes": mins or 0.0,
                    **base, **window})
    return pd.DataFrame(out)
