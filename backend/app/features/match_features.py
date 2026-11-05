"""Chronological feature engine.

Each fixture is written out from the state BEFORE it, then its result updates the state.
That order is the leakage guarantee: a match can never see itself or anything later.
"""

import math
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

import duckdb
import numpy as np
import pandas as pd

from app.features.squads import (
    HistoricSquads,
    current_rosters,
    likely_squad,
    squad_features,
)

ELO_START = 1500.0
ELO_PROMOTED = 1420.0
ELO_K = 22.0
ELO_HOME = 65.0
ELO_CARRYOVER = 0.8
MAX_REST = 14
SQUAD_DATA_FROM = date(2012, 8, 1)

FEATURES = [
    "elo_diff", "elo_home", "elo_away",
    "ppg5_home", "ppg5_away", "gf10_home", "gf10_away", "ga10_home", "ga10_away",
    "shots10_home", "shots10_away", "sot10_home", "sot10_away",
    "venue_ppg10_home", "venue_ppg10_away",
    "season_ppg_home", "season_ppg_away", "season_gd_home", "season_gd_away",
    "rest_home", "rest_away",
    "squad_value_home", "squad_value_away", "squad_ga90_home", "squad_ga90_away",
    "squad_value_diff",
]


@dataclass
class TeamState:
    elo: float = ELO_START
    recent: deque = field(default_factory=lambda: deque(maxlen=10))
    at_home: deque = field(default_factory=lambda: deque(maxlen=10))
    away: deque = field(default_factory=lambda: deque(maxlen=10))
    last_date: date | None = None
    season: str | None = None
    points: int = 0
    played: int = 0
    gd: int = 0


def _mean(rows, key: str, last: int | None = None) -> float:
    picked = list(rows)[-last:] if last else list(rows)
    values = [r[key] for r in picked if r[key] is not None]
    return float(np.mean(values)) if values else math.nan


def _side(state: TeamState, venue: deque, day: date) -> dict[str, float]:
    return {
        "ppg5": _mean(state.recent, "pts", 5), "gf10": _mean(state.recent, "gf"),
        "ga10": _mean(state.recent, "ga"), "shots10": _mean(state.recent, "shots"),
        "sot10": _mean(state.recent, "sot"), "venue_ppg10": _mean(venue, "pts"),
        "season_ppg": state.points / state.played if state.played else math.nan,
        "season_gd": state.gd / state.played if state.played else math.nan,
        "rest": min((day - state.last_date).days, MAX_REST) if state.last_date else MAX_REST,
    }


def expected_score(elo_home: float, elo_away: float) -> float:
    return 1 / (1 + 10 ** ((elo_away - elo_home - ELO_HOME) / 400))


def update_elo(home: TeamState, away: TeamState, hg: int, ag: int) -> None:
    actual = 1.0 if hg > ag else 0.0 if hg < ag else 0.5
    margin = 1 + 0.5 * math.log1p(abs(hg - ag)) if hg != ag else 1.0
    shift = ELO_K * margin * (actual - expected_score(home.elo, away.elo))
    home.elo += shift
    away.elo -= shift


def load_matches(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return con.execute(
        """
        SELECT f.fixture_id, f.season_id, f.matchday, f.status, f.kickoff_utc,
               f.match_date, f.home_team_id, f.away_team_id,
               r.home_goals, r.away_goals,
               hs.shots AS home_shots, hs.shots_on_target AS home_sot,
               az.shots AS away_shots, az.shots_on_target AS away_sot
        FROM fixtures f
        LEFT JOIN v_match_results r USING (fixture_id)
        LEFT JOIN team_statistics hs ON hs.fixture_id = f.fixture_id
             AND hs.team_id = f.home_team_id AND hs.source_id = 'football_data_uk'
        LEFT JOIN team_statistics az ON az.fixture_id = f.fixture_id
             AND az.team_id = f.away_team_id AND az.source_id = 'football_data_uk'
        ORDER BY f.match_date NULLS LAST, f.fixture_id
        """
    ).df()


def _none(value) -> int | None:
    return None if pd.isna(value) else int(value)


def build_match_frame(
    con: duckdb.DuckDBPyConnection, today: date | None = None
) -> pd.DataFrame:
    """One row per fixture, played or not, holding only pre-match information."""
    today = today or datetime.now(UTC).date()
    matches = load_matches(con)
    squads = HistoricSquads(con)
    live = {t: squad_features(likely_squad(r)) for t, r in current_rosters(con).items()}
    teams: dict[str, TeamState] = {}
    prior_season_teams: set[str] = set()
    season_seen: set[str] = set()
    current_season: str | None = None
    planned: dict[str, date] = {}
    rows = []

    for m in matches.itertuples():
        played = not pd.isna(m.home_goals)
        day = m.match_date.date() if not pd.isna(m.match_date) else today + timedelta(days=30)

        if m.season_id != current_season:
            prior_season_teams, season_seen = season_seen, set()
            current_season = m.season_id
        for team in (m.home_team_id, m.away_team_id):
            if team not in teams:
                teams[team] = TeamState(elo=ELO_START if not prior_season_teams else ELO_PROMOTED)
            state = teams[team]
            if state.season != m.season_id:
                if team not in prior_season_teams and prior_season_teams:
                    state.elo = min(state.elo, ELO_PROMOTED)  # promoted club
                else:
                    state.elo = ELO_CARRYOVER * state.elo + (1 - ELO_CARRYOVER) * ELO_START
                state.season, state.points, state.played, state.gd = m.season_id, 0, 0, 0
            season_seen.add(team)

        home, away = teams[m.home_team_id], teams[m.away_team_id]
        h, a = _side(home, home.at_home, day), _side(away, away.away, day)
        if not played:
            # Future games count rest from the previous scheduled game too.
            for side, team in ((h, m.home_team_id), (a, m.away_team_id)):
                if team in planned:
                    side["rest"] = min(side["rest"], (day - planned[team]).days, MAX_REST)
                planned[team] = day
        if played or day <= today:
            sq_h = squads.features(m.home_team_id, day) if day >= SQUAD_DATA_FROM else (None, None)
            sq_a = squads.features(m.away_team_id, day) if day >= SQUAD_DATA_FROM else (None, None)
        else:
            sq_h = live.get(m.home_team_id, (None, None))
            sq_a = live.get(m.away_team_id, (None, None))
        if not played and day <= today:
            sq_h = live.get(m.home_team_id, sq_h)
            sq_a = live.get(m.away_team_id, sq_a)

        row = {
            "fixture_id": m.fixture_id, "season_id": m.season_id, "date": day,
            "matchday": m.matchday, "status": m.status, "kickoff_utc": m.kickoff_utc,
            "home_team_id": m.home_team_id, "away_team_id": m.away_team_id,
            "home_goals": _none(m.home_goals), "away_goals": _none(m.away_goals),
            "played": played, "elo_home": home.elo, "elo_away": away.elo,
            "elo_diff": home.elo + ELO_HOME - away.elo,
            "squad_value_home": sq_h[0], "squad_value_away": sq_a[0],
            "squad_ga90_home": sq_h[1], "squad_ga90_away": sq_a[1],
        }
        for key, value in h.items():
            row[f"{key}_home"] = value
        for key, value in a.items():
            row[f"{key}_away"] = value
        vh, va = row["squad_value_home"], row["squad_value_away"]
        row["squad_value_diff"] = vh - va if vh is not None and va is not None else None
        rows.append(row)

        if played:
            _apply_result(home, away, m)

    frame = pd.DataFrame(rows)
    frame[FEATURES] = frame[FEATURES].apply(pd.to_numeric, errors="coerce")
    return frame


def _apply_result(home: TeamState, away: TeamState, m) -> None:
    hg, ag = int(m.home_goals), int(m.away_goals)
    update_elo(home, away, hg, ag)
    home_pts, away_pts = (3, 0) if hg > ag else (0, 3) if ag > hg else (1, 1)
    day = m.match_date.date()
    for state, venue, pts, gf, ga, shots, sot in (
        (home, home.at_home, home_pts, hg, ag, m.home_shots, m.home_sot),
        (away, away.away, away_pts, ag, hg, m.away_shots, m.away_sot),
    ):
        entry = {"pts": pts, "gf": gf, "ga": ga, "shots": _none(shots), "sot": _none(sot)}
        state.recent.append(entry)
        venue.append(entry)
        state.points += pts
        state.played += 1
        state.gd += gf - ga
        state.last_date = day


def outcome_label(home_goals: int, away_goals: int) -> int:
    """0 home win, 1 draw, 2 away win."""
    return 0 if home_goals > away_goals else 2 if away_goals > home_goals else 1
