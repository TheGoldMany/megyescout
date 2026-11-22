"""HUN-SCOUT ETL command line.

    python cli.py migrate                       # apply db/migrations/*.sql
    python cli.py seed [--reset]                # demo data + analytics
    python cli.py scrape --mode incremental     # live MLSZ scrape (+ analytics)
    python cli.py analytics                     # recompute metrics only
    python cli.py discover --federation 1       # list league ids of a federation (season ids change yearly!)
    python cli.py profiles [--limit 200]        # backfill player profile pages without re-scraping matches

Scheduled syncs run on Vercel (vercel.json `schedules` -> web /api/cron/sync/<key> -> etl service);
this CLI is for local work: migrations, seeding, backfills and one-off fixes.
"""
from __future__ import annotations

import argparse
import asyncio
import time
import logging

import analytics
import db
from config import CURRENT_SEASON, SEASON_IDS

log = logging.getLogger("hunscout.cli")


async def _discover(federation: int, season: str) -> None:
    from parser import parse_league_options
    from scraper import MlszClient
    async with MlszClient() as client:
        html = await client.get(f"/league/{SEASON_IDS[season]}/{federation}/0/1.html")
    for league_id, name in parse_league_options(html):
        print(f"{league_id}\t{name}")


async def _profiles(stale_days: int, limit: int | None) -> int:
    from scraper import MlszClient, refresh_profiles
    async with MlszClient() as client:
        return await refresh_profiles(client, None, stale_days, limit)


def cmd_geo(args) -> None:
    """Club coordinates drive the distance filter; clubs without them silently drop out of it."""
    from sqlalchemy import text
    from geo import TOWNS, geolocate

    with db.engine().begin() as conn:
        if args.set:
            if args.town:
                if args.town not in TOWNS:
                    raise SystemExit(f"unknown town {args.town!r}; use --lat/--lng or add it to geo.GAZETTEER")
                lat, lng, county = TOWNS[args.town]
                town = args.town
            elif args.lat is not None and args.lng is not None:
                lat, lng, county, town = args.lat, args.lng, None, None
            else:
                raise SystemExit("--set needs --town or --lat/--lng")
            n = conn.execute(text("""
                UPDATE clubs SET city = COALESCE(:town, city), county = COALESCE(:county, county),
                       latitude = :lat, longitude = :lng, updated_at = now()
                WHERE name = :name
            """), dict(town=town, county=county, lat=lat, lng=lng, name=args.set)).rowcount
            print(f"updated {n} club(s)")
        else:
            rows = conn.execute(text("SELECT id, name FROM clubs WHERE latitude IS NULL OR longitude IS NULL")).all()
            fixed = 0
            for r in rows:
                town, lat, lng, county = geolocate(r.name)
                if town:
                    conn.execute(text("""
                        UPDATE clubs SET city = :t, county = :c, latitude = :lat, longitude = :lng, updated_at = now()
                        WHERE id = :id
                    """), dict(t=town, c=county, lat=lat, lng=lng, id=r.id))
                    fixed += 1
                else:
                    print(f"unresolved: {r.name}")
            print(f"located {fixed} of {len(rows)} club(s) without coordinates")
    analytics.run()  # refresh the explorer view so distances update


async def _resolve(season: str, live: bool) -> None:
    import resolve
    from parser import parse_league_options
    from scraper import MlszClient
    from config import V1_TARGETS
    async with MlszClient() as client:
        if live:
            options = {}
            for fed in sorted({t.federation_id for t in V1_TARGETS}):
                options[fed] = parse_league_options(await client.get(f"/league/{SEASON_IDS[season]}/{fed}/0/1.html"))
            resolved, unresolved = resolve.match_targets(V1_TARGETS, options, season)
        else:
            resolved, unresolved = await resolve.resolve_targets(client, season)
    for r in resolved:
        print(f"{r.target.key:8} {r.league_id:>6}  {r.short_name:16} {r.name}")
    for key in unresolved:
        print(f"{key:8} UNRESOLVED")


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
    sc.add_argument("--budget-minutes", type=float,
                    help="stop starting new requests after this long (analytics still runs), e.g. on CI runners")
    sc.add_argument("--skip-known", action="store_true",
                    help="do not re-fetch matches already stored (resume an interrupted backfill)")
    sub.add_parser("analytics")
    rs = sub.add_parser("resolve", help="show which MLSZ league each V1 target maps to in a season")
    rs.add_argument("--season", default=CURRENT_SEASON, choices=sorted(SEASON_IDS))
    rs.add_argument("--live", action="store_true", help="match patterns even for the current season")
    d = sub.add_parser("discover")
    d.add_argument("--federation", type=int, required=True)
    d.add_argument("--season", default=CURRENT_SEASON, choices=sorted(SEASON_IDS))
    pr = sub.add_parser("profiles", help="fetch missing/stale MLSZ player profiles (birth date, career) only")
    pr.add_argument("--stale-days", type=int, default=30)
    pr.add_argument("--limit", type=int, help="cap the number of profiles fetched in this run")
    g = sub.add_parser("geo", help="fill missing club coordinates from the gazetteer, or set one by hand")
    g.add_argument("--set", metavar="CLUB", help="exact club name (as shown on the Adatállapot page)")
    g.add_argument("--town", help="gazetteer town for --set, e.g. Csólyospálos")
    g.add_argument("--lat", type=float)
    g.add_argument("--lng", type=float)
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
        deadline = time.monotonic() + args.budget_minutes * 60 if args.budget_minutes else None
        stats = asyncio.run(scraper.run(args.mode, args.only.split(",") if args.only else None, args.season,
                                        args.profiles, deadline=deadline, skip_known=args.skip_known))
        print(f"matches={stats.matches} players={len(stats.players)} errors={len(stats.errors)}")
        print(analytics.run())
    elif args.cmd == "analytics":
        print(analytics.run())
    elif args.cmd == "resolve":
        asyncio.run(_resolve(args.season, args.live))
    elif args.cmd == "discover":
        asyncio.run(_discover(args.federation, args.season))
    elif args.cmd == "profiles":
        print("loaded:", asyncio.run(_profiles(args.stale_days, args.limit)), "profiles")
        print(analytics.run())
    elif args.cmd == "geo":
        cmd_geo(args)


if __name__ == "__main__":
    main()
