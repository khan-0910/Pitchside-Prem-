"""python -m scripts.ingest [source ...]  -  stop the API first, DuckDB has one writer."""

import sys

from app.config import get_settings
from app.core.logging import configure_logging
from app.data.runner import run_all
from app.database.connection import open_connection


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    con = open_connection(settings.db_path)
    for r in run_all(con, sys.argv[1:] or None):
        print(f"{r.source_id:20} {r.status:12} {r.records:>9}  {r.error or ''}")


if __name__ == "__main__":
    main()
