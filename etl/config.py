"""Runtime configuration and the V1 (Lajosmizse pilot) competition scope."""
from __future__ import annotations

import os
from dataclasses import dataclass

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/hunscout")

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
    league_id: int              # MLSZ league id for the CURRENT season
    name: str
    short_name: str
    tier: int
    strength_multiplier: float
    category: str = "senior_11v11"
    federation: str = "MLSZ"


# League ids verified against adatbank.mlsz.hu for 2026/2027.
# They change every season: run `python cli.py discover --federation <id>` to refresh.
V1_TARGETS: list[CompetitionTarget] = [
    CompetitionTarget("nb3_dk", FED_MLSZ, 34054, "NB III. Dél-Keleti csoport", "NB III DK", 3, 1.60),
    CompetitionTarget("mk", FED_MLSZ, 33589, "MOL Magyar Kupa", "Magyar Kupa", 3, 1.40, "cup"),
    CompetitionTarget("bk1", FED_BACS, 33671, "Bács-Kiskun Vármegyei I.", "BK Megye I", 4, 1.10, federation="Bács-Kiskun"),
    CompetitionTarget("bk2d", FED_BACS, 33672, "Bács-Kiskun Vármegyei II. Dél", "BK Megye II D", 5, 0.85, federation="Bács-Kiskun"),
    CompetitionTarget("bk2e", FED_BACS, 33675, "Bács-Kiskun Vármegyei II. Észak", "BK Megye II É", 5, 0.85, federation="Bács-Kiskun"),
    CompetitionTarget("pest1", FED_PEST, 33660, "Pest Vármegyei I. osztály", "Pest Megye I", 4, 1.15, federation="Pest"),
    CompetitionTarget("pest2e", FED_PEST, 34067, "Pest Vármegyei II. osztály Észak", "Pest Megye II É", 5, 0.90, federation="Pest"),
    CompetitionTarget("pest2d", FED_PEST, 34068, "Pest Vármegyei II. osztály Dél", "Pest Megye II D", 5, 0.90, federation="Pest"),
    CompetitionTarget("blsz1", FED_BUDAPEST, 33753, "BLSZ I. osztály", "BLSZ I", 4, 1.15, federation="Budapest"),
    CompetitionTarget("blsz2", FED_BUDAPEST, 33754, "BLSZ II. osztály", "BLSZ II", 5, 0.90, federation="Budapest"),
    CompetitionTarget("jnsz1", FED_JNSZ, 33736, "Jász-Nagykun-Szolnok Vármegyei I.", "JNSZ Megye I", 4, 1.00, federation="Jász-Nagykun-Szolnok"),
]

TIER_DEFAULT_MULTIPLIER = {1: 2.50, 2: 2.00, 3: 1.60, 4: 1.10, 5: 0.90, 6: 0.70, 7: 0.55}


def comp_key(season_id: int, federation_id: int, league_id: int) -> str:
    """Value stored in competitions.mlsz_comp_id."""
    return f"{season_id}:{federation_id}:{league_id}"
