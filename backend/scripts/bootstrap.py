"""python -m scripts.bootstrap  -  everything a fresh checkout needs, in order. Stop the API first."""

from app.config import get_settings
from app.core.logging import configure_logging
from app.data.runner import run_all
from app.database.connection import open_connection, set_connection
from app.models.match.train import train_match_model
from app.models.similarity.engine import train_similarity
from app.models.transfer.train import train_transfer_model
from app.services.predictions import refresh_predictions
from app.services.simulations import run_simulation
from app.services.what_if import refresh_demo


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    con = open_connection(settings.db_path)
    set_connection(con)
    for report in run_all(con):
        print(f"{report.source_id:20} {report.status:12} {report.records:>9}  {report.error or ''}")
    print("match model:", train_match_model(con)["version"])
    print("predictions:", refresh_predictions(con))
    print("similarity:", train_similarity(con)["version"])
    print("transfer:", train_transfer_model(con)["version"])
    print("simulation:", run_simulation(con)["simulation_id"])
    print("what-if demo:", refresh_demo(con))


if __name__ == "__main__":
    main()
