from pathlib import Path

import duckdb

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def migrate(con: duckdb.DuckDBPyConnection) -> list[str]:
    """Apply ordered SQL files once each. Files are never edited after release."""
    con.execute(
        """CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())"""
    )
    done = {r[0] for r in con.execute("SELECT version FROM schema_migrations").fetchall()}
    applied = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.stem in done:
            continue
        con.execute("BEGIN")
        try:
            con.execute(path.read_text(encoding="utf-8"))
            con.execute("INSERT INTO schema_migrations (version) VALUES (?)", [path.stem])
            con.execute("COMMIT")
        except Exception:
            con.execute("ROLLBACK")
            raise
        applied.append(path.stem)
    return applied
