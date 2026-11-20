"""Polite, resilient scraper for adatbank.mlsz.hu.

Usage (see also cli.py):
    python scraper.py --mode incremental                # current round + previous 2 rounds, all V1 targets
    python scraper.py --mode backfill --only bk1,pest1  # every round of the season
    python scraper.py --mode incremental --profiles     # also refresh player profile pages (birth date, career)
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import random
from dataclasses import dataclass, field

import httpx

import db
from config import (CURRENT_SEASON, MLSZ_BASE, REQUEST_DELAY_SEC, SEASON_IDS, USER_AGENT, V1_TARGETS,
                    CompetitionTarget, comp_key)
from parser import parse_match_report, parse_player_profile, parse_round_count, parse_round_page, parse_selected_round

log = logging.getLogger("hunscout.scraper")

INCREMENTAL_LOOKBACK_ROUNDS = 2


class MlszClient:
    """httpx wrapper with a global rate limit, retries and exponential backoff."""

    def __init__(self, delay: float = REQUEST_DELAY_SEC, max_retries: int = 4, timeout: float = 30.0):
        self.delay = delay
        self.max_retries = max_retries
        self._lock = asyncio.Lock()
        self._client = httpx.AsyncClient(
            base_url=MLSZ_BASE,
            timeout=timeout,
            follow_redirects=True,  # /match/... 302s to the ada1bank "match?itemId=" mirror
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "hu-HU,hu;q=0.9,en;q=0.5",
            },
        )

    async def __aenter__(self) -> "MlszClient":
        return self

    async def __aexit__(self, *exc) -> None:
        await self._client.aclose()

    async def get(self, path: str) -> str:
        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                async with self._lock:  # serialize requests: one in flight, then sleep
                    try:
                        resp = await self._client.get(path)
                    finally:
                        await asyncio.sleep(self.delay)
                if resp.status_code in (429, 500, 502, 503, 504):
                    raise httpx.HTTPStatusError(f"retryable {resp.status_code}", request=resp.request, response=resp)
                resp.raise_for_status()
                return resp.text
            except (httpx.HTTPStatusError, httpx.TransportError) as exc:
                if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 404:
                    raise
                last_exc = exc
                backoff = min(30.0, (2 ** attempt) + random.random())
                log.warning("GET %s failed (%s), retry %d/%d in %.1fs", path, exc, attempt, self.max_retries, backoff)
                await asyncio.sleep(backoff)
        raise RuntimeError(f"giving up on {path}") from last_exc


@dataclass
class ScrapeStats:
    matches: int = 0
    players: set[str] = field(default_factory=set)
    errors: list[str] = field(default_factory=list)


def league_path(season_id: int, t: CompetitionTarget, round_no: int) -> str:
    return f"/league/{season_id}/{t.federation_id}/{t.league_id}/{round_no}.html"


async def rounds_to_scrape(client: MlszClient, season_id: int, t: CompetitionTarget, mode: str) -> list[int]:
    html = await client.get(league_path(season_id, t, 1))
    total = parse_round_count(html)
    if mode == "backfill":
        return list(range(1, total + 1))
    # The site preselects the "current" round when no round is given in the URL.
    landing = await client.get(f"/league/{season_id}/{t.federation_id}/{t.league_id}/0.html")
    current = parse_selected_round(landing) or total
    return list(range(max(1, current - INCREMENTAL_LOOKBACK_ROUNDS), current + 1))


async def scrape_competition(client: MlszClient, t: CompetitionTarget, mode: str, season: str,
                             with_profiles: bool, stats: ScrapeStats) -> None:
    season_id = SEASON_IDS[season]
    with db.engine().begin() as conn:
        competition_id = db.upsert_competition(
            conn, mlsz_comp_id=comp_key(season_id, t.federation_id, t.league_id), season=season, name=t.name,
            short_name=t.short_name, tier=t.tier, strength_multiplier=t.strength_multiplier,
            category=t.category, federation=t.federation,
        )
    rounds = await rounds_to_scrape(client, season_id, t, mode)
    log.info("[%s] rounds %s", t.key, rounds)
    for rnd in rounds:
        fixtures = parse_round_page(await client.get(league_path(season_id, t, rnd)))
        for fx in fixtures:
            if not fx.has_result:
                continue
            try:
                html = await client.get(fx.url.replace(MLSZ_BASE, ""))
                report = parse_match_report(html, fx.url)
                report.round_number = report.round_number or rnd
                with db.engine().begin() as conn:
                    db.load_match_report(conn, report, competition_id)
                stats.matches += 1
                for p in report.home_players + report.away_players:
                    stats.players.add(p.mlsz_player_id)
            except Exception as exc:  # keep going: one broken report must not kill the run
                log.exception("[%s] match %s failed", t.key, fx.mlsz_match_id)
                stats.errors.append(f"{t.key}/{fx.mlsz_match_id}: {exc}")

    if with_profiles:
        await refresh_profiles(client, stats.players)


async def refresh_profiles(client: MlszClient, mlsz_ids: set[str], stale_days: int = 30) -> int:
    """Fetch /player/<id>.html for players never scraped or stale."""
    from sqlalchemy import text

    with db.engine().connect() as conn:
        rows = conn.execute(text("""
            SELECT mlsz_player_id FROM players
            WHERE mlsz_player_id = ANY(:ids)
              AND (profile_scraped_at IS NULL OR profile_scraped_at < now() - make_interval(days => :d))
        """), {"ids": list(mlsz_ids), "d": stale_days}).scalars().all()
    for mid in rows:
        try:
            profile = parse_player_profile(await client.get(f"/player/{mid}.html"), mid)
            with db.engine().begin() as conn:
                db.load_player_profile(conn, profile)
        except Exception:
            log.exception("profile %s failed", mid)
    return len(rows)


async def run(mode: str, only: list[str] | None, season: str, with_profiles: bool) -> ScrapeStats:
    targets = [t for t in V1_TARGETS if not only or t.key in only]
    stats = ScrapeStats()
    with db.engine().begin() as conn:
        run_id = db.start_sync(conn, "mlsz", mode)
    error = None
    try:
        async with MlszClient() as client:
            for t in targets:
                await scrape_competition(client, t, mode, season, with_profiles, stats)
    except Exception as exc:
        error = str(exc)
        raise
    finally:
        with db.engine().begin() as conn:
            db.finish_sync(conn, run_id, matches=stats.matches, players=len(stats.players),
                           error=error or ("; ".join(stats.errors[:5]) or None), fatal=error is not None)
    return stats


def main() -> None:
    ap = argparse.ArgumentParser(description="HUN-SCOUT MLSZ adatbank scraper")
    ap.add_argument("--mode", choices=["incremental", "backfill"], default="incremental")
    ap.add_argument("--only", help="comma-separated target keys, e.g. bk1,pest1 (default: all V1 targets)")
    ap.add_argument("--season", default=CURRENT_SEASON, choices=sorted(SEASON_IDS))
    ap.add_argument("--profiles", action="store_true", help="also fetch player profile pages")
    ap.add_argument("--no-analytics", action="store_true", help="skip the metrics recompute afterwards")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    stats = asyncio.run(run(args.mode, args.only.split(",") if args.only else None, args.season, args.profiles))
    log.info("done: %d matches, %d players, %d errors", stats.matches, len(stats.players), len(stats.errors))
    if not args.no_analytics:
        import analytics
        analytics.run()


if __name__ == "__main__":
    main()
