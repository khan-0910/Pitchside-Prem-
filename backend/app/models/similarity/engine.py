"""Player similarity from per-90 FPL statistics.

Only metrics the data actually holds are used. FPL has no shots, key passes, progressive
passes, dribbles or aerials, so `threat` and `creativity` stand in for those styles.
"""

import json
from datetime import UTC, datetime
from typing import Any

import duckdb
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

from app.database.connection import write_lock

MIN_MINUTES = 450
TOP_N = 60
PRIOR_SEASON_WEIGHT = 0.5
STATS = ["xg", "xa", "goals", "assists", "threat", "creativity", "influence", "tackles", "cbi",
         "recoveries", "yellow_cards", "bps", "saves", "xgc", "goals_conceded"]
LABELS = {
    "xg": "xG", "xa": "xA", "goals": "Goals", "assists": "Assists", "threat": "Threat",
    "creativity": "Creativity", "influence": "Influence", "tackles": "Tackles",
    "cbi": "Clearances, blocks, interceptions", "recoveries": "Recoveries", "yellow_cards": "Yellows",
    "bps": "Bonus system", "saves": "Saves", "xgc": "xG conceded", "goals_conceded": "Goals conceded",
}
TRAIT = {"xg": "Finishing", "goals": "Finishing", "xa": "Creative", "assists": "Creative",
         "creativity": "Creative", "threat": "Direct", "tackles": "Ball-winning",
         "cbi": "Stay-at-home", "recoveries": "Ball-recovering", "influence": "Influential",
         "bps": "All-round", "saves": "Shot-stopping", "xgc": "Heavily worked"}
GROUP_NAMES = {"GK": "Goalkeeper", "CB": "Centre-back", "FB": "Full-back", "DM": "Defensive midfielder",
               "CM": "Central midfielder", "AM": "Attacking midfielder", "W": "Winger", "ST": "Striker"}
SUB_POSITION = {
    "Goalkeeper": "GK", "Centre-Back": "CB", "Left-Back": "FB", "Right-Back": "FB",
    "Defensive Midfield": "DM", "Central Midfield": "CM", "Attacking Midfield": "AM",
    "Left Midfield": "W", "Right Midfield": "W", "Left Winger": "W", "Right Winger": "W",
    "Centre-Forward": "ST", "Second Striker": "ST",
}
COARSE = {"Goalkeeper": "GK", "Defender": "CB", "Midfielder": "CM", "Forward": "ST"}
COMPARABLE = {"GK": ["GK"], "CB": ["CB", "FB", "DM"], "FB": ["FB", "CB", "W"],
              "DM": ["DM", "CM", "CB"], "CM": ["CM", "DM", "AM"], "AM": ["AM", "CM", "W", "ST"],
              "W": ["W", "AM", "ST", "FB"], "ST": ["ST", "AM", "W"]}
_OUTFIELD = {"xg": 1, "xa": 1, "goals": .5, "assists": .5, "threat": 1, "creativity": 1, "influence": .7,
             "tackles": 1, "cbi": 1, "recoveries": 1, "yellow_cards": .2, "bps": .4}
WEIGHTS: dict[str, dict[str, float]] = {
    "GK": {"saves": 2, "xgc": 1, "goals_conceded": 1, "influence": 1, "bps": .7, "recoveries": .5},
    "CB": {**_OUTFIELD, "cbi": 2, "tackles": 1.5, "recoveries": 1.5, "creativity": .6, "xg": .5, "xa": .3},
    "FB": {**_OUTFIELD, "tackles": 1.5, "recoveries": 1.3, "creativity": 1.3, "xa": 1.3},
    "DM": {**_OUTFIELD, "tackles": 2, "recoveries": 2, "cbi": 1.3, "creativity": .8},
    "CM": {**_OUTFIELD, "creativity": 1.5, "recoveries": 1.5, "tackles": 1.3, "influence": 1},
    "AM": {**_OUTFIELD, "creativity": 2, "xa": 1.7, "threat": 1.3, "tackles": .5, "cbi": .3},
    "W": {**_OUTFIELD, "threat": 1.7, "creativity": 1.5, "xa": 1.3, "xg": 1.3, "cbi": .3},
    "ST": {**_OUTFIELD, "xg": 2, "threat": 2, "goals": 1, "tackles": .3, "cbi": .3, "recoveries": .4},
}
RADAR = {
    "GK": ["saves", "xgc", "goals_conceded", "influence", "bps", "recoveries"],
    "CB": ["cbi", "tackles", "recoveries", "influence", "creativity", "threat"],
    "FB": ["tackles", "recoveries", "creativity", "xa", "threat", "cbi"],
    "DM": ["tackles", "recoveries", "cbi", "creativity", "influence", "xa"],
    "CM": ["creativity", "recoveries", "tackles", "xa", "xg", "influence"],
    "AM": ["creativity", "xa", "threat", "xg", "influence", "recoveries"],
    "W": ["threat", "creativity", "xg", "xa", "goals", "recoveries"],
    "ST": ["xg", "threat", "goals", "xa", "creativity", "influence"],
}


def position_group(sub_position: str | None, position: str | None) -> str | None:
    return SUB_POSITION.get(sub_position or "") or COARSE.get(position or "")


def per_90(frame: pd.DataFrame) -> pd.DataFrame:
    out = frame.copy()
    for stat in STATS:
        out[stat] = (frame[stat].fillna(0) / (frame["minutes"] / 90)).where(frame["minutes"] > 0, 0.0)
    return out


def zscores(frame: pd.DataFrame) -> pd.DataFrame:
    """Standardise goalkeepers and outfielders apart, so one scale never distorts the other."""
    z = pd.DataFrame(0.0, index=frame.index, columns=STATS)
    keepers = frame["position_group"] == "GK"
    for mask in (keepers, ~keepers):
        part = frame.loc[mask, STATS]
        if len(part):
            std = part.std().replace(0, 1).fillna(1)
            z.loc[mask, STATS] = ((part - part.mean()) / std).clip(-4, 4)
    return z


def weight_vector(group: str) -> np.ndarray:
    return np.array([WEIGHTS[group].get(s, 0.0) for s in STATS])


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    denominator = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / denominator) if denominator else 0.0


def similarity_score(a: np.ndarray, b: np.ndarray, group: str) -> float:
    """0 to 100 likeness of style. A score, not a probability."""
    w = weight_vector(group)
    return round(max(cosine(a * w, b * w), 0.0) * 100, 1)


def rank_similar(z: pd.DataFrame, groups: pd.Series, player: Any, top: int = TOP_N) -> list[tuple[Any, float]]:
    group = groups[player]
    w = weight_vector(group)
    pool = groups[groups.isin(COMPARABLE[group]) & (groups.index != player)].index
    if len(pool) == 0:
        return []
    matrix = z.loc[pool].to_numpy() * w
    query = z.loc[player].to_numpy() * w
    norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(query)
    scores = np.divide(matrix @ query, norms, out=np.zeros(len(pool)), where=norms > 0)
    order = np.argsort(-scores)[:top]
    return [(pool[i], round(max(float(scores[i]), 0.0) * 100, 1)) for i in order]


def assign_roles(z: pd.DataFrame, groups: pd.Series) -> tuple[pd.Series, dict[str, float]]:
    """K-Means inside each position. k comes from silhouette; names come from centroids."""
    roles = pd.Series(index=z.index, dtype=object)
    quality: dict[str, float] = {}
    for group, members in groups.groupby(groups):
        name = GROUP_NAMES[group].lower()
        if len(members) < 12:
            roles[members.index] = GROUP_NAMES[group]
            continue
        w = weight_vector(group)
        x = z.loc[members.index].to_numpy() * w
        best_labels, best_k, best_score = None, 0, -1.0
        for k in (2, 3, 4):
            labels = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(x)
            value = float(silhouette_score(x, labels))
            if value > best_score:
                best_labels, best_k, best_score = labels, k, value
        quality[group] = round(best_score, 3)
        centroids = pd.DataFrame(z.loc[members.index].to_numpy() * w, columns=STATS, index=members.index)
        names_used: set[str] = set()
        for label in range(best_k):
            ids = members.index[best_labels == label]
            ranked = centroids.loc[ids].mean().sort_values(ascending=False)
            trait = next((TRAIT[s] for s in ranked.index
                          if s in TRAIT and WEIGHTS[group].get(s) and TRAIT[s] not in names_used), "Balanced")
            names_used.add(trait)
            roles[ids] = f"{trait} {name}"
    return roles, quality


def load_profiles(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Weighted totals: this season counts fully, last season half."""
    cols = ", ".join(f"coalesce(c.{s}, 0) + {PRIOR_SEASON_WEIGHT} * coalesce(h.{s}, 0) AS {s}" for s in STATS)
    frame = con.execute(
        f"""
        WITH c AS (
            SELECT * FROM player_statistics WHERE source_id = 'fpl'
            QUALIFY row_number() OVER (PARTITION BY player_id ORDER BY observation_date DESC) = 1
        ), h AS (
            SELECT * FROM player_statistics WHERE source_id = 'fpl_history'
              AND season_id = (SELECT max(season_id) FROM player_statistics WHERE source_id = 'fpl_history')
        )
        SELECT p.player_id, p.sub_position, p.position,
               coalesce(c.minutes, 0) + {PRIOR_SEASON_WEIGHT} * coalesce(h.minutes, 0) AS minutes, {cols}
        FROM players p JOIN c USING (player_id) LEFT JOIN h USING (player_id)
        WHERE p.current_team_id IS NOT NULL
        """
    ).df()
    frame["position_group"] = [position_group(s, p) for s, p in
                               zip(frame["sub_position"], frame["position"], strict=True)]
    return frame.dropna(subset=["position_group"])


def season_vectors(con: duckdb.DuckDBPyConnection, source: str, season: str) -> pd.DataFrame:
    frame = con.execute(
        f"""SELECT s.player_id, p.sub_position, p.position, s.minutes, {', '.join('s.' + x for x in STATS)}
            FROM player_statistics s JOIN players p USING (player_id)
            WHERE s.source_id = ? AND s.season_id = ?
            QUALIFY row_number() OVER (PARTITION BY s.player_id ORDER BY s.observation_date DESC) = 1""",
        [source, season],
    ).df()
    frame["position_group"] = [position_group(s, p) for s, p in
                               zip(frame["sub_position"], frame["position"], strict=True)]
    return frame.dropna(subset=["position_group"])


def stability_check(con: duckdb.DuckDBPyConnection, season: str) -> dict[str, float]:
    """Does this season's profile find the same player's last-season profile? A real test."""
    new = season_vectors(con, "fpl", season)
    prior = con.execute("SELECT max(season_id) FROM player_statistics WHERE source_id = 'fpl_history'").fetchone()
    old = season_vectors(con, "fpl_history", prior[0] if prior else "")
    new = per_90(new[new["minutes"] >= 270])
    old = per_90(old[old["minutes"] >= 900])
    if new.empty or old.empty:
        return {}
    a, b = zscores(new).set_axis(new["player_id"]), zscores(old).set_axis(old["player_id"])
    groups_old = old.set_index("player_id")["position_group"]
    groups_new = new.set_index("player_id")["position_group"]
    shared = [p for p in a.index if p in b.index]
    hits, ranks = 0, []
    for player in shared:
        group = groups_new[player]
        w = weight_vector(group)
        pool = b[groups_old.reindex(b.index).isin(COMPARABLE[group])]
        scores = pool.to_numpy() * w @ (a.loc[player].to_numpy() * w)
        norms = np.linalg.norm(pool.to_numpy() * w, axis=1) * np.linalg.norm(a.loc[player].to_numpy() * w)
        scores = np.divide(scores, norms, out=np.zeros(len(pool)), where=norms > 0)
        order = pool.index[np.argsort(-scores)].tolist()
        rank = order.index(player) + 1 if player in order else len(order)
        ranks.append(rank)
        hits += rank <= 10
    return {"players_tested": float(len(shared)), "top10_retrieval": hits / max(len(shared), 1),
            "median_rank": float(np.median(ranks)) if ranks else 0.0,
            "random_top10_rate": 10 / max(len(b), 1)}


def train_similarity(con: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    profiles = load_profiles(con)
    eligible = per_90(profiles[profiles["minutes"] >= MIN_MINUTES]).set_index("player_id")
    if eligible.empty:
        raise ValueError("no players meet the minutes threshold")
    z = zscores(eligible)
    groups = eligible["position_group"]
    roles, quality = assign_roles(z, groups)
    version = f"similarity-v1.{datetime.now(UTC):%Y%m%d%H%M}"
    percentiles = eligible[STATS].groupby(groups).rank(pct=True) * 100

    profile_rows = [
        [version, p, groups[p], roles[p], float(eligible.at[p, "minutes"]),
         json.dumps({s: round(float(eligible.at[p, s]), 3) for s in STATS}),
         json.dumps({s: round(float(percentiles.at[p, s]), 1) for s in STATS}),
         json.dumps({s: round(float(z.at[p, s]), 3) for s in STATS})]
        for p in eligible.index
    ]
    similar_rows = []
    for p in eligible.index:
        for rank, (other, score) in enumerate(rank_similar(z, groups, p), start=1):
            similar_rows.append({"model_version": version, "player_id": p, "similar_player_id": other,
                                 "rank": rank, "score": score})
    stability = stability_check(con, profile_season(con))
    metrics = {"players": float(len(eligible)), "min_minutes": float(MIN_MINUTES), **stability,
               **{f"silhouette_{g}": v for g, v in quality.items()}}
    similar_df = pd.DataFrame(similar_rows)
    with write_lock:
        con.execute("BEGIN")
        con.execute("UPDATE model_registry SET is_active = FALSE WHERE model_type = 'similarity'")
        con.execute(
            """INSERT INTO model_registry (model_version, model_type, algorithm, trained_at, n_train,
               params, is_active, notes)
               VALUES (?, 'similarity', 'k-means roles + weighted cosine', ?, ?, ?, TRUE, ?)""",
            [version, datetime.now(UTC), len(eligible), json.dumps({"stats": STATS, "weights": WEIGHTS}),
             "Current season plus half of last season. Metrics limited to what FPL publishes."],
        )
        con.executemany(
            """INSERT INTO player_profiles (model_version, player_id, position_group, role, minutes, per90,
               percentiles, zscores) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", profile_rows)
        con.register("_s", similar_df)
        con.execute("INSERT INTO player_similarity_results BY NAME SELECT * FROM _s")
        con.unregister("_s")
        con.executemany(
            """INSERT INTO model_metrics (model_version, scope, candidate, metric, value)
               VALUES (?, 'fit', 'model', ?, ?)""",
            [[version, k, v] for k, v in metrics.items()],
        )
        con.execute("COMMIT")
    return {"version": version, **metrics}


def profile_season(con: duckdb.DuckDBPyConnection) -> str:
    row = con.execute("SELECT max(season_id) FROM player_statistics WHERE source_id = 'fpl'").fetchone()
    return row[0] if row else ""
