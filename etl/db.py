"""Database access: engine, migrations and idempotent upserts."""
from __future__ import annotations

import glob
import os
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from config import DATABASE_URL
from geo import geolocate
from models import MatchReport, PlayerAppearance, PlayerProfile
from parser import classify_competition_name, is_top_academy

_engine: Engine | None = None
MIGRATIONS_DIR = os.getenv(
    "MIGRATIONS_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "db", "migrations")
)


def engine() -> Engine:
    global _engine
    if _engine is None:
        connect_args = {}
        # Transaction-mode poolers (Supabase :6543, PgBouncer) cannot keep server-side prepared
        # statements across transactions; psycopg 3 prepares after 5 executions by default.
        if "pooler" in DATABASE_URL or ":6543/" in DATABASE_URL or os.getenv("PG_DISABLE_PREPARE") == "1":
            connect_args["prepare_threshold"] = None
        _engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=2, max_overflow=2,
                                connect_args=connect_args)
    return _engine


def run_migrations() -> list[str]:
    """Apply every db/migrations/*.sql file once (tracked in schema_migrations)."""
    applied: list[str] = []
    with engine().begin() as conn:
        conn.execute(text(
            "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())"
        ))
        done = {r[0] for r in conn.execute(text("SELECT filename FROM schema_migrations"))}
        # password for the hunscout_web role created by migration 003 (random strong one if unset)
        conn.execute(text("SELECT set_config('hunscout.web_password', :pw, true)"),
                     {"pw": os.getenv("WEB_DB_PASSWORD", "")})
        for path in sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql"))):
            name = os.path.basename(path)
            if name in done:
                continue
            with open(path, encoding="utf-8") as fh:
                # exec_driver_sql goes through psycopg's %-placeholder parsing; a literal "%" (even in a
                # comment, e.g. "+600%") would raise "incomplete placeholder". Doubling it is the escape.
                conn.exec_driver_sql(fh.read().replace("%", "%%"))
            conn.execute(text("INSERT INTO schema_migrations(filename) VALUES (:f)"), {"f": name})
            applied.append(name)
    return applied


# ---------------------------------------------------------------------------
# upserts
# ---------------------------------------------------------------------------
def upsert_competition(conn: Connection, *, mlsz_comp_id: str, season: str, name: str, short_name: str | None,
                       tier: int, strength_multiplier: float, category: str, federation: str | None) -> UUID:
    return conn.execute(text("""
        INSERT INTO competitions (mlsz_comp_id, season, name, short_name, tier, strength_multiplier, category, federation)
        VALUES (:mlsz_comp_id, :season, :name, :short_name, :tier, :mult, :category, :federation)
        ON CONFLICT (mlsz_comp_id) DO UPDATE SET
            name = EXCLUDED.name, short_name = EXCLUDED.short_name, tier = EXCLUDED.tier,
            strength_multiplier = EXCLUDED.strength_multiplier, category = EXCLUDED.category,
            federation = EXCLUDED.federation
        RETURNING id
    """), dict(mlsz_comp_id=mlsz_comp_id, season=season, name=name, short_name=short_name, tier=tier,
               mult=strength_multiplier, category=category, federation=federation)).scalar_one()


def upsert_club(conn: Connection, mlsz_club_id: str, name: str, logo_url: str | None = None,
                short_name: str | None = None) -> UUID:
    town, lat, lng, county = geolocate(name)
    return conn.execute(text("""
        INSERT INTO clubs (mlsz_club_id, name, short_name, city, county, latitude, longitude, logo_url)
        VALUES (:mid, :name, :short, :city, :county, :lat, :lng, :logo)
        ON CONFLICT (mlsz_club_id) DO UPDATE SET
            name = EXCLUDED.name,
            logo_url = COALESCE(EXCLUDED.logo_url, clubs.logo_url),
            city = COALESCE(clubs.city, EXCLUDED.city),
            county = COALESCE(clubs.county, EXCLUDED.county),
            latitude = COALESCE(clubs.latitude, EXCLUDED.latitude),
            longitude = COALESCE(clubs.longitude, EXCLUDED.longitude),
            updated_at = now()
        RETURNING id
    """), dict(mid=mlsz_club_id, name=name, short=short_name or name.title(), city=town, county=county,
               lat=lat, lng=lng, logo=logo_url)).scalar_one()


def upsert_player(conn: Connection, mlsz_player_id: str, full_name: str, club_id: UUID | None = None) -> UUID:
    """Dedup by mlsz_player_id — the only identity key we trust across leagues and seasons."""
    return conn.execute(text("""
        INSERT INTO players (mlsz_player_id, full_name, current_club_id)
        VALUES (:mid, :name, :club)
        ON CONFLICT (mlsz_player_id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            current_club_id = COALESCE(EXCLUDED.current_club_id, players.current_club_id),
            updated_at = now()
        RETURNING id
    """), dict(mid=mlsz_player_id, name=full_name.title(), club=club_id)).scalar_one()


def _upsert_players(conn: Connection, rows: list[tuple[str, str, UUID]]) -> dict[str, UUID]:
    """One round trip for a whole lineup: (mlsz_player_id, full_name, club_id) -> {mlsz_player_id: id}."""
    if not rows:
        return {}
    return {r[0]: r[1] for r in conn.execute(text("""
        INSERT INTO players (mlsz_player_id, full_name, current_club_id)
        SELECT * FROM unnest(CAST(:mids AS varchar[]), CAST(:names AS text[]), CAST(:clubs AS uuid[]))
        ON CONFLICT (mlsz_player_id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            current_club_id = COALESCE(EXCLUDED.current_club_id, players.current_club_id),
            updated_at = now()
        RETURNING mlsz_player_id, id
    """), dict(mids=[r[0] for r in rows], names=[r[1].title() for r in rows], clubs=[r[2] for r in rows]))}


def load_match_report(conn: Connection, report: MatchReport, competition_id: UUID) -> UUID:
    """Write a match with its lineups in a handful of set-based statements (each statement is a network
    round trip to a hosted database, so per-player queries made a match take 10+ seconds)."""
    home_id = upsert_club(conn, report.home.mlsz_club_id, report.home.name, report.home.logo_url)
    away_id = upsert_club(conn, report.away.mlsz_club_id, report.away.name, report.away.logo_url)
    match_id = conn.execute(text("""
        INSERT INTO matches (mlsz_match_id, competition_id, round_number, match_date, venue, home_club_id, away_club_id,
                             home_goals, away_goals, status, scraped_at)
        VALUES (:mid, :comp, :rnd, :dt, :venue, :h, :a, :hg, :ag, :status, now())
        ON CONFLICT (mlsz_match_id) DO UPDATE SET
            round_number = EXCLUDED.round_number, match_date = EXCLUDED.match_date, venue = EXCLUDED.venue,
            home_club_id = EXCLUDED.home_club_id, away_club_id = EXCLUDED.away_club_id,
            home_goals = EXCLUDED.home_goals, away_goals = EXCLUDED.away_goals,
            status = EXCLUDED.status, scraped_at = now()
        RETURNING id
    """), dict(mid=report.mlsz_match_id, comp=competition_id, rnd=report.round_number, dt=report.match_date,
               venue=report.venue, h=home_id, a=away_id, hg=report.home_goals, ag=report.away_goals,
               status=report.status)).scalar_one()

    # one row per player (a duplicate in the report keeps its last entry, as the old per-row upserts did)
    lineup: dict[str, tuple[UUID, PlayerAppearance]] = {}
    for club_id, players in ((home_id, report.home_players), (away_id, report.away_players)):
        for app in players:
            lineup[app.mlsz_player_id] = (club_id, app)
    ids = _upsert_players(conn, [(mid, app.full_name, club_id) for mid, (club_id, app) in lineup.items()])

    apps = []
    events: list[tuple[UUID, UUID, int | None, str]] = []
    for mid, (club_id, app) in lineup.items():
        pid = ids[mid]
        # substitution direction: substitute -> the teammate they replaced (same club only)
        partner = lineup.get(app.partner_mlsz_player_id or "")
        replaced = ids[app.partner_mlsz_player_id] if (not app.is_starter and partner and partner[0] == club_id) else None
        apps.append((pid, club_id, app, replaced))
        evs: list[tuple[int | None, str]] = [(m, "goal") for m in app.goal_minutes]
        if not app.is_starter:
            evs.append((app.minute_in, "sub_in"))
        if app.minute_out < 90:
            evs.append((app.minute_out, "sub_out" if not app.red_cards else "red"))
        events.extend((pid, club_id, m, k) for m, k in dict.fromkeys(evs))

    # Late disciplinary corrections: rewrite the lineup wholesale.
    conn.execute(text("DELETE FROM match_events WHERE match_id = :m"), {"m": match_id})
    if apps:
        conn.execute(text("""
            INSERT INTO match_appearances (match_id, player_id, club_id, shirt_number, is_starter, minute_in,
                                           minute_out, minutes_played, goals, own_goals, yellow_cards, red_cards,
                                           replaced_player_id)
            SELECT CAST(:m AS uuid), * FROM unnest(
                CAST(:p AS uuid[]), CAST(:c AS uuid[]), CAST(:n AS int[]), CAST(:s AS boolean[]), CAST(:mi AS int[]),
                CAST(:mo AS int[]), CAST(:mp AS int[]), CAST(:g AS int[]), CAST(:og AS int[]), CAST(:y AS int[]),
                CAST(:r AS int[]), CAST(:rp AS uuid[]))
            ON CONFLICT (match_id, player_id) DO UPDATE SET
                club_id = EXCLUDED.club_id, shirt_number = EXCLUDED.shirt_number, is_starter = EXCLUDED.is_starter,
                minute_in = EXCLUDED.minute_in, minute_out = EXCLUDED.minute_out,
                minutes_played = EXCLUDED.minutes_played, goals = EXCLUDED.goals, own_goals = EXCLUDED.own_goals,
                yellow_cards = EXCLUDED.yellow_cards, red_cards = EXCLUDED.red_cards,
                replaced_player_id = EXCLUDED.replaced_player_id
        """), dict(m=match_id, p=[a[0] for a in apps], c=[a[1] for a in apps],
                   n=[a[2].shirt_number for a in apps], s=[a[2].is_starter for a in apps],
                   mi=[a[2].minute_in for a in apps], mo=[a[2].minute_out for a in apps],
                   mp=[a[2].minutes_played for a in apps], g=[a[2].goals for a in apps],
                   og=[a[2].own_goals for a in apps], y=[a[2].yellow_cards for a in apps],
                   r=[a[2].red_cards for a in apps], rp=[a[3] for a in apps]))
        conn.execute(text("DELETE FROM match_appearances WHERE match_id = :m AND NOT (player_id = ANY(:keep))"),
                     {"m": match_id, "keep": [a[0] for a in apps]})
    if events:
        conn.execute(text("""
            INSERT INTO match_events (match_id, player_id, club_id, minute, event_type)
            SELECT CAST(:m AS uuid), * FROM unnest(CAST(:p AS uuid[]), CAST(:c AS uuid[]), CAST(:min AS int[]),
                                                   CAST(:t AS varchar[]))
            ON CONFLICT DO NOTHING
        """), dict(m=match_id, p=[e[0] for e in events], c=[e[1] for e in events], min=[e[2] for e in events],
                   t=[e[3] for e in events]))
    return match_id


def load_player_profile(conn: Connection, profile: PlayerProfile) -> None:
    pid = conn.execute(text("SELECT id FROM players WHERE mlsz_player_id = :m"),
                       {"m": profile.mlsz_player_id}).scalar()
    if pid is None:
        pid = upsert_player(conn, profile.mlsz_player_id, profile.full_name)
    academy = False
    highest: int | None = None
    for s in profile.stints:
        category, tier = classify_competition_name(s.competition_name)
        if category == "youth" and s.appearances >= 3 and is_top_academy(s.club_names, s.competition_name):
            academy = True
        if category == "senior_11v11" and tier is not None and s.appearances >= 3:
            highest = tier if highest is None else min(highest, tier)
        conn.execute(text("""
            INSERT INTO player_career_stints (player_id, season, club_names, competition_name, mlsz_league_id, category,
                tier, appearances, starts, sub_ins, bench, goals, own_goals, yellow_cards, red_cards)
            VALUES (:p, :season, :clubs, :comp, :lid, :cat, :tier, :apps, :st, :sub, :bench, :g, :og, :y, :r)
            ON CONFLICT (player_id, season, competition_name) DO UPDATE SET
                club_names = EXCLUDED.club_names, mlsz_league_id = EXCLUDED.mlsz_league_id,
                category = EXCLUDED.category, tier = EXCLUDED.tier, appearances = EXCLUDED.appearances,
                starts = EXCLUDED.starts, sub_ins = EXCLUDED.sub_ins, bench = EXCLUDED.bench,
                goals = EXCLUDED.goals, own_goals = EXCLUDED.own_goals,
                yellow_cards = EXCLUDED.yellow_cards, red_cards = EXCLUDED.red_cards
        """), dict(p=pid, season=s.season, clubs=s.club_names, comp=s.competition_name, lid=s.mlsz_league_id,
                   cat=category, tier=tier, apps=s.appearances, st=s.starts, sub=s.sub_ins, bench=s.bench,
                   g=s.goals, og=s.own_goals, y=s.yellow_cards, r=s.red_cards))
    conn.execute(text("""
        UPDATE players SET
            birth_date = COALESCE(:bd, birth_date),
            birth_year = COALESCE(EXTRACT(YEAR FROM CAST(:bd AS DATE))::int, birth_year),
            has_academy_pedigree = has_academy_pedigree OR :acad,
            highest_tier_played = NULLIF(LEAST(COALESCE(highest_tier_played, 99), COALESCE(:hi, 99)), 99),
            profile_scraped_at = now(), updated_at = now()
        WHERE id = :p
    """), dict(bd=profile.birth_date, acad=academy, hi=highest, p=pid))


# ---------------------------------------------------------------------------
# sync bookkeeping
# ---------------------------------------------------------------------------
def start_sync(conn: Connection, source: str, mode: str) -> UUID:
    # a run killed from outside (cancelled CI job, function timeout) never reaches finish_sync: close it here
    conn.execute(text("""
        UPDATE sync_runs SET status = 'failed', finished_at = now(),
               error = COALESCE(error, 'megszakadt (a futás nem fejeződött be)')
        WHERE status = 'running' AND started_at < now() - interval '7 hours'
    """))
    return conn.execute(text("INSERT INTO sync_runs (source, mode) VALUES (:s, :m) RETURNING id"),
                        {"s": source, "m": mode}).scalar_one()


def fill_missing_coordinates(conn: Connection) -> int:
    """Locate clubs that have no coordinates yet (e.g. after the gazetteer grew). Returns how many were fixed."""
    fixed = 0
    for r in conn.execute(text("SELECT id, name FROM clubs WHERE latitude IS NULL OR longitude IS NULL")).all():
        town, lat, lng, county = geolocate(r.name)
        if town:
            conn.execute(text("""
                UPDATE clubs SET city = COALESCE(city, :t), county = COALESCE(county, :c),
                       latitude = :lat, longitude = :lng, updated_at = now()
                WHERE id = :id
            """), dict(t=town, c=county, lat=lat, lng=lng, id=r.id))
            fixed += 1
    return fixed


def finish_sync(conn: Connection, run_id: UUID, *, matches: int, players: int, error: str | None = None,
                fatal: bool = False) -> None:
    """A run is 'failed' only on a fatal error or when nothing was loaded; per-match errors are kept as notes."""
    conn.execute(text("""
        UPDATE sync_runs SET finished_at = :t, matches_upserted = :m, players_upserted = :p,
               status = :s, error = :e WHERE id = :id
    """), dict(t=datetime.now(timezone.utc), m=matches, p=players, s="failed" if fatal or (error and matches == 0) else "ok", e=error, id=run_id))
