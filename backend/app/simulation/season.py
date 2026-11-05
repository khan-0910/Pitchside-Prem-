"""Monte Carlo over remaining fixtures. Pure numbers in, pure numbers out."""

from dataclasses import dataclass

import numpy as np

SEARCH_GOALS = 9  # score grids are 9 x 9, 0 to 8 goals


@dataclass(frozen=True)
class TeamRow:
    team_id: str
    points: int
    goals_for: int
    goals_against: int


@dataclass(frozen=True)
class RemainingFixture:
    home: str
    away: str
    grid: np.ndarray  # P(home goals, away goals)


@dataclass(frozen=True)
class SeasonResult:
    teams: list[str]
    positions: np.ndarray  # iterations x teams, 0 is first
    points: np.ndarray


def _sample_scores(grid: np.ndarray, n: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    cdf = np.cumsum(grid.ravel())
    cells = np.searchsorted(cdf / cdf[-1], rng.random(n), side="right")
    cells = np.minimum(cells, grid.size - 1)
    return cells // grid.shape[0], cells % grid.shape[0]


def _head_to_head(
    tied: list[int], iteration: int, fixtures: list[tuple[int, int]], home_goals: np.ndarray,
    away_goals: np.ndarray, played: list[tuple[int, int, int, int]], rng: np.random.Generator,
) -> list[int]:
    """Order teams level on points, difference and goals: H2H points, H2H away goals, then lots."""
    pts = dict.fromkeys(tied, 0)
    away = dict.fromkeys(tied, 0)
    group = set(tied)

    def add(h: int, a: int, hg: int, ag: int) -> None:
        if h in group and a in group:
            pts[h] += 3 if hg > ag else 1 if hg == ag else 0
            pts[a] += 3 if ag > hg else 1 if hg == ag else 0
            away[a] += ag

    for h, a, hg, ag in played:
        add(h, a, hg, ag)
    for f, (h, a) in enumerate(fixtures):
        if h in group and a in group:
            add(h, a, int(home_goals[iteration, f]), int(away_goals[iteration, f]))
    lots = {t: rng.random() for t in tied}  # stands in for the play-off
    return sorted(tied, key=lambda t: (pts[t], away[t], lots[t]), reverse=True)


def rank_iterations(
    points: np.ndarray, gf: np.ndarray, ga: np.ndarray, fixtures: list[tuple[int, int]],
    home_goals: np.ndarray, away_goals: np.ndarray, played: list[tuple[int, int, int, int]],
    rng: np.random.Generator,
) -> np.ndarray:
    """Premier League order: points, goal difference, goals scored, head-to-head."""
    n, teams = points.shape
    key = points * 1_000_000 + (gf - ga + 500) * 1_000 + gf
    order = np.argsort(-key, axis=1, kind="stable")
    ordered = np.take_along_axis(key, order, axis=1)
    for i in np.flatnonzero((ordered[:, 1:] == ordered[:, :-1]).any(axis=1)):
        row = order[i].tolist()
        slot = 0
        while slot < teams:
            end = slot + 1
            while end < teams and key[i, row[end]] == key[i, row[slot]]:
                end += 1
            if end - slot > 1:
                row[slot:end] = _head_to_head(row[slot:end], int(i), fixtures, home_goals, away_goals,
                                              played, rng)
            slot = end
        order[i] = row
    positions = np.empty_like(order)
    np.put_along_axis(positions, order, np.tile(np.arange(teams), (n, 1)), axis=1)
    return positions


def simulate_season(
    table: list[TeamRow], remaining: list[RemainingFixture], played: list[tuple[str, str, int, int]],
    iterations: int, seed: int,
) -> SeasonResult:
    teams = [t.team_id for t in table]
    index = {t: i for i, t in enumerate(teams)}
    rng = np.random.default_rng(seed)
    n, m = iterations, len(remaining)

    points = np.tile(np.array([t.points for t in table], dtype=np.int64), (n, 1))
    gf = np.tile(np.array([t.goals_for for t in table], dtype=np.int64), (n, 1))
    ga = np.tile(np.array([t.goals_against for t in table], dtype=np.int64), (n, 1))
    home_goals = np.zeros((n, m), dtype=np.int8)
    away_goals = np.zeros((n, m), dtype=np.int8)
    pairs: list[tuple[int, int]] = []
    for f, fixture in enumerate(remaining):
        h, a = index[fixture.home], index[fixture.away]
        pairs.append((h, a))
        hg, ag = _sample_scores(fixture.grid, n, rng)
        home_goals[:, f], away_goals[:, f] = hg, ag
        points[:, h] += 3 * (hg > ag) + (hg == ag)
        points[:, a] += 3 * (ag > hg) + (hg == ag)
        gf[:, h] += hg
        ga[:, h] += ag
        gf[:, a] += ag
        ga[:, a] += hg
    done = [(index[h], index[a], hg, ag) for h, a, hg, ag in played if h in index and a in index]
    positions = rank_iterations(points, gf, ga, pairs, home_goals, away_goals, done, rng)
    return SeasonResult(teams, positions, points)


def summarise(result: SeasonResult) -> list[dict]:
    n = result.positions.shape[0]
    size = len(result.teams)
    out = []
    for t, team in enumerate(result.teams):
        pos = result.positions[:, t]
        counts = np.bincount(pos, minlength=size)
        out.append({
            "team_id": team,
            "expected_points": float(result.points[:, t].mean()),
            "expected_position": float(pos.mean() + 1),
            "p_title": float((pos == 0).mean()),
            "p_top4": float((pos < 4).mean()),
            "p_top6": float((pos < 6).mean()),
            "p_relegation": float((pos >= size - 3).mean()),
            "points_p10": float(np.percentile(result.points[:, t], 10)),
            "points_p90": float(np.percentile(result.points[:, t], 90)),
            "position_distribution": (counts / n).round(5).tolist(),
        })
    return sorted(out, key=lambda r: r["expected_position"])
