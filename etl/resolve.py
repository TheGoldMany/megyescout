"""Season-aware resolution of V1 competition targets to MLSZ league ids.

The configured league ids are only valid for CURRENT_SEASON. For any other season the
federation's league dropdown is fetched once and each target's `patterns` are matched
against it. When two targets collapse onto the same league (e.g. a II. division that
was a single group that year), it is scraped once under a merged short name.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from config import CURRENT_SEASON, SEASON_IDS, V1_TARGETS, CompetitionTarget


@dataclass(frozen=True)
class ResolvedTarget:
    target: CompetitionTarget
    season: str
    league_id: int
    name: str
    short_name: str


def _merged_short(shorts: list[str]) -> str:
    """'BK Megye II D' + 'BK Megye II É' -> 'BK Megye II'."""
    words = [s.split() for s in shorts]
    common = []
    for parts in zip(*words):
        if len(set(parts)) != 1:
            break
        common.append(parts[0])
    return " ".join(common) or shorts[0]


def match_targets(targets: list[CompetitionTarget], options_by_fed: dict[int, list[tuple[str, str]]],
                  season: str) -> tuple[list[ResolvedTarget], list[str]]:
    """Pure matching step. Returns (resolved, unresolved target keys)."""
    by_league: dict[int, list[tuple[CompetitionTarget, str]]] = {}
    unresolved: list[str] = []
    for t in targets:
        options = options_by_fed.get(t.federation_id, [])
        hit = None
        for pattern in t.patterns:
            rx = re.compile(pattern, re.IGNORECASE)
            hit = next(((lid, name) for lid, name in options if rx.search(name.strip())), None)
            if hit:
                break
        if not hit:
            unresolved.append(t.key)
            continue
        by_league.setdefault(int(hit[0]), []).append((t, hit[1]))

    resolved = []
    for league_id, group in by_league.items():
        t, mlsz_name = group[0]
        if len(group) == 1 and season == CURRENT_SEASON:
            name, short = t.name, t.short_name
        else:
            prefix = "" if t.federation in ("MLSZ",) or "BLSZ" in mlsz_name.upper() else f"{t.federation} "
            name = f"{prefix}{mlsz_name}"
            short = t.short_name if len(group) == 1 else _merged_short([g[0].short_name for g in group])
        resolved.append(ResolvedTarget(t, season, league_id, name, short))
    return resolved, unresolved


def configured(season: str, only: list[str] | None = None) -> list[ResolvedTarget]:
    return [ResolvedTarget(t, season, t.league_id, t.name, t.short_name)
            for t in V1_TARGETS if not only or t.key in only]


async def resolve_targets(client, season: str, only: list[str] | None = None) -> tuple[list[ResolvedTarget], list[str]]:
    """Current season -> configured ids. Other seasons -> pattern match on live dropdowns."""
    if season == CURRENT_SEASON:
        return configured(season, only), []
    from parser import parse_league_options

    targets = [t for t in V1_TARGETS if not only or t.key in only]
    options_by_fed: dict[int, list[tuple[str, str]]] = {}
    for fed in sorted({t.federation_id for t in targets}):
        html = await client.get(f"/league/{SEASON_IDS[season]}/{fed}/0/1.html")
        options_by_fed[fed] = parse_league_options(html)
    return match_targets(targets, options_by_fed, season)
