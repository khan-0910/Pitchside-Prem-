import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

import duckdb
import numpy as np

from app.config import get_settings
from app.core.exceptions import InvalidRequestError, NotFoundError, ServiceUnavailableError
from app.database.connection import write_lock
from app.database.query import row_dicts, scalar
from app.models.match.inference import score_matrix
from app.simulation.season import RemainingFixture, TeamRow, simulate_season, summarise

NOTE = ("Each iteration plays the remaining fixtures once. Team strength is held fixed across a run, so "
        "the real spread of outcomes is likely wider. These are probabilities, not forecasts of fact.")


def current_table(con: duckdb.DuckDBPyConnection, season: str) -> list[TeamRow]:
    """Goals come from results. Points carry any official deduction when that source is present."""
    rows = con.execute(
        """
        WITH side AS (
            SELECT f.home_team_id AS team_id, r.home_goals AS gf, r.away_goals AS ga
            FROM v_match_results r JOIN fixtures f USING (fixture_id) WHERE f.season_id = ?
            UNION ALL
            SELECT f.away_team_id, r.away_goals, r.home_goals
            FROM v_match_results r JOIN fixtures f USING (fixture_id) WHERE f.season_id = ?
        ), agg AS (
            SELECT team_id, sum(CASE WHEN gf > ga THEN 3 WHEN gf = ga THEN 1 ELSE 0 END) AS pts,
                   sum(gf) AS gf, sum(ga) AS ga FROM side GROUP BY 1
        ), official AS (
            SELECT team_id, points FROM league_standings
            WHERE season_id = ? AND source_id = 'football_data_org'
            QUALIFY rank() OVER (ORDER BY snapshot_date DESC) = 1
        )
        SELECT t.team_id, coalesce(o.points, a.pts, 0), coalesce(a.gf, 0), coalesce(a.ga, 0)
        FROM (SELECT home_team_id AS team_id FROM fixtures WHERE season_id = ?
              UNION SELECT away_team_id FROM fixtures WHERE season_id = ?) t
        LEFT JOIN agg a USING (team_id) LEFT JOIN official o USING (team_id)
        ORDER BY t.team_id
        """,
        [season, season, season, season, season],
    ).fetchall()
    return [TeamRow(r[0], int(r[1]), int(r[2]), int(r[3])) for r in rows]


def remaining_fixtures(con: duckdb.DuckDBPyConnection, season: str) -> list[RemainingFixture]:
    rows = con.execute(
        """
        SELECT f.fixture_id, f.home_team_id, f.away_team_id, p.p_home, p.p_draw, p.p_away,
               p.xg_home, p.xg_away
        FROM fixtures f
        LEFT JOIN v_match_results r USING (fixture_id)
        LEFT JOIN (SELECT * FROM match_predictions
                   QUALIFY row_number() OVER (PARTITION BY fixture_id ORDER BY predicted_at DESC) = 1) p
             USING (fixture_id)
        WHERE f.season_id = ? AND r.fixture_id IS NULL
        ORDER BY f.fixture_id
        """,
        [season],
    ).fetchall()
    missing = sum(1 for r in rows if r[3] is None)
    if missing:
        raise ServiceUnavailableError(f"{missing} remaining fixtures have no stored prediction yet")
    return [RemainingFixture(r[1], r[2], score_matrix(r[6], r[7], np.array(r[3:6]))) for r in rows]


def played_results(con: duckdb.DuckDBPyConnection, season: str) -> list[tuple[str, str, int, int]]:
    return [tuple(r) for r in con.execute(
        """SELECT f.home_team_id, f.away_team_id, r.home_goals, r.away_goals
           FROM v_match_results r JOIN fixtures f USING (fixture_id) WHERE f.season_id = ?""",
        [season],
    ).fetchall()]


def run_simulation(
    con: duckdb.DuckDBPyConnection, iterations: int | None = None, seed: int = 2026
) -> dict[str, Any]:
    settings = get_settings()
    iterations = iterations or settings.simulation_default_iterations
    if iterations > settings.simulation_max_iterations:
        raise InvalidRequestError(f"iterations cannot exceed {settings.simulation_max_iterations}")
    season = scalar(con, "SELECT max(season_id) FROM fixtures")
    if not season:
        raise ServiceUnavailableError("No fixtures have been ingested yet")
    table = current_table(con, season)
    remaining = remaining_fixtures(con, season)
    played = played_results(con, season)
    version = scalar(con, "SELECT model_version FROM model_registry WHERE model_type='match' AND is_active")
    if not version:
        raise ServiceUnavailableError("No trained match model is available yet")

    state = hashlib.sha256(json.dumps([
        iterations, seed, version, sorted(played),
        [(f.home, f.away, f.grid.round(6).tolist()) for f in remaining[:400]],
    ]).encode()).hexdigest()
    existing = scalar(
        con, "SELECT simulation_id FROM simulation_runs WHERE json_extract_string(params, '$.state') = ?", [state])
    if existing:
        return get_simulation(con, existing)

    result = summarise(simulate_season(table, remaining, played, iterations, seed))
    simulation_id = uuid.uuid4().hex[:16]
    now = datetime.now(UTC)
    points = {t.team_id: t.points for t in table}
    with write_lock:
        con.execute("BEGIN")
        con.execute(
            "INSERT INTO simulation_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [simulation_id, now, iterations, seed, version, season, len(remaining),
             json.dumps({"state": state, "played": len(played)})],
        )
        con.executemany(
            "INSERT INTO simulation_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [[simulation_id, r["team_id"], points[r["team_id"]], r["expected_points"], r["expected_position"],
              r["p_title"], r["p_top4"], r["p_top6"], r["p_relegation"], r["points_p10"], r["points_p90"],
              json.dumps(r["position_distribution"])] for r in result],
        )
        con.execute("COMMIT")
    return get_simulation(con, simulation_id)


def get_simulation(con: duckdb.DuckDBPyConnection, simulation_id: str) -> dict[str, Any]:
    runs = row_dicts(
        con, """SELECT simulation_id, created_at, iterations, seed, model_version, season_id, fixtures_remaining
                FROM simulation_runs WHERE simulation_id = ?""", [simulation_id])
    if not runs:
        raise NotFoundError("Simulation not found")
    run = runs[0]
    rows = row_dicts(
        con, """SELECT r.*, t.name, t.short_name, t.tla FROM simulation_results r JOIN teams t USING (team_id)
                WHERE r.simulation_id = ? ORDER BY r.expected_position""", [simulation_id])
    for r in rows:
        r["position_distribution"] = json.loads(r["position_distribution"])
    # With n runs a probability p carries a standard error of sqrt(p(1-p)/n).
    run["max_standard_error"] = round(0.5 / run["iterations"] ** 0.5, 5)
    return {**run, "results": rows, "note": NOTE}


def latest_simulation(con: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    latest = scalar(con, "SELECT simulation_id FROM simulation_runs ORDER BY created_at DESC LIMIT 1")
    if not latest:
        raise NotFoundError("No simulation has been run yet")
    return get_simulation(con, latest)


def simulation_history(con: duckdb.DuckDBPyConnection, limit: int = 20) -> list[dict[str, Any]]:
    return row_dicts(
        con,
        """SELECT r.simulation_id, r.created_at, r.iterations, r.seed, r.model_version, r.fixtures_remaining,
                  t.name AS title_favourite, x.p_title
           FROM simulation_runs r
           JOIN simulation_results x ON x.simulation_id = r.simulation_id
           JOIN teams t ON t.team_id = x.team_id
           QUALIFY row_number() OVER (PARTITION BY r.simulation_id ORDER BY x.p_title DESC) = 1
           ORDER BY r.created_at DESC LIMIT ?""",
        [limit],
    )
