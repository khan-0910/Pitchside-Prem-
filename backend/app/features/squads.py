"""Squad strength: the player-level input that links people to the match model.

Two numbers per team: total market value of the likely 14 and their goal output per 90.
History uses who actually played recently; live uses current FPL minutes and availability.
A what-if swap edits this roster, so it really changes the model's inputs.
"""

import math
from bisect import bisect_left
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta

import duckdb
import numpy as np

SQUAD_SIZE = 14
RECENT_GAMES = 5
GA_WINDOW_DAYS = 365
GA_PRIOR_90S = 3.0  # shrinks small samples toward zero
UNAVAILABLE = {"i", "s", "u", "n"}


@dataclass(frozen=True)
class SquadPlayer:
    player_id: str
    name: str
    value_eur: float | None
    ga_total: float
    minutes: float
    position: str | None = None
    season_minutes: float = 0.0


def ga_per_90(goal_involvements: float, minutes: float) -> float:
    return goal_involvements / (minutes / 90 + GA_PRIOR_90S)


def squad_features(roster: list[SquadPlayer]) -> tuple[float, float]:
    """(log1p total value, mean G+A per 90) for a roster."""
    if not roster:
        return math.nan, math.nan
    known = [p.value_eur for p in roster if p.value_eur]
    fallback = float(np.median(known)) if known else 0.0
    total = sum(p.value_eur or fallback for p in roster)
    return math.log1p(total), float(np.mean([ga_per_90(p.ga_total, p.minutes) for p in roster]))


class HistoricSquads:
    """Point-in-time lookups. Every read stops strictly before the match date."""

    def __init__(self, con: duckdb.DuckDBPyConnection):
        rows = con.execute(
            """SELECT s.team_id, a.game_date, a.player_id, a.minutes
               FROM player_appearances a
               JOIN team_source_ids s ON s.source_id = 'transfermarkt'
                 AND s.external_id = a.tm_club_id
               WHERE a.competition_id = 'GB1' AND a.minutes > 0
               ORDER BY a.game_date"""
        ).fetchall()
        self.team_games: dict[str, dict[date, list[tuple[str, int]]]] = defaultdict(
            lambda: defaultdict(list)
        )
        for team, day, player, minutes in rows:
            self.team_games[team][day].append((player, minutes))
        self.team_dates = {t: sorted(g) for t, g in self.team_games.items()}

        self.value_dates: dict[str, list[date]] = defaultdict(list)
        self.values: dict[str, list[float]] = defaultdict(list)
        for player, day, value in con.execute(
            """SELECT player_id, valuation_date, value_eur FROM player_market_values
               WHERE value_eur > 0 ORDER BY valuation_date"""
        ).fetchall():
            self.value_dates[player].append(day)
            self.values[player].append(value)

        self.app_dates: dict[str, list[date]] = defaultdict(list)
        self.app_cum_min: dict[str, list[float]] = defaultdict(lambda: [0.0])
        self.app_cum_ga: dict[str, list[float]] = defaultdict(lambda: [0.0])
        for player, day, minutes, ga in con.execute(
            """SELECT player_id, game_date, sum(minutes), sum(goals + assists)
               FROM player_appearances GROUP BY 1, 2 ORDER BY 2"""
        ).fetchall():
            self.app_dates[player].append(day)
            self.app_cum_min[player].append(self.app_cum_min[player][-1] + (minutes or 0))
            self.app_cum_ga[player].append(self.app_cum_ga[player][-1] + (ga or 0))

    def value_at(self, player: str, day: date) -> float | None:
        i = bisect_left(self.value_dates.get(player, []), day)
        return self.values[player][i - 1] if i else None

    def output_before(self, player: str, day: date) -> tuple[float, float]:
        dates = self.app_dates.get(player, [])
        end = bisect_left(dates, day)
        start = bisect_left(dates, day - timedelta(days=GA_WINDOW_DAYS))
        return (self.app_cum_ga[player][end] - self.app_cum_ga[player][start],
                self.app_cum_min[player][end] - self.app_cum_min[player][start]) if dates else (0, 0)

    def roster(self, team: str, day: date) -> list[SquadPlayer]:
        dates = self.team_dates.get(team, [])
        end = bisect_left(dates, day)
        minutes: dict[str, int] = defaultdict(int)
        for game in dates[max(0, end - RECENT_GAMES):end]:
            for player, m in self.team_games[team][game]:
                minutes[player] += m
        top = sorted(minutes, key=lambda p: minutes[p], reverse=True)[:SQUAD_SIZE]
        out = []
        for player in top:
            ga, mins = self.output_before(player, day)
            out.append(SquadPlayer(player, player, self.value_at(player, day), ga, mins))
        return out

    def features(self, team: str, day: date) -> tuple[float, float]:
        return squad_features(self.roster(team, day))


def current_rosters(con: duckdb.DuckDBPyConnection) -> dict[str, list[SquadPlayer]]:
    """Every current player by team, best-used first. Unavailable players are excluded."""
    return _load_current(con, include_unavailable=False)


def full_squads(con: duckdb.DuckDBPyConnection) -> dict[str, list[SquadPlayer]]:
    return _load_current(con, include_unavailable=True)


def _load_current(
    con: duckdb.DuckDBPyConnection, include_unavailable: bool
) -> dict[str, list[SquadPlayer]]:
    rows = con.execute(
        """
        WITH latest AS (
            SELECT * FROM player_statistics WHERE source_id = 'fpl'
            QUALIFY row_number() OVER (PARTITION BY player_id ORDER BY observation_date DESC) = 1
        ), recent AS (
            SELECT player_id, sum(goals + assists) AS ga, sum(minutes) AS mins
            FROM (
                SELECT * FROM latest
                UNION ALL
                SELECT * FROM player_statistics WHERE source_id = 'fpl_history'
                  AND season_id = (SELECT max(season_id) FROM player_statistics
                                   WHERE source_id = 'fpl_history')
            ) GROUP BY player_id
        ), value AS (
            SELECT player_id, value_eur FROM player_market_values
            QUALIFY row_number() OVER (PARTITION BY player_id ORDER BY valuation_date DESC) = 1
        )
        SELECT p.current_team_id, p.player_id, p.name, v.value_eur, r.ga, r.mins, p.position,
               l.minutes, p.availability
        FROM players p
        JOIN latest l USING (player_id)
        LEFT JOIN recent r USING (player_id)
        LEFT JOIN value v USING (player_id)
        WHERE p.current_team_id IS NOT NULL
        ORDER BY l.minutes DESC, p.player_id
        """
    ).fetchall()
    squads: dict[str, list[SquadPlayer]] = defaultdict(list)
    for team, pid, name, value, ga, mins, pos, season_minutes, availability in rows:
        if not include_unavailable and availability in UNAVAILABLE:
            continue
        squads[team].append(SquadPlayer(pid, name, value, ga or 0.0, mins or 0.0, pos,
                                        season_minutes or 0.0))
    return squads


def likely_squad(players: list[SquadPlayer]) -> list[SquadPlayer]:
    return players[:SQUAD_SIZE]
