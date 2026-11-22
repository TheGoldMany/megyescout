"""Analytics & proxy-metric engine.

Reads raw appearances from Postgres, computes per (player, competition) season
metrics, infers positions, scores the 6-axis radar + Scouting Index, tags
archetypes and computes Cosine-Similarity "statistical twins".

Run:  python analytics.py
"""
from __future__ import annotations

import json
import logging
from collections import Counter

import numpy as np
import pandas as pd
from sqlalchemy import text

import db
import market

log = logging.getLogger("hunscout.analytics")

RADAR_AXES = ["minutes_stability", "goal_threat", "team_impact", "discipline", "league_level", "experience"]
SENIOR = "senior_11v11"
MIN_MINUTES_FOR_SIMILARITY = 450
ON_PITCH_THRESHOLD = 60   # minutes; "with player" = played >= 60
SIMILAR_TOP_N = 5

# Shirt-number -> position prior (Hungarian lower-league convention)
SHIRT_POSITION = {1: "GK", 12: "GK", 31: "GK", 2: "DEF", 3: "DEF", 4: "DEF", 5: "DEF",
                  6: "MID", 8: "MID", 10: "MID", 7: "FWD", 9: "FWD", 11: "FWD"}
POSITIONS = ["GK", "DEF", "MID", "FWD"]


# ---------------------------------------------------------------------------
# pure helpers (unit-tested)
# ---------------------------------------------------------------------------
def season_start_year(season: str) -> int:
    return int(season.split("/")[0])


def youth_rule_window(season: str) -> tuple[int, int]:
    """Birth-year window for the Hungarian youth rule, e.g. 2026/2027 -> (2006, 2008)."""
    y = season_start_year(season)
    return y - 20, y - 18


def age_curve_score(age: int | None) -> float:
    """0-100. Peaks at 18-22 (youth-rule + resale value for a Megye I / NB III club)."""
    if age is None:
        return 50.0
    table = {15: 55, 16: 65, 17: 85, 18: 100, 19: 100, 20: 100, 21: 100, 22: 95, 23: 85, 24: 75,
             25: 65, 26: 58, 27: 52, 28: 48, 29: 42, 30: 38, 31: 32, 32: 28, 33: 24}
    if age < 15:
        return 40.0
    return float(table.get(age, 20))


SUB_PAIR_WEIGHT = 60  # one like-for-like substitution ~ two thirds of a match worth of shirt evidence


def infer_position(shirts: list[tuple[int | None, int]], goals_per_90: float, sub_in_share: float,
                   sub_partners: list[tuple[str, float]] | None = None) -> tuple[str, str | None, float]:
    """Infer (primary, secondary, confidence) from minutes-weighted shirt numbers.

    shirts: list of (shirt_number, minutes). Unknown numbers (13-30, 77, ...) carry no
    shirt vote and fall back to goal output. goals_per_90 then nudges the result
    (a "defender" scoring 0.6/90 is really a midfielder/forward), and frequent
    substitute entries lean attacking (coaches chase games with forwards).

    sub_partners: (partner_position, partner_confidence) for every substitution the player
    was part of ("csereirány"). Coaches mostly change like for like, so each pairing votes
    for the partner's position, weighted by how sure we are about the partner.
    """
    votes: Counter[str] = Counter()
    unknown = 0
    for number, minutes in shirts:
        pos = SHIRT_POSITION.get(number) if number is not None else None
        w = max(minutes, 1)
        if pos:
            votes[pos] += w
        else:
            unknown += w
    partner_votes: Counter[str] = Counter()
    for partner_pos, partner_conf in sub_partners or []:
        partner_votes[partner_pos] += SUB_PAIR_WEIGHT * max(0.0, min(1.0, partner_conf))
    if partner_votes:
        # pairing evidence replaces part of the (weak) goal-output prior for unknown numbers
        absorbed = min(unknown, sum(partner_votes.values()))
        unknown -= absorbed * 0.5
        votes.update(partner_votes)
    total = sum(votes.values()) + unknown
    if total == 0:
        return "MID", None, 0.0

    # Goal-output prior for minutes without an informative shirt number.
    if unknown:
        if goals_per_90 >= 0.45:
            votes["FWD"] += unknown * 0.7
            votes["MID"] += unknown * 0.3
        elif goals_per_90 >= 0.18:
            votes["MID"] += unknown * 0.7
            votes["FWD"] += unknown * 0.3
        elif goals_per_90 >= 0.06:
            votes["MID"] += unknown * 0.6
            votes["DEF"] += unknown * 0.3
            votes["FWD"] += unknown * 0.1
        else:
            votes["DEF"] += unknown * 0.5
            votes["MID"] += unknown * 0.4
            votes["FWD"] += unknown * 0.1

    if votes.get("GK", 0) / total >= 0.5:
        return "GK", None, round(votes["GK"] / total, 2)
    votes.pop("GK", None)

    # Output-based adjustments
    if goals_per_90 >= 0.55:
        votes["FWD"] += total * 0.35
    elif goals_per_90 >= 0.3:
        votes["MID"] += total * 0.15
        votes["FWD"] += total * 0.10
    elif goals_per_90 < 0.05 and votes.get("FWD", 0) > 0:
        votes["MID"] += votes["FWD"] * 0.3
    if sub_in_share >= 0.5:
        votes["FWD"] += total * 0.10

    ranked = votes.most_common()
    if not ranked:
        return "MID", None, 0.0
    vote_total = sum(votes.values())
    primary, pv = ranked[0]
    secondary = None
    if len(ranked) > 1 and ranked[1][1] / vote_total >= 0.22:
        secondary = ranked[1][0]
    return primary, secondary, round(pv / vote_total, 2)


def clip(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return float(max(lo, min(hi, v)))


def league_level_score(multiplier: float) -> float:
    return clip((multiplier - 0.5) / (1.8 - 0.5) * 100)


def experience_score(academy: bool, highest_tier: int | None, career_senior_apps: int, seasons: int) -> float:
    tier_bonus = {1: 40, 2: 32, 3: 24, 4: 12, 5: 6}.get(highest_tier or 99, 0)
    return clip((30 if academy else 0) + tier_bonus + min(20, career_senior_apps / 6) + min(10, seasons * 2))


def team_impact_score(on_off: float | None) -> float:
    if on_off is None or (isinstance(on_off, float) and np.isnan(on_off)):
        return 50.0
    return clip(50 + on_off * 40)


def discipline_score(yellows_per_90: float, reds: int) -> float:
    return clip(100 - yellows_per_90 * 150 - reds * 15)


def scouting_index(league_level: float, age_score: float, performance: float, pedigree: float) -> int:
    """Weighted 0-100: league strength 35%, age curve 25%, performance 25%, pedigree 15%."""
    return int(round(clip(0.35 * league_level + 0.25 * age_score + 0.25 * performance + 0.15 * pedigree)))


def assign_archetypes(row: dict, season: str) -> list[str]:
    tags: list[str] = []
    mp = row["matches_played"] or 0
    if mp == 0:
        return tags
    pos = row.get("primary_position")
    if (row["minutes_share_pct"] or 0) >= 85 and row["starts"] >= 0.8 * mp:
        tags.append("Motor")
    if row["sub_ins"] >= max(3, 0.4 * mp) and (row["sub_goals"] >= 2 or (row["sub_goals_per_90"] or 0) >= 0.5):
        tags.append("Szupercsere")
    if row["goals"] >= 5 and ((row["goals_per_90"] or 0) >= 0.6 or (row["team_goal_share"] or 0) >= 0.25):
        tags.append("Gólfelelős")
    if pos in ("MID", "DEF") and (row["yellows_per_90"] or 0) >= 0.22 and (row["minutes_share_pct"] or 0) >= 55:
        tags.append("Ütköző")
    if pos == "GK" and mp >= 5 and row["clean_sheets"] / mp >= 0.35:
        tags.append("Biztos kéz")
    lo, hi = youth_rule_window(season)
    by = row.get("birth_year")
    if by and lo <= by <= hi and row["total_minutes"] >= 270:
        tags.append("Fiatalszabály-opció")
    return tags


def cosine_top_n(ids: list, vectors: np.ndarray, groups: list[str], n: int = SIMILAR_TOP_N
                 ) -> list[tuple[object, object, float, int]]:
    """Top-n cosine neighbours within the same position group.

    Vectors are z-scored per axis first: raw 0-100 radar values are all positive,
    which would make every pair look ~0.9 similar.
    """
    if len(ids) < 2:
        return []
    X = vectors.astype(float)
    # floor the spread (radar scale is 0-100) so near-constant axes are not blown up to unit variance
    std = np.maximum(X.std(axis=0), 8.0)
    Z = (X - X.mean(axis=0)) / std
    norms = np.linalg.norm(Z, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    Z = Z / norms
    S = Z @ Z.T
    out = []
    groups_arr = np.array(groups)
    for i, pid in enumerate(ids):
        mask = (groups_arr == groups_arr[i])
        mask[i] = False
        cand = np.where(mask)[0]
        if cand.size == 0:
            continue
        order = cand[np.argsort(-S[i, cand])][:n]
        for rank, j in enumerate(order, start=1):
            out.append((pid, ids[j], round(float(S[i, j]), 4), rank))
    return out


# ---------------------------------------------------------------------------
# pipeline
# ---------------------------------------------------------------------------
def _load(conn) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    apps = pd.read_sql(text("""
        SELECT a.player_id, a.club_id, a.shirt_number, a.is_starter, a.minutes_played, a.goals, a.own_goals,
               a.yellow_cards, a.red_cards, a.replaced_player_id,
               m.id AS match_id, m.home_club_id, m.away_club_id, m.home_goals, m.away_goals,
               c.id AS competition_id, c.season, c.category, c.tier, c.strength_multiplier::float AS multiplier
        FROM match_appearances a
        JOIN matches m ON m.id = a.match_id AND m.status = 'played'
        JOIN competitions c ON c.id = m.competition_id
    """), conn)
    matches = pd.read_sql(text("""
        SELECT m.id AS match_id, m.competition_id, m.home_club_id, m.away_club_id, m.home_goals, m.away_goals
        FROM matches m WHERE m.status = 'played'
    """), conn)
    players = pd.read_sql(text("""
        SELECT p.id AS player_id, p.birth_year, p.has_academy_pedigree, p.highest_tier_played,
               COALESCE(cs.senior_apps, 0) AS career_senior_apps, COALESCE(cs.seasons, 0) AS career_seasons,
               COALESCE(cs.youth_top, false) AS youth_top
        FROM players p
        LEFT JOIN (
            SELECT player_id,
                   SUM(appearances) FILTER (WHERE category = 'senior_11v11') AS senior_apps,
                   COUNT(DISTINCT season) AS seasons,
                   bool_or(category = 'youth' AND appearances > 0 AND tier IS NULL AND
                           (competition_name ILIKE '%kiemelt%' OR competition_name ILIKE '%országos%')) AS youth_top
            FROM player_career_stints GROUP BY player_id
        ) cs ON cs.player_id = p.id
    """), conn)
    return apps, matches, players


def _points(gf: int, ga: int) -> int:
    return 3 if gf > ga else (1 if gf == ga else 0)


def compute(apps: pd.DataFrame, matches: pd.DataFrame, players: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (metrics rows, positions per player)."""
    if apps.empty:
        return pd.DataFrame(), pd.DataFrame()

    apps = apps.copy()
    apps["is_home"] = apps["club_id"] == apps["home_club_id"]
    apps["gf"] = np.where(apps["is_home"], apps["home_goals"], apps["away_goals"])
    apps["ga"] = np.where(apps["is_home"], apps["away_goals"], apps["home_goals"])
    apps["points"] = [_points(f, a) for f, a in zip(apps["gf"], apps["ga"])]

    # Per-club match list for every competition (for minutes share + on/off).
    home = matches.rename(columns={"home_club_id": "club_id", "home_goals": "gf", "away_goals": "ga"})[
        ["match_id", "competition_id", "club_id", "gf", "ga"]]
    away = matches.rename(columns={"away_club_id": "club_id", "away_goals": "gf", "home_goals": "ga"})[
        ["match_id", "competition_id", "club_id", "gf", "ga"]]
    club_matches = pd.concat([home, away], ignore_index=True)
    club_matches["points"] = [_points(f, a) for f, a in zip(club_matches["gf"], club_matches["ga"])]
    club_goals = club_matches.groupby(["competition_id", "club_id"])["gf"].sum().rename("team_goals")
    club_games = club_matches.groupby(["competition_id", "club_id"]).size().rename("team_matches")

    # ---- positions (senior 11v11 + cup, all seasons) ----
    # pass 1: shirt numbers + goal output; pass 2: add substitution-direction evidence
    senior = apps[apps["category"].isin([SENIOR, "cup"])]
    features = {}
    for pid, g in senior.groupby("player_id"):
        mins = g["minutes_played"].sum()
        g90 = g["goals"].sum() / mins * 90 if mins else 0.0
        sub_share = (~g["is_starter"]).mean()
        shirts = list(zip(g["shirt_number"].where(g["shirt_number"].notna(), None).map(
            lambda x: int(x) if x is not None else None), g["minutes_played"]))
        features[pid] = (shirts, g90, sub_share)
    first = {pid: infer_position(*f) for pid, f in features.items()}

    partners: dict = {}
    if "replaced_player_id" in senior.columns:
        pairs = senior[senior["replaced_player_id"].notna()][["player_id", "replaced_player_id"]]
        for sub_id, off_id in pairs.itertuples(index=False):
            if sub_id in first and off_id in first:
                partners.setdefault(sub_id, []).append((first[off_id][0], first[off_id][2]))
                partners.setdefault(off_id, []).append((first[sub_id][0], first[sub_id][2]))

    pos_rows = []
    for pid, f in features.items():
        primary, secondary, conf = infer_position(*f, sub_partners=partners.get(pid)) if pid in partners else first[pid]
        pos_rows.append({"player_id": pid, "primary_position": primary, "secondary_position": secondary,
                         "position_confidence": conf})
    positions = pd.DataFrame(pos_rows)

    # ---- per (player, competition) aggregates ----
    apps["sub_goals"] = np.where(~apps["is_starter"], apps["goals"], 0)
    apps["sub_minutes"] = np.where(~apps["is_starter"], apps["minutes_played"], 0)
    apps["clean_sheet"] = (apps["ga"] == 0) & (apps["minutes_played"] >= ON_PITCH_THRESHOLD)
    agg = apps.groupby(["player_id", "competition_id"]).agg(
        season=("season", "first"), category=("category", "first"), tier=("tier", "first"),
        multiplier=("multiplier", "first"),
        club_id=("club_id", lambda s: s.mode().iat[0]),
        matches_played=("match_id", "nunique"), starts=("is_starter", "sum"),
        sub_ins=("is_starter", lambda s: int((~s).sum())), total_minutes=("minutes_played", "sum"),
        goals=("goals", "sum"), yellows=("yellow_cards", "sum"), red_cards=("red_cards", "sum"),
        clean_sheets=("clean_sheet", "sum"), sub_goals=("sub_goals", "sum"), sub_minutes=("sub_minutes", "sum"),
    ).reset_index()

    agg = agg.join(club_games, on=["competition_id", "club_id"]).join(club_goals, on=["competition_id", "club_id"])
    agg["minutes_share_pct"] = (agg["total_minutes"] / (agg["team_matches"] * 90) * 100).clip(upper=100).round(1)
    per90 = agg["total_minutes"].replace(0, np.nan) / 90
    agg["goals_per_90"] = (agg["goals"] / per90).round(2).fillna(0)
    agg["yellows_per_90"] = (agg["yellows"] / per90).round(2).fillna(0)
    agg["sub_goals_per_90"] = (agg["sub_goals"] / (agg["sub_minutes"].replace(0, np.nan) / 90)).fillna(0)
    agg["team_goal_share"] = (agg["goals"] / agg["team_goals"].replace(0, np.nan)).fillna(0)

    # ---- on/off: team PPG with player (>=60') vs without ----
    on = apps[apps["minutes_played"] >= ON_PITCH_THRESHOLD][["player_id", "competition_id", "club_id", "match_id"]]
    on_sets = on.groupby(["player_id", "competition_id", "club_id"])["match_id"].apply(set).to_dict()
    cm_idx = {k: g for k, g in club_matches.groupby(["competition_id", "club_id"])}
    ppg_with, ppg_without = [], []
    for r in agg.itertuples():
        cm = cm_idx.get((r.competition_id, r.club_id))
        played = on_sets.get((r.player_id, r.competition_id, r.club_id), set())
        if cm is None or len(played) < 2:
            ppg_with.append(np.nan)
            ppg_without.append(np.nan)
            continue
        mask = cm["match_id"].isin(played)
        w, wo = cm.loc[mask, "points"], cm.loc[~mask, "points"]
        ppg_with.append(round(w.mean(), 2) if len(w) else np.nan)
        ppg_without.append(round(wo.mean(), 2) if len(wo) >= 2 else np.nan)
    agg["team_ppg_with_player"] = ppg_with
    agg["team_ppg_without_player"] = ppg_without
    agg["on_off_impact"] = (agg["team_ppg_with_player"] - agg["team_ppg_without_player"]).round(2)

    # ---- join player attributes ----
    agg = agg.merge(players, on="player_id", how="left")
    if not positions.empty:
        agg = agg.merge(positions[["player_id", "primary_position"]], on="player_id", how="left")
    else:
        agg["primary_position"] = None
    agg["academy"] = agg["has_academy_pedigree"].fillna(False) | agg["youth_top"].fillna(False)

    # ---- radar ----
    # goal threat = percentile of goals/90 within (season, position) among rows with >= 270'
    agg["gt_pct"] = np.nan
    eligible = agg["total_minutes"] >= 270
    agg.loc[eligible, "gt_pct"] = agg[eligible].groupby(["season", "primary_position"])["goals_per_90"].rank(pct=True)

    rows = []
    for r in agg.to_dict("records"):
        season = r["season"]
        age = season_start_year(season) - int(r["birth_year"]) if pd.notna(r.get("birth_year")) else None
        if r["primary_position"] == "GK":
            # keepers: "threat" axis becomes clean-sheet rate (50% clean sheets -> 100)
            goal_threat = clip(r["clean_sheets"] / max(1, r["matches_played"]) * 200)
        else:
            pct = r["gt_pct"]
            goal_threat = clip(pct * 100) if pd.notna(pct) else clip(r["goals_per_90"] * 100)
        radar = {
            "minutes_stability": round(clip(r["minutes_share_pct"] or 0), 1),
            "goal_threat": round(goal_threat, 1),
            "team_impact": round(team_impact_score(r["on_off_impact"]), 1),
            "discipline": round(discipline_score(r["yellows_per_90"], int(r["red_cards"])), 1),
            "league_level": round(league_level_score(r["multiplier"]), 1),
            "experience": round(experience_score(bool(r["academy"]),
                                                 int(r["highest_tier_played"]) if pd.notna(r.get("highest_tier_played")) else int(r["tier"]),
                                                 int(r["career_senior_apps"] or 0), int(r["career_seasons"] or 0)), 1),
        }
        performance = (radar["minutes_stability"] + radar["goal_threat"] + radar["team_impact"]) / 3
        # small-sample shrinkage toward neutral
        reliability = min(1.0, r["total_minutes"] / 900)
        performance = 50 + (performance - 50) * reliability
        idx = scouting_index(radar["league_level"], age_curve_score(age), performance, radar["experience"])
        if r["category"] != SENIOR:
            idx = None  # youth/futsal/cup rows are tracked, but never ranked against senior league play
        r["radar_vector"] = radar
        r["scouting_index"] = idx
        r["birth_year"] = int(r["birth_year"]) if pd.notna(r.get("birth_year")) else None
        r["archetypes"] = assign_archetypes(r, season) if r["category"] == SENIOR else []
        r["market_value_huf"] = (market.market_value_huf(int(r["tier"]), idx, int(r["total_minutes"]), age)
                                 if r["category"] == SENIOR else None)
        rows.append(r)
    return pd.DataFrame(rows), positions


def similarities(metrics: pd.DataFrame) -> list[tuple]:
    out: list[tuple] = []
    if metrics.empty:
        return out
    senior = metrics[(metrics["category"] == SENIOR) & (metrics["total_minutes"] >= MIN_MINUTES_FOR_SIMILARITY)]
    for season, g in senior.groupby("season"):
        # one vector per player: their most-played competition this season
        g = g.sort_values("total_minutes", ascending=False).drop_duplicates("player_id")
        vecs = np.array([[r[a] for a in RADAR_AXES] for r in g["radar_vector"]])
        groups = ["GK" if p == "GK" else "OUT_" + str(p) for p in g["primary_position"]]
        for pid, sid, sim, rank in cosine_top_n(list(g["player_id"]), vecs, groups):
            out.append((pid, sid, season, sim, rank))
    return out


def _nz(v):
    if v is None:
        return None
    if isinstance(v, float) and np.isnan(v):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return None if np.isnan(v) else float(v)
    return v


def persist(conn, metrics: pd.DataFrame, positions: pd.DataFrame, sims: list[tuple]) -> None:
    if not positions.empty:
        conn.execute(text("""
            UPDATE players SET primary_position = :p, secondary_position = :s, position_confidence = :c, updated_at = now()
            WHERE id = :id
        """), [dict(p=r.primary_position, s=_nz(r.secondary_position), c=_nz(r.position_confidence), id=r.player_id)
               for r in positions.itertuples()])
    conn.execute(text("DELETE FROM player_season_metrics"))
    if not metrics.empty:
        conn.execute(text("""
            INSERT INTO player_season_metrics (player_id, season, competition_id, club_id, matches_played, starts, sub_ins,
                total_minutes, minutes_share_pct, goals, goals_per_90, yellows_per_90, red_cards, clean_sheets,
                team_ppg_with_player, team_ppg_without_player, on_off_impact, scouting_index, archetypes, radar_vector,
                market_value_huf)
            VALUES (:player_id, :season, :competition_id, :club_id, :matches_played, :starts, :sub_ins, :total_minutes,
                :minutes_share_pct, :goals, :goals_per_90, :yellows_per_90, :red_cards, :clean_sheets,
                :ppg_with, :ppg_without, :on_off, :scouting_index, :archetypes, CAST(:radar AS JSONB), :value)
        """), [dict(player_id=r["player_id"], season=r["season"], competition_id=r["competition_id"],
                    club_id=r["club_id"], matches_played=int(r["matches_played"]), starts=int(r["starts"]),
                    sub_ins=int(r["sub_ins"]), total_minutes=int(r["total_minutes"]),
                    minutes_share_pct=_nz(r["minutes_share_pct"]), goals=int(r["goals"]),
                    goals_per_90=_nz(r["goals_per_90"]), yellows_per_90=_nz(r["yellows_per_90"]),
                    red_cards=int(r["red_cards"]), clean_sheets=int(r["clean_sheets"]),
                    ppg_with=_nz(r["team_ppg_with_player"]), ppg_without=_nz(r["team_ppg_without_player"]),
                    on_off=_nz(r["on_off_impact"]), scouting_index=_nz(r["scouting_index"]),
                    archetypes=r["archetypes"], radar=json.dumps(r["radar_vector"]),
                    value=_nz(r["market_value_huf"]))
               for r in metrics.to_dict("records")])
    conn.execute(text("DELETE FROM player_similarities"))
    if sims:
        conn.execute(text("""
            INSERT INTO player_similarities (player_id, similar_player_id, season, similarity, rank)
            VALUES (:a, :b, :s, :sim, :rank)
        """), [dict(a=a, b=b, s=s, sim=sim, rank=rank) for a, b, s, sim, rank in sims])


def run() -> dict:
    with db.engine().begin() as conn:
        located = db.fill_missing_coordinates(conn)
        apps, matches, players = _load(conn)
        metrics, positions = compute(apps, matches, players)
        sims = similarities(metrics)
        persist(conn, metrics, positions, sims)
        market_summary = market.build(conn, metrics)
        conn.execute(text("REFRESH MATERIALIZED VIEW mv_player_explorer"))
    summary = {"clubs_located": located, "metric_rows": len(metrics), "players_positioned": len(positions), "similarity_pairs": len(sims),
               **market_summary}
    log.info("analytics done: %s", summary)
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    print(run())
