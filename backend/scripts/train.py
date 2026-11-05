"""python -m scripts.train [match] [similarity] [transfer]  -  stop the API first."""

import json
import sys

from app.config import get_settings
from app.core.logging import configure_logging
from app.database.connection import open_connection, set_connection
from app.models.match.train import train_match_model
from app.services.predictions import refresh_predictions


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    con = open_connection(settings.db_path)
    set_connection(con)
    wanted = set(sys.argv[1:]) or {"match"}
    if "match" in wanted:
        print(json.dumps(train_match_model(con), indent=1, default=str))
        print("predictions stored:", refresh_predictions(con))


if __name__ == "__main__":
    main()
