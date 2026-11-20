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

## Vercel (one project, two services)
`vercel.json` deploys the repo as a single Vercel project with [services](https://vercel.com/docs/services):

| Service | Root | Public? | Purpose |
| --- | --- | --- | --- |
| `web` | `web/` | yes, `/(.*)` | Next.js scout UI; calls `etl` through the `ETL_URL` binding |
| `etl` | `etl/` | no (internal) | FastAPI wrapper (`etl/api.py`) around the scraper + analytics |

**Plan: Hobby** (every function is capped at 300 s, schedule jitter is fixed at 15 min). So each
competition has its own schedule: 22 schedules (11 competitions × Monday/Wednesday, `Europe/Budapest`),
staggered 15 minutes apart, Monday 06:00–08:30 and Wednesday 21:00–23:30. Each one POSTs to
`web /api/cron/sync/<key>`, which makes a single `etl POST /sync` call with a time budget (≤200 s),
including the analytics refresh. Profiles that don't fit in the budget are reported as
`profiles_pending` and picked up by the next run. Measured locally: NB III DK first sync with
280 new players took 199 s. Whole-season backfills (~5 min per league) don't fit in 300 s: run them
from the CLI (`python etl/cli.py scrape --season 2025/2026 --only bk1 --profiles`).
`tests/test_vercel_config.py` checks the schedules (coverage, 15-minute stagger, Hobby limits).

Environment variables (Vercel env vars are shared by all services, hence the separate names):

| Variable | Used by | Value |
| --- | --- | --- |
| `DATABASE_URL` | web | `hunscout_web` role (RLS applies); add `PG_SSL=true` for Supabase |
| `ETL_DATABASE_URL` | etl | schema-owner role (writes); a Supabase pooler URL works (prepared statements off) |
| `CRON_SECRET` | web | random string; Vercel sends it as `Authorization: Bearer …` to schedule runs |
| `ETL_INTERNAL_TOKEN` | web + etl | optional shared secret checked by `etl` on top of the private binding |
| `WORKSPACE_PASSCODE`, `AUTH_SECRET` | web | staff login; **required on Vercel** (AUTH_SECRET ≥ 16 chars). Without them nobody can log in and /login says what is missing |
| `ETL_URL` | web | **injected by the binding — do not set it** |

**Migrations** run automatically: `.github/workflows/migrate.yml` applies new `db/migrations/*.sql` files
after CI passes on the default branch (the one Vercel deploys to production), using the repository secret
`ETL_DATABASE_URL`. Without the secret the job is skipped with a notice. Vercel deploys in parallel, so for a
breaking schema change run the workflow manually ("Run workflow") before merging. Migration 003 creates the
`hunscout_web` role with the password `hunscout_web`: change it right after the first run
(`ALTER ROLE hunscout_web PASSWORD '…'`) and use the new one in `DATABASE_URL`.

Locally, `vercel dev` runs both services and injects `ETL_URL`; without it,
run `cd etl && uvicorn api:app --port 8000` and set `ETL_URL=http://localhost:8000` for the web app.
Manual sync: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/sync/bk1`
(or `/api/cron/sync?only=bk1,pest1`, which processes leagues until the 300 s limit and reports the rest as `skipped`).

## Tests
```bash
cd etl && python -m pytest                       # parsers (saved real MLSZ pages), resolver, analytics
cd web && npm run test:e2e                       # Playwright, needs a demo-seeded DB
```
CI (`.github/workflows/ci.yml`) runs both, plus typecheck, lint and build, against a freshly migrated database.

See `CLAUDE.md` for architecture and conventions.
