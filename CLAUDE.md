# Project: HUN-SCOUT (Hungarian Lower-League & Regional Football Intelligence Platform)

Dark-mode scouting platform ("Hungarian Transfermarkt + Wyscout Lite") for NB III, county leagues
(Megye I–II), BLSZ I–II and Magyar Kupa data from `adatbank.mlsz.hu`. Pilot club: **Lajosmizsei VLC**
(Lajosmizse, lat `47.0264`, lng `19.5542`), 70 km commuting radius.

**Language rule:** all user-facing UI text is **Hungarian**; code, comments, DB columns and docs are **English**.

## Repository layout
```
db/migrations/        001_init.sql (schema), 002 (workspaces, RLS), 003 (hunscout_web role),
                      004 (substitution pairs), 005 (mv_player_explorer: one row per player+season)
etl/                  Python 3.12 worker (flat modules, run from inside etl/)
  config.py           DB URL, rate limit, V1 competition targets (verified 2026/27 ids + name patterns)
  resolve.py          maps targets to MLSZ league ids for any season by matching the league dropdown
  parser.py           pure HTML parsers: match report, round page, player profile, competition classifier
  models.py           pydantic records
  db.py               migrations runner + idempotent upserts (dedup on mlsz_player_id)
  scraper.py          async httpx client (0.5 s rate limit, retries/backoff), --mode incremental|backfill
  analytics.py        metrics, position inference, radar, Scouting Index, archetypes, cosine similarity
  seed_demo.py        realistic demo data for the region (ids prefixed "demo-")
  geo.py              club-name -> town gazetteer + haversine
  cli.py              migrate | seed | scrape | analytics | resolve | discover | geo | schedule
  tests/              pytest, parsers tested against saved real MLSZ pages in tests/fixtures/
web/                  Next.js 15 App Router, TypeScript, Tailwind v4, shadcn/ui-style components, Recharts
  src/lib/queries.ts  all SQL; src/lib/labels.ts all Hungarian labels; src/app/actions.ts server actions
  src/app/            / (explorer) · /players/[id] · /shortlist (+ /shortlist/export CSV) · /compare · /data
  e2e/                Playwright specs (need a demo-seeded DB); playwright.config.ts starts `npm run start`
.github/workflows/    CI: pytest · tsc/lint/build · E2E against a freshly migrated + seeded Postgres
docker-compose.yml    db + etl worker + web
```

## Commands
```bash
cd etl && pip install -r requirements.txt
python -m pytest                       # parser/analytics tests
python cli.py migrate
python cli.py seed --reset             # demo data + analytics
python cli.py scrape --mode incremental --profiles   # live MLSZ (current round + 2 previous)
python cli.py scrape --mode backfill --only bk1,pest1
python cli.py scrape --season 2025/2026 --only bk1 --profiles   # closed seasons always backfill
python cli.py resolve --season 2025/2026   # which MLSZ league each target maps to (add --live for current)
python cli.py discover --federation 1      # raw league dropdown of a federation
python cli.py geo                          # locate clubs without coordinates; --set "NAME" --town X
cd web && npm install && npm run dev   # needs DATABASE_URL (see web/.env.example)
npx tsc --noEmit && npm run lint && npm run build
npm run test:e2e                       # Playwright; DB must be seeded with demo data
```

## Key conventions & decisions
- **Identity:** `mlsz_player_id` is the only trusted cross-league key. Club key = stable MLSZ association logo id +
  slugged name (`e11492-dvsc`), because the `/club/` link id is season-specific and reserve teams share logos.
- MLSZ `/match/...` URLs 302 to the `ada1bank.mlsz.hu` mirror; the client follows redirects.
- Minutes: starters 0→sub-out minute; subs in at swap minute; stoppage time folds into 90; red card ends minutes.
  Unused subs get no appearance row. MLSZ reports carry **no assists**, so the UI shows goals only.
- **Seasons:** configured league ids are only valid for CURRENT_SEASON; other seasons resolve through
  `CompetitionTarget.patterns`. Targets that collapse onto one league that year are scraped once.
  When a new season starts: bump `CURRENT_SEASON`/`SEASON_IDS`, run `cli.py resolve --live`, update the ids.
- **Positions:** shirt-number votes + goal output (pass 1), then substitution direction (pass 2): every
  `replaced_player_id` pairing votes for the partner's position. Demo accuracy 75.8% -> 84.9%
  (`seed_demo` logs it); keep that number from regressing when touching `infer_position`.
- Senior, youth, futsal, cup and "other" (friendlies, winter cups, DLSZ hobby leagues) never mix:
  only `senior_11v11` rows get a Scouting Index / archetypes / similarity.
- **Scouting Index** = 35% league strength + 25% age curve (peak 18–22) + 25% performance
  (minutes share, goal threat, on/off; shrunk toward 50 below 900′) + 15% pedigree.
- On/off = team PPG when player played ≥60′ minus PPG otherwise (needs ≥2 games each side).
- Similarity: z-scored radar vectors (std floored at 8) → cosine, within position group, top 5, ≥450′.
- Youth-rule window = season start year −20 … −18 (2026/27 → 2006–2008).
- **Private workspace:** `scout_notes` has FORCE RLS on `current_workspace_id()` (`app.workspace_id` GUC or
  Supabase JWT claim `workspace_id`). The web app must connect as `hunscout_web` (superusers bypass RLS) and run
  note queries through `withWorkspace()`.
- Auth (pilot): signed cookie + shared `WORKSPACE_PASSCODE`; unset passcode = open dev mode.
- After any data change run `analytics.run()` — it refreshes `mv_player_explorer`, which the UI reads.
  The view has one row per (player, season); use `is_latest` for "current" joins and filter explorer
  queries by season (default = newest).
- Clubs without coordinates silently drop out of the distance filter: check /data, fix with `cli.py geo`.

## Design
Background `#090D16`, cards `#111827`, emerald `#10B981`, amber `#F59E0B`. Dense tables on desktop, card list +
collapsible filters on phones (sideline use).
