"""Transfermarkt layer: estimated market values and detected transfers.

Values are HUN-SCOUT estimates in HUF, not real fees:
  * seasons with match data:  tier base × exp((Scouting Index − 55) / 18) (≤ 6× base), cut for small samples, age 33+
  * seasons known only from the MLSZ profile (career rows): tier base × a coarse proxy of appearances and age
A transfer is a change of the player's main senior club between two consecutive seasons.
"""
from __future__ import annotations

import math
import re

import pandas as pd
from sqlalchemy import text

# Typical value of an average regular player per tier (HUF). Lower Hungarian leagues are amateur or
# semi-pro; these anchor the scale so a solid Megye I starter lands around 1–2 M Ft.
TIER_BASE_HUF = {1: 60_000_000, 2: 20_000_000, 3: 6_000_000, 4: 1_800_000, 5: 700_000, 6: 300_000, 7: 150_000}


def round_value(v: float) -> int:
    """Round like a value table would: 25 k steps below 1 M, 100 k below 10 M, 500 k above."""
    step = 25_000 if v < 1_000_000 else 100_000 if v < 10_000_000 else 500_000
    return int(max(step, round(v / step) * step))


def market_value_huf(tier: int | None, scouting_index: float | None, total_minutes: int, age: int | None) -> int:
    base = TIER_BASE_HUF.get(tier or 7, 150_000)
    # Index 55 = typical regular; every +18 points ≈ ×2.7. Capped at 6× the tier base: an outstanding
    # lower-league player is still priced by his league until he moves up.
    v = min(base * 6, base * math.exp(((scouting_index if scouting_index is not None else 40) - 55) / 18))
    if total_minutes < 270:
        v *= 0.6
    if age is not None and age >= 33:
        v *= 0.5
    return round_value(v)


def career_value_huf(tier: int | None, appearances: int, age: int | None) -> int:
    """Coarse estimate for seasons without match-level data."""
    proxy = 40 + min(25, appearances)
    if age is not None:
        proxy += 8 if age <= 22 else (-8 if age >= 30 else 0)
    return market_value_huf(tier, proxy, 900 if appearances >= 8 else 0, age)


_RESERVE_RE = re.compile(r"\b(ii|iii|u-?\d{2})\.?$", re.IGNORECASE)


def _first_club(names: str, tier: int | None = None) -> str:
    """Profile rows list every club of a season ("A, B"). Skip futsal clubs; for NB I–III seasons
    prefer a first team over a reserve side ("… II."), which rarely plays that high."""
    parts = [p.strip() for p in (names or "").split(",") if p.strip()]
    candidates = [p for p in parts if "futsal" not in p.lower()] or parts
    if tier is not None and tier <= 3:
        first_teams = [p for p in candidates if not _RESERVE_RE.search(p)]
        if first_teams:
            return first_teams[0]
    return candidates[0] if candidates else ""


def _key(name: str) -> str:
    return re.sub(r"[^a-z0-9áéíóöőúüű]+", " ", name.casefold()).strip()


def build(conn, metrics: pd.DataFrame) -> dict:
    """Write player_market_values and transfers from senior metrics + profile career rows."""
    clubs = conn.execute(text("SELECT id, name FROM clubs")).all()
    club_ids = {c.id: c.name for c in clubs}
    club_by_key = {}
    for c in clubs:
        club_by_key.setdefault(_key(c.name), c.id)

    # 1) seasons with match data: the main senior competition of each player-season
    rows: dict[tuple, dict] = {}
    if not metrics.empty:
        senior = metrics[(metrics["category"] == "senior_11v11") & metrics["market_value_huf"].notna()]
        senior = senior.sort_values("total_minutes", ascending=False).drop_duplicates(["player_id", "season"])
        for r in senior.itertuples():
            rows[(r.player_id, r.season)] = dict(value=int(r.market_value_huf), source="match",
                                                 club=club_ids.get(r.club_id, ""), club_id=r.club_id)

    # 2) other seasons from the profile career rows (senior 11v11, most appearances that season)
    stints = conn.execute(text("""
        SELECT DISTINCT ON (s.player_id, s.season) s.player_id, s.season, s.club_names, s.tier, s.appearances,
               p.birth_year
        FROM player_career_stints s JOIN players p ON p.id = s.player_id
        WHERE s.category = 'senior_11v11' AND s.tier IS NOT NULL AND s.appearances > 0
        ORDER BY s.player_id, s.season, s.appearances DESC
    """)).all()
    for s in stints:
        if (s.player_id, s.season) in rows:
            continue
        age = int(s.season[:4]) - s.birth_year if s.birth_year else None
        club = _first_club(s.club_names, s.tier)
        rows[(s.player_id, s.season)] = dict(value=career_value_huf(s.tier, s.appearances, age), source="career",
                                             club=club, club_id=club_by_key.get(_key(club)))

    conn.execute(text("DELETE FROM player_market_values"))
    if rows:
        conn.execute(text("""
            INSERT INTO player_market_values (player_id, season, value_huf, source, club_name)
            VALUES (:p, :s, :v, :src, :c)
        """), [dict(p=p, s=s, v=d["value"], src=d["source"], c=d["club"]) for (p, s), d in rows.items()])

    # 3) transfers: consecutive seasons (in the player's own history) with different main clubs
    by_player: dict = {}
    for (p, s), d in rows.items():
        by_player.setdefault(p, []).append((s, d))
    transfers = []
    for p, seasons in by_player.items():
        seasons.sort()
        for (s0, d0), (s1, d1) in zip(seasons, seasons[1:]):
            if not d0["club"] or not d1["club"] or _key(d0["club"]) == _key(d1["club"]):
                continue
            if int(s1[:4]) - int(s0[:4]) > 2:  # long gap: unknown where he was in between
                continue
            transfers.append(dict(p=p, s=s1, f=d0["club"], t=d1["club"], fid=d0["club_id"], tid=d1["club_id"],
                                  v=d1["value"]))
    conn.execute(text("DELETE FROM transfers"))
    if transfers:
        conn.execute(text("""
            INSERT INTO transfers (player_id, season, from_club, to_club, from_club_id, to_club_id, value_huf)
            VALUES (:p, :s, :f, :t, :fid, :tid, :v)
        """), transfers)
    return {"market_values": len(rows), "transfers": len(transfers)}
