"""python scripts/daily_injuries.py <snapshot folder>  -  refresh injuries on the public site from FPL.

Runs in GitHub Actions with no database, so injury-keys.json carries the ids and market values.
"""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from app.features.squads import SquadPlayer, club_news

FPL = "https://fantasy.premierleague.com/api/bootstrap-static/"
CLUBS = 20


def build(boot: dict[str, Any], keys: dict[str, Any], now: datetime) -> dict[str, Any]:
    clubs = {t["id"]: keys["teams"][t["short_name"]] for t in boot["teams"]}
    if len(clubs) != CLUBS:
        raise ValueError(f"Expected {CLUBS} clubs from FPL, got {len(clubs)}")
    squads: dict[str, list[SquadPlayer]] = {club["team_id"]: [] for club in clubs.values()}
    news: dict[str, str] = {}
    for e in sorted(boot["elements"], key=lambda e: e["minutes"], reverse=True):
        code = str(e["code"])
        pid = keys["players"].get(code, f"fpl_{code}")
        squads[clubs[e["team"]]["team_id"]].append(SquadPlayer(
            pid, f"{e['first_name']} {e['second_name']}", keys["values"].get(code), 0, e["minutes"],
            availability=e["status"], chance=e["chance_of_playing_next_round"]))
        if e["news"]:
            news[pid] = e["news"]
    clubs_by_id = {c["team_id"]: c for c in clubs.values()}
    return {"updated_at": now.isoformat(), "teams": club_news(squads, news, clubs_by_id)}


def main(folder: Path) -> None:
    keys = json.loads((folder / "injury-keys.json").read_text(encoding="utf-8"))
    response = httpx.get(FPL, headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
    response.raise_for_status()
    result = build(response.json(), keys, datetime.now(UTC))
    (folder / "team-news.json").write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    print("clubs", len(result["teams"]), "flagged", sum(len(t["players"]) for t in result["teams"].values()))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
