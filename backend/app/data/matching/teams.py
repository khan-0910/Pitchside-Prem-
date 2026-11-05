import csv
from dataclasses import dataclass
from pathlib import Path

import duckdb
from rapidfuzz import fuzz

from app.data.normalizers.names import normalize_team

SEED = Path(__file__).parents[1] / "seed" / "teams.csv"
FUZZY_MIN = 90.0
FUZZY_GAP = 6.0


@dataclass(frozen=True)
class TeamMatch:
    team_id: str | None
    confidence: float
    method: str
    best_candidate: str | None = None
    best_score: float = 0.0


def seed_teams(con: duckdb.DuckDBPyConnection) -> None:
    with SEED.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    for r in rows:
        con.execute(
            "INSERT OR REPLACE INTO teams VALUES (?, ?, ?, ?)",
            [r["team_id"], r["name"], r["short_name"], r["tla"]],
        )
        names = {r["name"], r["short_name"], r["team_id"].replace("-", " ")}
        names |= {a for a in r["aliases"].split("|") if a}
        for alias in names:
            con.execute(
                "INSERT OR REPLACE INTO entity_aliases VALUES ('team', ?, ?, ?, 'seed')",
                [r["team_id"], alias, normalize_team(alias)],
            )


class TeamResolver:
    """Override, then known id, then exact alias, then strict fuzzy. Otherwise unresolved."""

    def __init__(self, con: duckdb.DuckDBPyConnection):
        self.con = con
        self.aliases = dict(con.execute(
            "SELECT normalized, entity_id FROM entity_aliases WHERE entity_type='team'"
        ).fetchall())
        self.overrides = {(s, e): t for s, e, t in con.execute(
            """SELECT source_id, external_id, entity_id FROM manual_entity_overrides
               WHERE entity_type='team'"""
        ).fetchall()}
        self.known = {(s, e): t for s, e, t in con.execute(
            "SELECT source_id, external_id, team_id FROM team_source_ids"
        ).fetchall()}

    def match(self, source_id: str, external_id: str, name: str) -> TeamMatch:
        if (source_id, external_id) in self.overrides:
            return TeamMatch(self.overrides[(source_id, external_id)], 1.0, "manual")
        if (source_id, external_id) in self.known:
            return TeamMatch(self.known[(source_id, external_id)], 1.0, "source_id")
        norm = normalize_team(name)
        if norm in self.aliases:
            return TeamMatch(self.aliases[norm], 1.0, "alias")
        best: dict[str, float] = {}
        for alias, team_id in self.aliases.items():
            score = fuzz.token_sort_ratio(norm, alias)
            best[team_id] = max(best.get(team_id, 0.0), score)
        ranked = sorted(best.items(), key=lambda kv: kv[1], reverse=True)
        top_id, top = ranked[0]
        second = ranked[1][1] if len(ranked) > 1 else 0.0
        if top >= FUZZY_MIN and top - second >= FUZZY_GAP:
            return TeamMatch(top_id, top / 100, "fuzzy", top_id, top)
        return TeamMatch(None, 0.0, "unresolved", top_id, top)

    def resolve(self, source_id: str, external_id: str, name: str) -> str | None:
        """Match, persist the mapping for audit, or log it as unresolved."""
        m = self.match(source_id, external_id, name)
        if m.team_id is None:
            self.con.execute(
                """INSERT OR REPLACE INTO unresolved_entities
                   (entity_type, source_id, external_id, source_name, best_candidate, best_score,
                    reason) VALUES ('team', ?, ?, ?, ?, ?, 'low confidence')""",
                [source_id, external_id, name, m.best_candidate, m.best_score],
            )
            return None
        if m.method != "source_id":
            self.con.execute(
                """INSERT OR REPLACE INTO team_source_ids
                   (source_id, external_id, team_id, source_name, confidence, method)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                [source_id, external_id, m.team_id, name, m.confidence, m.method],
            )
            self.known[(source_id, external_id)] = m.team_id
        return m.team_id
