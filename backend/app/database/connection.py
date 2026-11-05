import threading
from pathlib import Path

import duckdb

from app.config import get_settings
from app.database.schema import migrate

_lock = threading.Lock()
_con: duckdb.DuckDBPyConnection | None = None
# DuckDB allows one writer at a time: ingestion, training and result storage share this.
write_lock = threading.RLock()


def open_connection(path: Path | str) -> duckdb.DuckDBPyConnection:
    if str(path) != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(path))
    migrate(con)
    return con


def get_connection() -> duckdb.DuckDBPyConnection:
    global _con
    with _lock:
        if _con is None:
            _con = open_connection(get_settings().db_path)
        return _con


def set_connection(con: duckdb.DuckDBPyConnection | None) -> None:
    """Swap the shared connection. Tests use this for in-memory databases."""
    global _con
    with _lock:
        _con = con


def db_cursor() -> duckdb.DuckDBPyConnection:
    return get_connection().cursor()
