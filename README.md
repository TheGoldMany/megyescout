# HUN-SCOUT · Lajosmizsei VLC pilot

Regional scouting platform for Hungarian lower leagues (NB III Dél-Kelet, Bács-Kiskun/Pest/JNSZ Megye I–II,
BLSZ I–II, Magyar Kupa), built on the public match reports on adatbank.mlsz.hu.

- **Scout Explorer** (`/`): KPIs, filters for position, birth year (youth-rule toggle), tier, minutes, role,
  and distance from Lajosmizse (Haversine), plus a sortable table (cards on mobile)
- **Player profile** (`/players/[id]`): Scouting Index ring, 6-axis radar against the league positional average,
  multi-league career timeline (senior, youth, futsal), recent matches, similar players, private club-vault box
- **Signing board** (`/shortlist`): a "Friss forma" panel showing each target's last match (minutes, goals,
  "did not play"), grouping by status or position, quick note editing, comparing up to 4 players, CSV export
- **Data health** (`/data`): sync log, per-competition coverage, clubs without a location, missing birth years
- **Seasons**: switch seasons in the explorer and on profiles; past seasons resolve their MLSZ league ids automatically
- **ETL**: polite MLSZ scraper (incremental and backfill), metrics engine, demo seed

## Quick start (local Postgres 16)
```bash
createdb hunscout
cd etl && pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/hunscout
python cli.py seed --reset          # or: python cli.py scrape --mode backfill --profiles
cd ../web && cp .env.example .env.local && npm install && npm run dev
```

## Docker
```bash
docker compose up -d db
docker compose run --rm etl python cli.py seed
docker compose up -d etl web        # http://localhost:3000
```
The `etl` service scrapes on Mondays at 06:00 and Wednesdays at 21:00 (Europe/Budapest).

## Vercel + Supabase
Run the `db/migrations` against Supabase, deploy `web/` to Vercel with `DATABASE_URL` (the `hunscout_web` role
or an equivalent non-superuser role, `PG_SSL=true`), `WORKSPACE_PASSCODE` and `AUTH_SECRET`. Run the ETL worker
on your own server or in Docker; it does not fit serverless timeouts.

## Tests
```bash
cd etl && python -m pytest                       # parsers (saved real MLSZ pages), resolver, analytics
cd web && npm run test:e2e                       # Playwright, needs a demo-seeded DB
```
CI (`.github/workflows/ci.yml`) runs both, plus typecheck, lint and build, against a freshly migrated database.

See `CLAUDE.md` for architecture and conventions.
