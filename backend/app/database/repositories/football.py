from datetime import date

import duckdb
import pandas as pd


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


def derive_standings(con: duckdb.DuckDBPyConnection, season_id: str, snapshot: date) -> int:
    """Table from results: points, goal difference, goals scored.

    shortcut: ignores points deductions, the football_data_org standings carry those.
    """
    rows = con.execute(
        """
        WITH side AS (
            SELECT f.home_team_id AS team_id, r.home_goals AS gf, r.away_goals AS ga
            FROM v_match_results r JOIN fixtures f USING (fixture_id) WHERE f.season_id = ?
            UNION ALL
            SELECT f.away_team_id, r.away_goals, r.home_goals
            FROM v_match_results r JOIN fixtures f USING (fixture_id) WHERE f.season_id = ?
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
        [season_id, season_id, season_id, season_id],
    ).fetchall()
    df = pd.DataFrame(rows, columns=["team_id", "played", "won", "drawn", "lost", "goals_for",
                                     "goals_against", "goal_difference", "points"])
    df["position"] = range(1, len(df) + 1)
    df["season_id"] = season_id
    df["source_id"] = "derived"
    df["snapshot_date"] = snapshot
    upsert(con, "league_standings", df)
    return len(df)
