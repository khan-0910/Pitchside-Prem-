"""Player replacement. The swap edits the squad inputs and the real match model re-predicts.

No arbitrary percentages anywhere: if the swap leaves the likely 14 alone, nothing moves,
and the response says so.
"""

import json
import threading
import uuid
from datetime import UTC, datetime
from typing import Any

import duckdb
import pandas as pd

from app.core.exceptions import InvalidRequestError, NotFoundError
from app.database.connection import write_lock
from app.database.query import scalar
from app.features.match_features import FEATURES
from app.features.squads import SquadPlayer, current_rosters, full_squads, likely_squad, squad_features
from app.models.match.inference import MatchModel, most_likely_score, score_matrix
from app.models.similarity.engine import COMPARABLE, GROUP_NAMES, LABELS, RADAR
from app.services import players as player_service
from app.services.predictions import require_model, upcoming_frame

ASSUMPTIONS = [
    "The new player takes the outgoing player's exact place in the squad order.",
    "Expected minutes stay the same as the outgoing player's. Nobody else's role changes.",
    "The model sees squad value and goal output per 90 of the likely 14. It knows no tactics or fit.",
    "Statistics were produced at the player's current club and may not carry over.",
    "No fee, wages, registration rules or squad limits are considered.",
    "Values are recorded third-party market values, not prices.",
]
_frame_lock = threading.Lock()
_frame_cache: tuple[Any, pd.DataFrame] | None = None


def _upcoming(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Building features takes seconds, so reuse them until new predictions land."""
    global _frame_cache
    stamp = scalar(con, "SELECT max(predicted_at) FROM match_predictions")
    with _frame_lock:
        if _frame_cache is None or _frame_cache[0] != stamp:
            _frame_cache = (stamp, upcoming_frame(con))
        return _frame_cache[1]


def _team_fixtures(frame: pd.DataFrame, team: str, ids: list[str]) -> pd.DataFrame:
    mine = frame[(frame["home_team_id"] == team) | (frame["away_team_id"] == team)]
    if ids:
        chosen = mine[mine["fixture_id"].isin(ids)]
        if len(chosen) != len(set(ids)):
            raise InvalidRequestError("Every fixture must be an upcoming match for this club")
        return chosen.sort_values("date")
    return mine[mine["status"] == "SCHEDULED"].sort_values("date").head(5)


def swap(roster: list[SquadPlayer], out_id: str, incoming: SquadPlayer) -> list[SquadPlayer]:
    return [incoming if p.player_id == out_id else p for p in roster]


def apply_squad(frame: pd.DataFrame, team: str, value: float, ga90: float) -> pd.DataFrame:
    """Overwrite this club's squad inputs. Opponents and form stay exactly as they are."""
    out = frame.copy()
    home = out["home_team_id"] == team
    away = out["away_team_id"] == team
    out.loc[home, "squad_value_home"] = value
    out.loc[home, "squad_ga90_home"] = ga90
    out.loc[away, "squad_value_away"] = value
    out.loc[away, "squad_ga90_away"] = ga90
    out["squad_value_diff"] = out["squad_value_home"] - out["squad_value_away"]
    return out


def _predict(model: MatchModel, frame: pd.DataFrame) -> list[dict[str, Any]]:
    proba = model.predict_proba(frame)
    xg_h, xg_a = model.predict_goals(frame)
    out = []
    for i in range(len(frame)):
        grid = score_matrix(float(xg_h[i]), float(xg_a[i]), proba[i])
        out.append({"home_win": float(proba[i, 0]), "draw": float(proba[i, 1]), "away_win": float(proba[i, 2]),
                    "xg_home": float(xg_h[i]), "xg_away": float(xg_a[i]),
                    "most_likely_score": most_likely_score(grid)})
    return out


def _player_card(con: duckdb.DuckDBPyConnection, player_id: str) -> dict[str, Any]:
    detail = player_service.player_detail(con, player_id)
    return {k: detail.get(k) for k in (
        "player_id", "name", "age", "team", "team_id", "position", "sub_position", "position_group",
        "role", "minutes", "goals", "assists", "xg", "xa", "market_value_eur", "valuation_date",
        "availability", "profile")}


def trade_offs(out_card: dict[str, Any], in_card: dict[str, Any]) -> dict[str, list[str]]:
    a, b = out_card.get("profile"), in_card.get("profile")
    if not a or not b:
        return {"advantages": [], "disadvantages": [],
                "note": ["One of these players has too few minutes for a statistical comparison."]}
    gains: list[str] = []
    losses: list[str] = []
    for stat in RADAR[a["position_group"]]:
        before, after = a["per90"][stat], b["per90"][stat]
        if max(before, after) == 0 or abs(after - before) / max(before, after) < 0.1:
            continue
        # Fewer goals conceded or xG conceded is better, and these rates lower with a keeper.
        better = after < before if stat in ("goals_conceded", "xgc") else after > before
        (gains if better else losses).append(f"{LABELS[stat]} per 90: {after:.2f} vs {before:.2f}")
    return {"advantages": gains, "disadvantages": losses, "note": []}


def run_replacement(
    con: duckdb.DuckDBPyConnection, team: str, out_id: str, in_id: str, fixture_ids: list[str],
) -> dict[str, Any]:
    model = require_model(con)
    if out_id == in_id:
        raise InvalidRequestError("Pick two different players")
    squads = full_squads(con)
    if team not in squads:
        raise NotFoundError("Club not found")
    squad = squads[team]
    outgoing = next((p for p in squad if p.player_id == out_id), None)
    if outgoing is None:
        raise InvalidRequestError("The outgoing player is not in this squad")
    if any(p.player_id == in_id for p in squad):
        raise InvalidRequestError("The replacement is already in this squad")
    incoming = next((p for r in squads.values() for p in r if p.player_id == in_id), None)
    if incoming is None:
        raise NotFoundError("Replacement player not found")

    available = current_rosters(con).get(team, [])
    before_14 = likely_squad(available)
    after_14 = likely_squad(swap(available, out_id, incoming))
    changed = [p.player_id for p in before_14] != [p.player_id for p in after_14]
    value_before, ga_before = squad_features(before_14)
    value_after, ga_after = squad_features(after_14)

    fixtures = _team_fixtures(_upcoming(con), team, fixture_ids)
    baseline = apply_squad(fixtures, team, value_before, ga_before)
    scenario = apply_squad(fixtures, team, value_after, ga_after)
    before_rows, after_rows = _predict(model, baseline), _predict(model, scenario)
    names = dict(con.execute("SELECT team_id, name FROM teams").fetchall())

    matches = []
    for i, row in enumerate(fixtures.itertuples()):
        b, a = before_rows[i], after_rows[i]
        at_home = row.home_team_id == team
        win_key = "home_win" if at_home else "away_win"
        matches.append({
            "fixture_id": row.fixture_id, "date": row.date, "is_home": at_home,
            "home_team": names[row.home_team_id], "away_team": names[row.away_team_id],
            "before": b, "after": a, "win_change": a[win_key] - b[win_key],
            "expected_goals_change": (a["xg_home"] - b["xg_home"]) if at_home else (a["xg_away"] - b["xg_away"]),
        })

    total_before = sum(p.value_eur or 0 for p in squad)
    total_after = total_before - (outgoing.value_eur or 0) + (incoming.value_eur or 0)
    out_card, in_card = _player_card(con, out_id), _player_card(con, in_id)
    group_out, group_in = out_card.get("position_group"), in_card.get("position_group")
    payload: dict[str, Any] = {
        "scenario_id": uuid.uuid4().hex[:16], "hypothetical": True, "created_at": datetime.now(UTC),
        "team_id": team, "team": names[team], "model_version": model.version,
        "player_out": out_card, "player_in": in_card,
        "model_inputs_changed": changed,
        "model_inputs": {
            "squad_value_log": {"before": value_before, "after": value_after},
            "squad_goal_output_per_90": {"before": ga_before, "after": ga_after},
            "features_changed": [f for f in FEATURES if "squad" in f],
        },
        "squad_value": {"before": total_before, "after": total_after, "change": total_after - total_before,
                        "unvalued_players": sum(1 for p in squad if not p.value_eur)},
        "positional_balance": _balance(con, squad, out_id, group_out, group_in),
        "matches": matches,
        "trade_offs": trade_offs(out_card, in_card),
        "position_warning": _position_warning(group_out, group_in),
        "assumptions": ASSUMPTIONS,
        "notes": [] if changed else ["The outgoing player is outside the likely 14, so the model inputs "
                                     "did not change and neither did the predictions."],
    }
    with write_lock:
        con.execute("INSERT INTO what_if_scenarios VALUES (?, ?, ?)",
                    [payload["scenario_id"], payload["created_at"], json.dumps(payload, default=str)])
    return payload


def _position_warning(out_group: str | None, in_group: str | None) -> str | None:
    if out_group and in_group and in_group not in COMPARABLE[out_group]:
        return f"{GROUP_NAMES[in_group]} replacing a {GROUP_NAMES[out_group].lower()}: a real role change."
    return None


def _balance(con, squad: list[SquadPlayer], out_id: str, group_out: str | None, group_in: str | None) -> dict:
    version = "(SELECT model_version FROM model_registry WHERE model_type='similarity' AND is_active LIMIT 1)"
    rows = dict(con.execute(
        f"""SELECT player_id, position_group FROM player_profiles WHERE model_version = {version}
            AND player_id IN (SELECT unnest(?))""", [[p.player_id for p in squad]]
    ).fetchall())
    before: dict[str, int] = {}
    for group in rows.values():
        before[group] = before.get(group, 0) + 1
    after = dict(before)
    if out_id in rows and group_out:
        after[group_out] = after.get(group_out, 0) - 1
    if group_in:
        after[group_in] = after.get(group_in, 0) + 1
    return {"before": before, "after": after, "note": "Counts players with a statistical profile."}


DEMO_ID = "demo-latest"


def refresh_demo(con: duckdb.DuckDBPyConnection) -> str | None:
    """A worked example for the homepage: the leader's busiest forward, swapped for a close match."""
    row = con.execute(
        """WITH top AS (
               SELECT team_id FROM league_standings
               WHERE season_id = (SELECT max(season_id) FROM fixtures)
               QUALIFY row_number() OVER (ORDER BY snapshot_date DESC, position) = 1)
           SELECT p.player_id, p.current_team_id FROM players p
           JOIN player_statistics s USING (player_id)
           JOIN player_similarity_results r USING (player_id)
           WHERE p.current_team_id = (SELECT team_id FROM top) AND p.position = 'Forward'
             AND s.source_id = 'fpl'
           ORDER BY s.observation_date DESC, s.minutes DESC LIMIT 1"""
    ).fetchone()
    if not row:
        return None
    similar = player_service.similar_players(con, row[0], limit=1, group=None, team=None, age_max=None,
                                             exclude_team=True)
    if not similar["items"]:
        return None
    payload = run_replacement(con, row[1], row[0], similar["items"][0]["player_id"], [])
    payload["demo_of"], payload["scenario_id"] = payload["scenario_id"], DEMO_ID
    with write_lock:
        con.execute("INSERT OR REPLACE INTO what_if_scenarios VALUES (?, ?, ?)",
                    [DEMO_ID, payload["created_at"], json.dumps(payload, default=str)])
    return DEMO_ID


def get_scenario(con: duckdb.DuckDBPyConnection, scenario_id: str) -> dict[str, Any]:
    payload = scalar(con, "SELECT payload FROM what_if_scenarios WHERE scenario_id = ?", [scenario_id])
    if payload is None:
        raise NotFoundError("Scenario not found")
    return json.loads(payload)


def squad_view(con: duckdb.DuckDBPyConnection, team: str) -> dict[str, Any]:
    squads = full_squads(con)
    if team not in squads:
        raise NotFoundError("Club not found")
    likely = {p.player_id for p in likely_squad(current_rosters(con).get(team, []))}
    version = "(SELECT model_version FROM model_registry WHERE model_type='similarity' AND is_active LIMIT 1)"
    profiles = {r[0]: r[1:] for r in con.execute(
        f"""SELECT p.player_id, pp.position_group, pp.role, p.availability FROM players p
            LEFT JOIN player_profiles pp ON pp.player_id = p.player_id AND pp.model_version = {version}
            WHERE p.current_team_id = ?""", [team]
    ).fetchall()}
    players = [{
        "player_id": p.player_id, "name": p.name, "position": p.position, "market_value_eur": p.value_eur,
        "minutes": p.season_minutes, "in_likely_14": p.player_id in likely,
        "position_group": profiles.get(p.player_id, (None, None, None))[0],
        "role": profiles.get(p.player_id, (None, None, None))[1],
        "availability": profiles.get(p.player_id, (None, None, None))[2],
    } for p in squads[team]]
    names = dict(con.execute("SELECT team_id, name FROM teams").fetchall())
    upcoming = con.execute(
        """SELECT fixture_id, match_date, home_team_id, away_team_id FROM fixtures
           WHERE status = 'SCHEDULED' AND (home_team_id = ? OR away_team_id = ?)
           ORDER BY match_date LIMIT 5""", [team, team]
    ).fetchall()
    return {"team_id": team, "team": names[team], "players": players, "fixtures": [
        {"fixture_id": r[0], "date": r[1], "home_team": names[r[2]], "away_team": names[r[3]]}
        for r in upcoming]}
