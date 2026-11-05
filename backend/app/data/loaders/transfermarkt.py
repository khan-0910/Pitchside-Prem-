"""dcaribou/transfermarkt-datasets public dump.

Third-party snapshots, not a live Transfermarkt feed. Nothing here scrapes Transfermarkt.
"""

from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

import duckdb
import pandas as pd

from app.data.cache import Snapshot
from app.data.loaders.base import Loader, LoadResult
from app.data.matching.players import (
    PlayerMatcher,
    PlayerRecord,
    canonical_player_id,
)
from app.data.matching.teams import TeamResolver
from app.database.query import scalar
from app.database.repositories.football import upsert

SOURCE = "transfermarkt"
BASE_URL = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data"
FILES = ["clubs", "players", "player_valuations", "transfers", "appearances"]
LEAGUE = "GB1"
HISTORY_FROM = "2012-01-01"


def _read(path) -> str:
    return f"read_csv('{str(path).replace(chr(39), '')}', header=true, sample_size=-1)"


class TransfermarktLoader(Loader):
    source_id = SOURCE
    name = "transfermarkt-datasets"
    description = "Third-party public dumps: valuations, transfers and appearances"
    ttl_hours = 24 * 8
    stale_after_hours = 24 * 30

    def fetch(self) -> list[Snapshot]:
        return [
            self.fetcher.fetch(SOURCE, f"{name}.csv.gz", f"{BASE_URL}/{name}.csv.gz")
            for name in FILES
        ]

    def load(self, con: duckdb.DuckDBPyConnection, snapshots: list[Snapshot]) -> LoadResult:
        path = {s.key.split(".")[0]: s.path for s in snapshots}
        clubs = con.execute(
            f"""SELECT club_id::VARCHAR, name FROM {_read(path['clubs'])}
                WHERE domestic_competition_id = '{LEAGUE}'"""
        ).fetchall()
        resolver = TeamResolver(con)
        club_team = {cid: resolver.resolve(SOURCE, cid, name) for cid, name in clubs}

        people = con.execute(
            f"""
            WITH pool AS (
                SELECT DISTINCT player_id FROM {_read(path['player_valuations'])}
                WHERE player_club_domestic_competition_id = '{LEAGUE}'
                  AND date >= '{HISTORY_FROM}'
                UNION
                SELECT DISTINCT player_id FROM {_read(path['appearances'])}
                WHERE competition_id = '{LEAGUE}'
            )
            SELECT p.player_id::VARCHAR AS player_id, p.name, p.first_name, p.last_name,
                   CAST(p.date_of_birth AS DATE) AS dob, p.position, p.sub_position, p.foot,
                   p.height_in_cm, p.country_of_citizenship, p.current_club_id::VARCHAR AS club,
                   p.current_club_domestic_competition_id AS league, p.last_season,
                   pool.player_id IS NOT NULL AS in_pool
            FROM {_read(path['players'])} p LEFT JOIN pool USING (player_id)
            -- New signings have no PL history yet, so birth date brings them in.
            WHERE pool.player_id IS NOT NULL OR CAST(p.date_of_birth AS DATE) IN (
                SELECT date_of_birth FROM players WHERE current_team_id IS NOT NULL)
            """
        ).df()

        known = dict(con.execute(
            f"SELECT external_id, player_id FROM player_source_ids WHERE source_id = '{SOURCE}'"
        ).fetchall())
        overrides = dict(con.execute(
            f"""SELECT external_id, entity_id FROM manual_entity_overrides
                WHERE entity_type = 'player' AND source_id = '{SOURCE}'"""
        ).fetchall())
        fpl_rows = con.execute(
            """SELECT p.player_id, p.name, s.source_name, p.date_of_birth, p.current_team_id,
                      p.position
               FROM players p JOIN player_source_ids s ON s.player_id = p.player_id
                 AND s.source_id = 'fpl'
               WHERE p.player_id NOT IN (
                 SELECT player_id FROM player_source_ids WHERE source_id = ?)""",
            [SOURCE],
        ).fetchall()
        matcher = PlayerMatcher(
            PlayerRecord(r[0], (r[1], r[2]), r[3], r[4], r[5]) for r in fpl_rows
        )

        links, new_players, unresolved, attrs = [], [], [], []
        for row in people.itertuples():
            tm_id = row.player_id
            dob = None if pd.isna(row.dob) else row.dob.date()
            team_id = club_team.get(row.club) if row.league == LEAGUE else None
            player_id = overrides.get(tm_id) or known.get(tm_id)
            method, confidence = ("manual", 1.0) if tm_id in overrides else ("source_id", 1.0)
            if player_id is None:
                query = PlayerRecord(tm_id, (row.name,), dob, team_id, row.position)
                m = matcher.match(query)
                if m.player_id:
                    player_id, method, confidence = m.player_id, m.method, m.confidence
                elif team_id and m.reason == "ambiguous":
                    # A plausible current PL player we cannot place: leave for a human.
                    unresolved.append({
                        "entity_type": "player", "source_id": SOURCE, "external_id": tm_id,
                        "source_name": row.name, "context": f"dob={dob}, team={team_id}",
                        "best_candidate": m.best_candidate, "best_score": m.best_score,
                        "reason": m.reason,
                    })
                    continue
                elif not row.in_pool:
                    continue  # shares a birthday with a PL player, nothing more
                else:
                    player_id = canonical_player_id(SOURCE, tm_id)
                    method, confidence = "new_canonical", 1.0
                    new_players.append({
                        "player_id": player_id, "name": row.name, "date_of_birth": dob,
                    })
            links.append({"source_id": SOURCE, "external_id": tm_id, "player_id": player_id,
                          "source_name": row.name, "confidence": confidence, "method": method})
            attrs.append({
                "player_id": player_id, "sub_position": row.sub_position, "foot": row.foot,
                "height_cm": None if pd.isna(row.height_in_cm) else float(row.height_in_cm),
                "nationality": row.country_of_citizenship,
            })

        upsert(con, "players", pd.DataFrame(new_players), mode="IGNORE")
        upsert(con, "player_source_ids", pd.DataFrame(links))
        upsert(con, "unresolved_entities", pd.DataFrame(unresolved))
        attr_df = pd.DataFrame(attrs)
        con.register("_a", attr_df)
        con.execute(
            """UPDATE players p SET sub_position = a.sub_position, foot = a.foot,
                 height_cm = a.height_cm, nationality = a.nationality,
                 position = coalesce(p.position, a.position)
               FROM (SELECT _a.*, NULL::VARCHAR AS position FROM _a) a
               WHERE p.player_id = a.player_id"""
        )
        con.unregister("_a")

        link = (f"(SELECT external_id::BIGINT AS tm_id, player_id FROM player_source_ids "
                f"WHERE source_id = '{SOURCE}')")
        before = scalar(con, "SELECT count(*) FROM player_market_values")
        con.execute(
            f"""INSERT OR REPLACE INTO player_market_values BY NAME
                SELECT l.player_id, v.date AS valuation_date, '{SOURCE}' AS source_id,
                       v.market_value_in_eur AS value_eur, v.current_club_name AS club_name,
                       v.current_club_id::VARCHAR AS tm_club_id,
                       v.player_club_domestic_competition_id AS competition_id
                FROM {_read(path['player_valuations'])} v JOIN {link} l ON l.tm_id = v.player_id"""
        )
        con.execute(
            f"""INSERT OR REPLACE INTO player_transfers BY NAME
                SELECT l.player_id, t.transfer_date, '{SOURCE}' AS source_id,
                       t.transfer_season AS season_label, t.from_club_name AS from_club,
                       t.to_club_name AS to_club, t.transfer_fee AS fee_eur,
                       t.market_value_in_eur AS market_value_eur
                FROM {_read(path['transfers'])} t JOIN {link} l ON l.tm_id = t.player_id
                WHERE t.transfer_date <= current_date AND t.to_club_name IS NOT NULL
                QUALIFY row_number() OVER (
                    PARTITION BY l.player_id, t.transfer_date, t.to_club_name) = 1"""
        )
        con.execute(
            f"""INSERT OR REPLACE INTO player_appearances BY NAME
                SELECT a.game_id::VARCHAR AS game_id, l.player_id, '{SOURCE}' AS source_id,
                       a.date AS game_date, a.player_club_id::VARCHAR AS tm_club_id,
                       a.competition_id, a.minutes_played AS minutes, a.goals, a.assists,
                       a.yellow_cards, a.red_cards
                FROM {_read(path['appearances'])} a JOIN {link} l ON l.tm_id = a.player_id
                QUALIFY row_number() OVER (PARTITION BY a.game_id, l.player_id) = 1"""
        )
        values = scalar(con, "SELECT count(*) FROM player_market_values")
        as_of = scalar(con, "SELECT max(valuation_date) FROM player_market_values")
        apps = scalar(con, "SELECT count(*) FROM player_appearances")
        matched = sum(1 for x in links if x["method"] in ("dob+name", "team+name", "manual"))
        fpl_total = scalar(con, "SELECT count(*) FROM player_source_ids WHERE source_id = 'fpl'")
        linked = scalar(
            con,
            f"""SELECT count(DISTINCT f.player_id) FROM player_source_ids f
                JOIN player_source_ids t ON t.player_id = f.player_id AND t.source_id = '{SOURCE}'
                WHERE f.source_id = 'fpl'""",
        )
        # Regulars with no valuation link belong in the human review list.
        gaps = con.execute(
            f"""SELECT f.external_id, f.source_name, p.current_team_id, p.date_of_birth
                FROM player_source_ids f JOIN players p USING (player_id)
                WHERE f.source_id = 'fpl' AND p.current_team_id IS NOT NULL
                  AND player_id NOT IN (SELECT player_id FROM player_source_ids
                                        WHERE source_id = '{SOURCE}')
                  AND player_id IN (SELECT player_id FROM player_statistics WHERE minutes > 0)"""
        ).fetchall()
        upsert(con, "unresolved_entities", pd.DataFrame([
            {"entity_type": "player", "source_id": "fpl", "external_id": g[0],
             "source_name": g[1], "context": f"dob={g[3]}, team={g[2]}",
             "reason": "no transfermarkt match"} for g in gaps
        ]))
        modified = next((s.last_modified for s in snapshots if s.last_modified), None)
        return LoadResult(
            records=values + apps,
            coverage=f"{len(links)} players, {values} valuations to {as_of}, "
                     f"{linked}/{fpl_total} current FPL players linked",
            data_as_of=as_of,
            upstream_updated_at=parsedate_to_datetime(modified) if modified
            else datetime.now(UTC),
            checks=[
                ("clubs_resolved", all(club_team.values()),
                 f"{sum(1 for v in club_team.values() if not v)} unmapped clubs"),
                ("values_grew_or_held", values >= before, f"{before} -> {values}"),
                ("new_links", True, f"{matched} matched this run"),
                ("unresolved_players", not unresolved, f"{len(unresolved)} ambiguous"),
            ],
        )
