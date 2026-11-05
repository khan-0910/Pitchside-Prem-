"""python -m scripts.export_static <folder>  -  copy the running API into JSON files for static hosting.

Exported data is a snapshot, so nothing in it may claim to be live.
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import httpx

API = "http://127.0.0.1:8000/api/v1"
SIMILAR_LIMIT = 50
WORKERS = 8


def not_live(payload: Any) -> Any:
    return json.loads(json.dumps(payload).replace('"status": "LIVE"', '"status": "CACHED"'))


class Exporter:
    def __init__(self, out: Path):
        self.out = out
        self.http = httpx.Client(base_url=API, timeout=60)

    def get(self, path: str, **query: Any) -> Any:
        response = self.http.get(path, params=query)
        response.raise_for_status()
        return response.json()

    def rows(self, path: str, size: int, **query: Any) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        while True:
            page = self.get(path, limit=size, offset=len(items), **query)
            items += page["items"]
            if len(items) >= page["total"] or not page["items"]:
                return items

    def write(self, name: str, payload: Any) -> None:
        target = self.out / f"{name}.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    def copy(self, name: str, path: str, **query: Any) -> bool:
        """Copy one endpoint. Some players have no valuation, which the API reports as 404."""
        try:
            self.write(name, self.get(path, **query))
        except httpx.HTTPStatusError as error:
            if error.response.status_code != 404:
                raise
            return False
        return True


def export(out: Path) -> dict[str, int]:
    job = Exporter(out)
    for name, path, query in (
        ("teams", "/teams", {}), ("standings", "/standings", {}),
        ("upcoming", "/fixtures/upcoming", {"limit": 100}),
        ("undervalued", "/transfers/undervalued", {"limit": 100}),
        ("team-news", "/matches/team-news", {}),
        ("model-metrics", "/models/metrics", {}), ("models", "/models", {}),
        ("scenario/demo-latest", "/what-if/demo-latest", {}),
    ):
        job.copy(name, path, **query)
    job.write("data-sources", not_live(job.get("/data/sources")))
    job.write("data-health", not_live(job.get("/data/health")))
    job.write("fixtures", job.rows("/fixtures", 200))
    job.write("results", job.get("/matches/results", limit=30)["items"])
    values = job.get("/transfers/values", limit=1)
    job.write("values", {**values, "items": job.rows("/transfers/values", 200)})

    teams = [t["team_id"] for t in job.get("/teams")]
    players = job.rows("/players", 100)
    job.write("players", players)
    tasks = [(f"form/{t}", f"/matches/teams/{t}/form", {}) for t in teams]
    tasks += [(f"squad/{t}", f"/what-if/teams/{t}/squad", {}) for t in teams]
    for player in players:
        pid = player["player_id"]
        tasks += [(f"player/{pid}", f"/players/{pid}", {}),
                  (f"similar/{pid}", f"/players/{pid}/similar", {"limit": SIMILAR_LIMIT}),
                  (f"valuation/{pid}", f"/transfers/{pid}/valuation", {})]
    with ThreadPoolExecutor(WORKERS) as pool:
        done = list(pool.map(lambda t: job.copy(t[0], t[1], **t[2]), tasks))
    return {"players": len(players), "files": sum(done), "missing": done.count(False)}


if __name__ == "__main__":
    print(export(Path(sys.argv[1])))
