"""Link one source's players to canonical players. Date of birth does the heavy lifting."""

import uuid
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date

from rapidfuzz import fuzz

from app.data.normalizers.names import normalize_name

_NAMESPACE = uuid.UUID("7a2c1f4e-55b0-4f86-9a57-0c7d0a4b1e11")
DOB_NAME_MIN = 55.0
DOB_TEAM_NAME_MIN = 35.0
NO_DOB_NAME_MIN = 90.0
NO_DOB_GAP = 8.0
TIE_GAP = 10.0


def canonical_player_id(source_id: str, external_id: str) -> str:
    return "p_" + uuid.uuid5(_NAMESPACE, f"{source_id}:{external_id}").hex[:16]


def coarse_position(position: str | None) -> str | None:
    p = (position or "").lower()
    if p.startswith(("gk", "goal")):
        return "GK"
    if not p:
        return None
    return "OUTFIELD"


@dataclass(frozen=True)
class PlayerRecord:
    entity_id: str
    names: tuple[str, ...]
    dob: date | None = None
    team_id: str | None = None
    position: str | None = None
    norm_names: tuple[str, ...] = field(init=False, default=())

    def __post_init__(self) -> None:
        object.__setattr__(self, "norm_names", tuple(normalize_name(n) for n in self.names if n))


@dataclass(frozen=True)
class PlayerMatch:
    player_id: str | None
    confidence: float
    method: str
    best_candidate: str | None = None
    best_score: float = 0.0
    reason: str | None = None


def _score(a: PlayerRecord, b: PlayerRecord) -> float:
    return max((fuzz.token_set_ratio(x, y) for x in a.norm_names for y in b.norm_names),
               default=0.0)


class PlayerMatcher:
    def __init__(self, candidates: Iterable[PlayerRecord]):
        self.by_dob: dict[date, list[PlayerRecord]] = defaultdict(list)
        self.by_team: dict[str, list[PlayerRecord]] = defaultdict(list)
        for c in candidates:
            if c.dob:
                self.by_dob[c.dob].append(c)
            if c.team_id:
                self.by_team[c.team_id].append(c)

    def match(self, q: PlayerRecord) -> PlayerMatch:
        if q.dob and q.dob in self.by_dob:
            hit = self._match_on_dob(q, self.by_dob[q.dob])
            if hit.player_id or hit.reason == "ambiguous":
                return hit
        return self._match_without_dob(q)

    def _match_on_dob(self, q: PlayerRecord, pool: list[PlayerRecord]) -> PlayerMatch:
        ranked = sorted(((_score(q, c), c) for c in pool), key=lambda x: x[0], reverse=True)
        top_score, top = ranked[0]
        same_team = top.team_id is not None and top.team_id == q.team_id
        if top_score < DOB_NAME_MIN and not (same_team and top_score >= DOB_TEAM_NAME_MIN):
            return PlayerMatch(None, 0.0, "unresolved", top.entity_id, top_score, "name mismatch")
        if len(ranked) > 1 and top_score - ranked[1][0] < TIE_GAP and not same_team:
            return PlayerMatch(None, 0.0, "unresolved", top.entity_id, top_score, "ambiguous")
        return PlayerMatch(top.entity_id, 0.99 if top_score >= DOB_NAME_MIN else 0.85,
                           "dob+name", top.entity_id, top_score)

    def _match_without_dob(self, q: PlayerRecord) -> PlayerMatch:
        # Two known but different birth dates are two people, however close the name.
        pool = [c for c in self.by_team.get(q.team_id or "", []) if not (c.dob and q.dob)
                and coarse_position(c.position) == coarse_position(q.position)]
        if not pool:
            return PlayerMatch(None, 0.0, "unresolved", reason="no candidate")
        ranked = sorted(((_score(q, c), c) for c in pool), key=lambda x: x[0], reverse=True)
        top_score, top = ranked[0]
        second = ranked[1][0] if len(ranked) > 1 else 0.0
        if top_score >= NO_DOB_NAME_MIN and top_score - second >= NO_DOB_GAP:
            return PlayerMatch(top.entity_id, 0.8, "team+name", top.entity_id, top_score)
        return PlayerMatch(None, 0.0, "unresolved", top.entity_id, top_score, "low confidence")
