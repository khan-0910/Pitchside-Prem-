"""Manual entity mapping.

  python -m scripts.entities list
  python -m scripts.entities map player transfermarkt 12345 p_abcd "same person, confirmed"
  python -m scripts.entities links --low 0.9
"""

import argparse

from app.config import get_settings
from app.database.connection import open_connection


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    mapper = sub.add_parser("map")
    mapper.add_argument("entity_type", choices=["team", "player"])
    mapper.add_argument("source_id")
    mapper.add_argument("external_id")
    mapper.add_argument("entity_id")
    mapper.add_argument("note", nargs="?", default="")
    links = sub.add_parser("links")
    links.add_argument("--low", type=float, default=0.9)
    args = parser.parse_args()

    con = open_connection(get_settings().db_path)
    if args.command == "list":
        for row in con.execute(
            """SELECT entity_type, source_id, external_id, source_name, best_candidate,
                      round(best_score, 1), reason, context
               FROM unresolved_entities ORDER BY entity_type, source_name"""
        ).fetchall():
            print(*row, sep=" | ")
    elif args.command == "links":
        for row in con.execute(
            """SELECT source_id, external_id, source_name, player_id, confidence, method
               FROM player_source_ids WHERE confidence < ? ORDER BY confidence""",
            [args.low],
        ).fetchall():
            print(*row, sep=" | ")
    else:
        table = "teams" if args.entity_type == "team" else "players"
        key = "team_id" if args.entity_type == "team" else "player_id"
        if not con.execute(f"SELECT 1 FROM {table} WHERE {key} = ?", [args.entity_id]).fetchone():
            raise SystemExit(f"unknown {args.entity_type}: {args.entity_id}")
        con.execute(
            """INSERT OR REPLACE INTO manual_entity_overrides
               (entity_type, source_id, external_id, entity_id, note) VALUES (?, ?, ?, ?, ?)""",
            [args.entity_type, args.source_id, args.external_id, args.entity_id, args.note],
        )
        con.execute(
            """DELETE FROM unresolved_entities
               WHERE entity_type = ? AND source_id = ? AND external_id = ?""",
            [args.entity_type, args.source_id, args.external_id],
        )
        print("saved; it applies on the next ingest of that source")


if __name__ == "__main__":
    main()
