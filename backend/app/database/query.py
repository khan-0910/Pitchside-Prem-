from collections.abc import Sequence
from typing import Any

import duckdb


def scalar(con: duckdb.DuckDBPyConnection, sql: str, params: Sequence[Any] | None = None) -> Any:
    """First column of the first row, or None."""
    row = con.execute(sql, params or []).fetchone()
    return row[0] if row else None


def row_dicts(
    con: duckdb.DuckDBPyConnection, sql: str, params: Sequence[Any] | None = None
) -> list[dict[str, Any]]:
    cursor = con.execute(sql, params or [])
    columns = [d[0] for d in cursor.description or []]
    return [dict(zip(columns, r, strict=True)) for r in cursor.fetchall()]
