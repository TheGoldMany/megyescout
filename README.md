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
cd etl && pip install -r requirements-dev.txt
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

## Vercel (one project, two services)
`vercel.json` deploys the repo as a single Vercel project with [services](https://vercel.com/docs/services):

| Service | Root | Public? | Purpose |
| --- | --- | --- | --- |
| `web` | `web/` | yes, `/(.*)` | Next.js scout UI; calls `etl` through the `ETL_URL` binding |
| `etl` | `etl/` | no (internal) | FastAPI wrapper (`etl/api.py`) around the scraper + analytics |

Two Vercel schedules (Monday 06:00 and Wednesday 21:00, `Europe/Budapest`) POST to `web /api/cron/sync`,
which calls `etl` once per competition (`POST /sync`) and then `POST /analytics`.

Environment variables (Vercel env vars are shared by all services, hence the separate names):

| Variable | Used by | Value |
| --- | --- | --- |
| `DATABASE_URL` | web | `hunscout_web` role (RLS applies); add `PG_SSL=true` for Supabase |
| `ETL_DATABASE_URL` | etl | schema-owner role (writes); a Supabase pooler URL works (prepared statements off) |
| `CRON_SECRET` | web | random string; Vercel sends it as `Authorization: Bearer …` to schedule runs |
| `ETL_INTERNAL_TOKEN` | web + etl | optional shared secret checked by `etl` on top of the private binding |
| `WORKSPACE_PASSCODE`, `AUTH_SECRET` | web | staff login |
| `ETL_URL` | web | **injected by the binding — do not set it** |

Migrations are not run by the deployment: apply them with `python etl/cli.py migrate` (with `ETL_DATABASE_URL`)
before deploying a schema change. Locally, `vercel dev` runs both services and injects `ETL_URL`; without it,
run `cd etl && uvicorn api:app --port 8000` and set `ETL_URL=http://localhost:8000` for the web app.
Manual sync: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/sync?only=bk1`.

The Docker setup (`docker-compose.yml`, long-running `cli.py schedule` worker) still works for self-hosting.

## Tests
```bash
cd etl && python -m pytest                       # parsers (saved real MLSZ pages), resolver, analytics
cd web && npm run test:e2e                       # Playwright, needs a demo-seeded DB
```
CI (`.github/workflows/ci.yml`) runs both, plus typecheck, lint and build, against a freshly migrated database.

See `CLAUDE.md` for architecture and conventions.
