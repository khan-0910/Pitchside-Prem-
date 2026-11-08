from datetime import date

import duckdb
import pandas as pd

from app.database.query import scalar


def upsert(con: duckdb.DuckDBPyConnection, table: str, df: pd.DataFrame, mode: str = "REPLACE"):
    """Bulk insert by column name. `table` and `mode` are code constants, never user input."""
    if df.empty:
        return
    con.register("_upsert_df", df)
    try:
        con.execute(f"INSERT OR {mode} INTO {table} BY NAME SELECT * FROM _upsert_df")
    finally:
        con.unregister("_upsert_df")


def refresh_season_coverage(
    con: duckdb.DuckDBPyConnection, season_id: str, start_year: int, expected: int
) -> None:
    con.execute(
        """INSERT OR REPLACE INTO seasons
           SELECT ?, ?, ?, ?, n, n >= ? FROM (
             SELECT count(*) AS n FROM v_match_results r
             JOIN fixtures f USING (fixture_id) WHERE f.season_id = ?)""",
        [season_id, start_year, start_year + 1, expected, expected, season_id],
    )


def results_table(
    con: duckdb.DuckDBPyConnection, season_id: str, before: date | None = None
) -> list[tuple]:
    """(team, played, won, drawn, lost, gf, ga, gd, points) from results, best first.

    `before` keeps only matches played earlier than that day.
    """
    return con.execute(
        """
        WITH side AS (
            SELECT f.home_team_id AS team_id, r.home_goals AS gf, r.away_goals AS ga
            FROM v_match_results r JOIN fixtures f USING (fixture_id)
            WHERE f.season_id = ? AND (CAST(? AS DATE) IS NULL OR f.match_date < ?)
            UNION ALL
            SELECT f.away_team_id, r.away_goals, r.home_goals
            FROM v_match_results r JOIN fixtures f USING (fixture_id)
            WHERE f.season_id = ? AND (CAST(? AS DATE) IS NULL OR f.match_date < ?)
        ), agg AS (
            SELECT team_id, count(*) AS played,
                   count(*) FILTER (WHERE gf > ga) AS won,
                   count(*) FILTER (WHERE gf = ga) AS drawn,
                   count(*) FILTER (WHERE gf < ga) AS lost,
                   sum(gf) AS gf, sum(ga) AS ga
            FROM side GROUP BY team_id
        ), teams_in_season AS (
            SELECT home_team_id AS team_id FROM fixtures WHERE season_id = ?
            UNION SELECT away_team_id FROM fixtures WHERE season_id = ?
        )
        SELECT t.team_id, coalesce(played, 0), coalesce(won, 0), coalesce(drawn, 0),
               coalesce(lost, 0), coalesce(gf, 0), coalesce(ga, 0),
               coalesce(gf - ga, 0) AS gd, coalesce(won * 3 + drawn, 0) AS pts
        FROM teams_in_season t LEFT JOIN agg USING (team_id)
        ORDER BY pts DESC, gd DESC, coalesce(gf, 0) DESC, t.team_id
        """,
        [season_id, before, before, season_id, before, before, season_id, season_id],
    ).fetchall()


def table_before_latest_round(
    con: duckdb.DuckDBPyConnection, season_id: str, table: list[dict]
) -> tuple[date | None, dict[str, dict[str, int]]]:
    """Each club's line in the table before the latest matchweek began, and the day it began.

    Any gap between `table` and the results, such as a points deduction, is carried back too.
    """
    start = scalar(
        con,
        """SELECT min(f.match_date) FROM fixtures f JOIN v_match_results r USING (fixture_id)
           WHERE f.season_id = ? AND f.matchday = (
               SELECT max(g.matchday) FROM fixtures g JOIN v_match_results s USING (fixture_id)
               WHERE g.season_id = ?)""",
        [season_id, season_id],
    )
    before = results_table(con, season_id, start) if start else []
    if not any(r[1] for r in before):
        return None, {}
    now = {r[0]: r[8] for r in results_table(con, season_id)}
    adjust = {row["team_id"]: row["points"] - now.get(row["team_id"], row["points"]) for row in table}
    ranked = sorted(before, key=lambda r: (-(r[8] + adjust.get(r[0], 0)), -r[7], -r[5], r[0]))
    return start, {r[0]: {"position": i + 1, "played": r[1], "goal_difference": r[7],
                          "points": r[8] + adjust.get(r[0], 0)} for i, r in enumerate(ranked)}


def derive_standings(con: duckdb.DuckDBPyConnection, season_id: str, snapshot: date) -> int:
    """Table from results: points, goal difference, goals scored.

    shortcut: ignores points deductions, the football_data_org standings carry those.
    """
    rows = results_table(con, season_id)
    df = pd.DataFrame(rows, columns=["team_id", "played", "won", "drawn", "lost", "goals_for",
                                     "goals_against", "goal_difference", "points"])
    df["position"] = range(1, len(df) + 1)
    df["season_id"] = season_id
    df["source_id"] = "derived"
    df["snapshot_date"] = snapshot
    upsert(con, "league_standings", df)
    return len(df)
