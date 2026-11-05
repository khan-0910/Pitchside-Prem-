"""python -m scripts.refresh  -  the scheduled job behind the public site.

A new data folder gets a full build. After that, scores and injuries refresh each run and
the slower sources and the models refresh once a week.
"""

from datetime import UTC, datetime, timedelta

from app.config import get_settings
from app.core.logging import configure_logging
from app.data.runner import run_all
from app.database.connection import open_connection, set_connection
from app.models.match.train import train_match_model
from app.services.predictions import refresh_predictions
from app.services.what_if import refresh_demo
from scripts import bootstrap

FREQUENT = ["fpl", "football_data_org"]
RETRAIN_AFTER = timedelta(days=7)


def main() -> None:
    settings = get_settings()
    if not settings.db_path.exists():
        bootstrap.main()
        return
    configure_logging(settings.log_level)
    con = open_connection(settings.db_path)
    set_connection(con)
    trained = con.execute(
        "SELECT trained_at FROM model_registry WHERE model_type = 'match' AND is_active"
    ).fetchone()
    weekly = trained is None or datetime.now(UTC) - trained[0] > RETRAIN_AFTER
    for report in run_all(con, None if weekly else FREQUENT):
        print(f"{report.source_id:20} {report.status:12} {report.records:>9}  {report.error or ''}")
    if weekly:
        print("match model:", train_match_model(con)["version"])
    print("predictions:", refresh_predictions(con))
    if weekly:
        print("what-if demo:", refresh_demo(con))


if __name__ == "__main__":
    main()
