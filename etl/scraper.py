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
import time
from dataclasses import dataclass, field

import httpx

import db
from config import CURRENT_SEASON, MLSZ_BASE, REQUEST_DELAY_SEC, SEASON_IDS, USER_AGENT, comp_key
from resolve import ResolvedTarget, resolve_targets
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
    profiles_loaded: int = 0
    profiles_pending: int = 0      # stale profiles left for a later run because the time budget ran out
    truncated: bool = False        # match scraping stopped early because the time budget ran out


def time_left(deadline: float | None) -> float:
    """Seconds until `deadline` (a time.monotonic() value); infinite when there is no deadline."""
    return float("inf") if deadline is None else deadline - time.monotonic()


# A match report costs ~1 s (rate limit + latency); stop starting new ones when less than this remains.
MATCH_SAFETY_SEC = 5.0
PROFILE_SAFETY_SEC = 3.0


def league_path(season_id: int, rt: ResolvedTarget, round_no: int) -> str:
    return f"/league/{season_id}/{rt.target.federation_id}/{rt.league_id}/{round_no}.html"


async def rounds_to_scrape(client: MlszClient, season_id: int, rt: ResolvedTarget, mode: str) -> list[int]:
    html = await client.get(league_path(season_id, rt, 1))
    total = parse_round_count(html)
    if mode == "backfill":
        return list(range(1, total + 1))
    # The site preselects the "current" round when no round is given in the URL.
    landing = await client.get(league_path(season_id, rt, 0))
    current = parse_selected_round(landing) or total
    return list(range(max(1, current - INCREMENTAL_LOOKBACK_ROUNDS), current + 1))


async def scrape_competition(client: MlszClient, rt: ResolvedTarget, mode: str,
                             with_profiles: bool, stats: ScrapeStats, deadline: float | None = None) -> None:
    t, season = rt.target, rt.season
    season_id = SEASON_IDS[season]
    with db.engine().begin() as conn:
        competition_id = db.upsert_competition(
            conn, mlsz_comp_id=comp_key(season_id, t.federation_id, rt.league_id), season=season, name=rt.name,
            short_name=rt.short_name, tier=t.tier, strength_multiplier=t.strength_multiplier,
            category=t.category, federation=t.federation,
        )
    rounds = await rounds_to_scrape(client, season_id, rt, mode)
    log.info("[%s %s] league %s rounds %s", t.key, season, rt.league_id, rounds)
    for rnd in rounds:
        if time_left(deadline) < MATCH_SAFETY_SEC:
            stats.truncated = True
            break
        fixtures = parse_round_page(await client.get(league_path(season_id, rt, rnd)))
        for fx in fixtures:
            if not fx.has_result:
                continue
            if time_left(deadline) < MATCH_SAFETY_SEC:
                stats.truncated = True
                break
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
        if stats.truncated:
            break
    if stats.truncated:
        stats.errors.append(f"{t.key}: time budget exhausted after {stats.matches} matches — "
                            "run a backfill from the CLI for whole seasons")

    if with_profiles and not stats.truncated:
        loaded, pending = await refresh_profiles(client, stats.players, deadline=deadline, with_pending=True)
        stats.profiles_loaded += loaded
        stats.profiles_pending += pending


async def refresh_profiles(client: MlszClient, mlsz_ids: set[str] | None = None, stale_days: int = 30,
                           limit: int | None = None, deadline: float | None = None,
                           with_pending: bool = False) -> int | tuple[int, int]:
    """Fetch /player/<id>.html (birth date, full career) for players never scraped or stale.

    mlsz_ids=None means every real MLSZ player in the database (demo rows are skipped).
    Stops early when `deadline` is near; the never-scraped players come first, so repeated
    short runs (Vercel Hobby: 300 s per function) work through the backlog.
    Returns the number of profiles loaded, or (loaded, still_pending) with with_pending=True.
    """
    from sqlalchemy import text

    with db.engine().connect() as conn:
        rows = conn.execute(text("""
            SELECT mlsz_player_id FROM players
            WHERE (CAST(:ids AS text[]) IS NULL OR mlsz_player_id = ANY(CAST(:ids AS text[])))
              AND mlsz_player_id ~ '^[0-9]+$'
              AND (profile_scraped_at IS NULL OR profile_scraped_at < now() - make_interval(days => :d))
            ORDER BY profile_scraped_at NULLS FIRST
            LIMIT :lim
        """), {"ids": list(mlsz_ids) if mlsz_ids is not None else None, "d": stale_days,
               "lim": limit}).scalars().all()
    loaded = 0
    attempted = 0
    for i, mid in enumerate(rows, start=1):
        if time_left(deadline) < PROFILE_SAFETY_SEC:
            log.info("profiles: time budget reached, %d left for the next run", len(rows) - attempted)
            break
        attempted += 1
        try:
            profile = parse_player_profile(await client.get(f"/player/{mid}.html"), mid)
            with db.engine().begin() as conn:
                db.load_player_profile(conn, profile)
            loaded += 1
        except Exception:
            log.exception("profile %s failed", mid)
        if i % 50 == 0:
            log.info("profiles: %d/%d", i, len(rows))
    if with_pending:
        return loaded, len(rows) - attempted
    return loaded


async def run(mode: str, only: list[str] | None, season: str, with_profiles: bool,
              deadline: float | None = None) -> ScrapeStats:
    """Scrape the selected targets. `deadline` (time.monotonic()) bounds the run for serverless callers."""
    if season != CURRENT_SEASON and mode == "incremental":
        log.info("season %s is closed: switching to backfill", season)
        mode = "backfill"
    stats = ScrapeStats()
    with db.engine().begin() as conn:
        run_id = db.start_sync(conn, "mlsz", mode)
    error = None
    try:
        async with MlszClient() as client:
            targets, unresolved = await resolve_targets(client, season, only)
            for key in unresolved:
                log.warning("no league found for target %s in %s — check its patterns", key, season)
                stats.errors.append(f"{key}: unresolved in {season}")
            for rt in targets:
                if stats.truncated:
                    stats.errors.append(f"{rt.target.key}: skipped, time budget exhausted")
                    continue
                await scrape_competition(client, rt, mode, with_profiles, stats, deadline)
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
