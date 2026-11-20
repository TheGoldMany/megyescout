"""HUN-SCOUT ETL command line.

    python cli.py migrate                       # apply db/migrations/*.sql
    python cli.py seed [--reset]                # demo data + analytics
    python cli.py scrape --mode incremental     # live MLSZ scrape (+ analytics)
    python cli.py analytics                     # recompute metrics only
    python cli.py discover --federation 1       # list league ids of a federation (season ids change yearly!)
    python cli.py schedule                      # long-running worker: Mon 06:00 + Wed 21:00 (Europe/Budapest)
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import analytics
import db
from config import CURRENT_SEASON, SEASON_IDS

log = logging.getLogger("hunscout.cli")
TZ = ZoneInfo("Europe/Budapest")
# (weekday, hour, minute, mode) — Monday morning after the weekend round, Wednesday evening for
# late disciplinary updates and midweek cup games.
SCHEDULE = [(0, 6, 0, "incremental"), (2, 21, 0, "incremental")]


def next_run(now: datetime) -> tuple[datetime, str]:
    candidates = []
    for wd, hh, mm, mode in SCHEDULE:
        days = (wd - now.weekday()) % 7
        at = (now + timedelta(days=days)).replace(hour=hh, minute=mm, second=0, microsecond=0)
        if at <= now:
            at += timedelta(days=7)
        candidates.append((at, mode))
    return min(candidates)


def cmd_schedule(profiles: bool) -> None:
    import scraper
    while True:
        at, mode = next_run(datetime.now(TZ))
        log.info("next scrape (%s) at %s", mode, at.isoformat())
        while datetime.now(TZ) < at:
            time.sleep(min(300, max(1, (at - datetime.now(TZ)).total_seconds())))
        try:
            asyncio.run(scraper.run(mode, None, CURRENT_SEASON, profiles))
            analytics.run()
        except Exception:
            log.exception("scheduled run failed; will retry at the next slot")


async def _discover(federation: int, season: str) -> None:
    from parser import parse_league_options
    from scraper import MlszClient
    async with MlszClient() as client:
        html = await client.get(f"/league/{SEASON_IDS[season]}/{federation}/0/1.html")
    for league_id, name in parse_league_options(html):
        print(f"{league_id}\t{name}")


def main() -> None:
    ap = argparse.ArgumentParser(description="HUN-SCOUT ETL")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("migrate")
    s = sub.add_parser("seed")
    s.add_argument("--reset", action="store_true")
    sc = sub.add_parser("scrape")
    sc.add_argument("--mode", choices=["incremental", "backfill"], default="incremental")
    sc.add_argument("--only")
    sc.add_argument("--season", default=CURRENT_SEASON, choices=sorted(SEASON_IDS))
    sc.add_argument("--profiles", action="store_true")
    sub.add_parser("analytics")
    d = sub.add_parser("discover")
    d.add_argument("--federation", type=int, required=True)
    d.add_argument("--season", default=CURRENT_SEASON, choices=sorted(SEASON_IDS))
    sch = sub.add_parser("schedule")
    sch.add_argument("--profiles", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if args.cmd == "migrate":
        print("applied:", db.run_migrations() or "nothing new")
    elif args.cmd == "seed":
        import seed_demo
        db.run_migrations()
        print(seed_demo.seed(reset=args.reset))
    elif args.cmd == "scrape":
        import scraper
        db.run_migrations()
        stats = asyncio.run(scraper.run(args.mode, args.only.split(",") if args.only else None, args.season,
                                        args.profiles))
        print(f"matches={stats.matches} players={len(stats.players)} errors={len(stats.errors)}")
        print(analytics.run())
    elif args.cmd == "analytics":
        print(analytics.run())
    elif args.cmd == "discover":
        asyncio.run(_discover(args.federation, args.season))
    elif args.cmd == "schedule":
        db.run_migrations()
        cmd_schedule(args.profiles)


if __name__ == "__main__":
    main()
