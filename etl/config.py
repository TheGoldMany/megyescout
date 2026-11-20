"""Runtime configuration and the V1 (Lajosmizse pilot) competition scope."""
from __future__ import annotations

import os
from dataclasses import dataclass

def _normalize_db_url(url: str) -> str:
    """Accept plain postgres:// URLs (Supabase, Neon, Vercel Marketplace) and pin the psycopg 3 driver."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


# On Vercel, environment variables are shared by every service of the project, but the web app must
# use the least-privilege `hunscout_web` role (RLS) while the ETL writes as the schema owner.
# So the ETL reads its own ETL_DATABASE_URL first and only falls back to DATABASE_URL (local dev / CI).
DATABASE_URL = _normalize_db_url(
    os.getenv("ETL_DATABASE_URL")
    or os.getenv("DATABASE_URL")
    or "postgresql+psycopg://postgres:postgres@localhost:5432/hunscout"
)

MLSZ_BASE = os.getenv("MLSZ_BASE", "https://adatbank.mlsz.hu")
REQUEST_DELAY_SEC = float(os.getenv("MLSZ_REQUEST_DELAY", "0.5"))
USER_AGENT = os.getenv(
    "MLSZ_USER_AGENT",
    "Mozilla/5.0 (compatible; HUN-SCOUT/0.1; regional scouting research; polite crawler)",
)

# Pilot club / home base
HOME_WORKSPACE = "lajosmizse_vlc"
HOME_LAT = 47.0264
HOME_LNG = 19.5542

# MLSZ season ids (from the "Évad" dropdown on adatbank.mlsz.hu)
SEASON_IDS = {
    "2026/2027": 67,
    "2025/2026": 65,
    "2024/2025": 63,
    "2023/2024": 61,
    "2022/2023": 59,
}
CURRENT_SEASON = os.getenv("HUNSCOUT_SEASON", "2026/2027")

# MLSZ federation ids ("Szervező" dropdown)
FED_MLSZ = 0
FED_BACS = 1
FED_BUDAPEST = 5
FED_JNSZ = 11
FED_PEST = 14


@dataclass(frozen=True)
class CompetitionTarget:
    key: str                    # stable short key used in CLI flags
    federation_id: int
    league_id: int              # MLSZ league id for CURRENT_SEASON (verified)
    name: str
    short_name: str
    tier: int
    strength_multiplier: float
    category: str = "senior_11v11"
    federation: str = "MLSZ"
    # Regexes (case-insensitive, tried in order) matched against the federation's league dropdown
    # to find the league id in any other season. League ids and even names change every year
    # (e.g. Bács-Kiskun II. was one group in 2025/26 and split into Dél/Észak in 2026/27).
    patterns: tuple[str, ...] = ()


# League ids verified against adatbank.mlsz.hu for 2026/2027; other seasons resolve via `patterns`
# (`python cli.py resolve --season 2025/2026` shows the result).
V1_TARGETS: list[CompetitionTarget] = [
    CompetitionTarget("nb3_dk", FED_MLSZ, 34054, "NB III. Dél-Keleti csoport", "NB III DK", 3, 1.60,
                      patterns=(r"^NB III\.? Dél-Keleti",)),
    CompetitionTarget("mk", FED_MLSZ, 33589, "MOL Magyar Kupa", "Magyar Kupa", 3, 1.40, "cup",
                      patterns=(r"^MOL Magyar Kupa$", r"Magyar Kupa$")),
    CompetitionTarget("bk1", FED_BACS, 33671, "Bács-Kiskun Vármegyei I.", "BK Megye I", 4, 1.10, federation="Bács-Kiskun",
                      patterns=(r"^(vár)?megyei I\.?( osztály)?$",)),
    CompetitionTarget("bk2d", FED_BACS, 33672, "Bács-Kiskun Vármegyei II. Dél", "BK Megye II D", 5, 0.85, federation="Bács-Kiskun",
                      patterns=(r"^(vár)?megyei II\.? Dél$", r"^(vár)?megyei II\.?( osztály)?$")),
    CompetitionTarget("bk2e", FED_BACS, 33675, "Bács-Kiskun Vármegyei II. Észak", "BK Megye II É", 5, 0.85, federation="Bács-Kiskun",
                      patterns=(r"^(vár)?megyei II\.? Észak$", r"^(vár)?megyei II\.?( osztály)?$")),
    CompetitionTarget("pest1", FED_PEST, 33660, "Pest Vármegyei I. osztály", "Pest Megye I", 4, 1.15, federation="Pest",
                      patterns=(r"^I\. osztályú felnőtt",)),
    CompetitionTarget("pest2e", FED_PEST, 34067, "Pest Vármegyei II. osztály Észak", "Pest Megye II É", 5, 0.90, federation="Pest",
                      patterns=(r"^II\. osztályú felnőtt.*Észak", r"^II\. osztályú felnőtt")),
    CompetitionTarget("pest2d", FED_PEST, 34068, "Pest Vármegyei II. osztály Dél", "Pest Megye II D", 5, 0.90, federation="Pest",
                      patterns=(r"^II\. osztályú felnőtt.*Dél", r"^II\. osztályú felnőtt")),
    CompetitionTarget("blsz1", FED_BUDAPEST, 33753, "BLSZ I. osztály", "BLSZ I", 4, 1.15, federation="Budapest",
                      patterns=(r"^BLSZ I\. OSZT",)),
    CompetitionTarget("blsz2", FED_BUDAPEST, 33754, "BLSZ II. osztály", "BLSZ II", 5, 0.90, federation="Budapest",
                      patterns=(r"^BLSZ II\. OSZT",)),
    CompetitionTarget("jnsz1", FED_JNSZ, 33736, "Jász-Nagykun-Szolnok Vármegyei I.", "JNSZ Megye I", 4, 1.00,
                      federation="Jász-Nagykun-Szolnok",
                      patterns=(r"^(vár)?megyei I\.?\s*(osztály)?\s*felnőtt", r"^(vár)?megyei I\.?( osztály)?$")),
]

TIER_DEFAULT_MULTIPLIER = {1: 2.50, 2: 2.00, 3: 1.60, 4: 1.10, 5: 0.90, 6: 0.70, 7: 0.55}


def comp_key(season_id: int, federation_id: int, league_id: int) -> str:
    """Value stored in competitions.mlsz_comp_id."""
    return f"{season_id}:{federation_id}:{league_id}"
