import json
from typing import Any, Literal

import duckdb
from fastapi import APIRouter, BackgroundTasks, Depends

from app.api.dependencies import get_db, require_admin
from app.core.exceptions import NotFoundError
from app.database.query import row_dicts
from app.services.model_ops import retrain

router = APIRouter(tags=["models"])
DISCLAIMER = ("Pitchside provides statistical analysis and predictive estimates for informational "
              "purposes only. It is not betting advice, and predictions are inherently uncertain.")


@router.get("/models")
def models(con: duckdb.DuckDBPyConnection = Depends(get_db)) -> list[dict[str, Any]]:
    return row_dicts(
        con,
        """SELECT model_version, model_type, algorithm, trained_at, train_start, train_end,
                  test_start, test_end, n_train, n_test, is_active, notes
           FROM model_registry ORDER BY trained_at DESC""",
    )


def _metrics(con: duckdb.DuckDBPyConnection, version: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for r in row_dicts(
        con, "SELECT scope, candidate, metric, value FROM model_metrics WHERE model_version = ?",
        [version],
    ):
        out.setdefault(r["scope"], {}).setdefault(r["candidate"], {})[r["metric"]] = r["value"]
    return out


def _active(con: duckdb.DuckDBPyConnection, model_type: str) -> dict[str, Any] | None:
    rows = row_dicts(
        con,
        """SELECT model_version, model_type, algorithm, trained_at, train_start, train_end,
                  test_start, test_end, n_train, n_test, params, notes FROM model_registry
           WHERE model_type = ? AND is_active ORDER BY trained_at DESC LIMIT 1""",
        [model_type],
    )
    if not rows:
        return None
    row = rows[0]
    params = json.loads(row.pop("params") or "{}")
    params.pop("sha256", None)
    reports = row_dicts(con, "SELECT report, payload FROM model_reports WHERE model_version = ?",
                        [row["model_version"]])
    return {**row, "params": params, "metrics": _metrics(con, row["model_version"]),
            "reports": {r["report"]: json.loads(r["payload"]) for r in reports},
            "disclaimer": DISCLAIMER}


@router.get("/models/metrics")
def all_metrics(con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    return {t: _active(con, t) for t in ("match", "similarity", "transfer")}


@router.get("/models/metrics/match")
def match_metrics(con: duckdb.DuckDBPyConnection = Depends(get_db)) -> dict[str, Any]:
    active = _active(con, "match")
    if not active:
        raise NotFoundError("No trained match model")
    return active


@router.post("/admin/models/retrain", dependencies=[Depends(require_admin)], status_code=202)
def retrain_model(
    tasks: BackgroundTasks, model: Literal["match", "similarity", "transfer"] = "match"
) -> dict[str, str]:
    tasks.add_task(retrain, model)
    return {"status": "accepted", "model": model}
