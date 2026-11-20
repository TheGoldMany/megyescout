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
        _engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
    return _engine


def run_migrations() -> list[str]:
    """Apply every db/migrations/*.sql file once (tracked in schema_migrations)."""
    applied: list[str] = []
    with engine().begin() as conn:
        conn.execute(text(
            "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())"
        ))
        done = {r[0] for r in conn.execute(text("SELECT filename FROM schema_migrations"))}
        for path in sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql"))):
            name = os.path.basename(path)
            if name in done:
                continue
            with open(path, encoding="utf-8") as fh:
                conn.exec_driver_sql(fh.read())
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


def _write_appearance(conn: Connection, match_id: UUID, club_id: UUID, app: PlayerAppearance) -> UUID:
    player_id = upsert_player(conn, app.mlsz_player_id, app.full_name, club_id)
    conn.execute(text("""
        INSERT INTO match_appearances (match_id, player_id, club_id, shirt_number, is_starter, minute_in, minute_out,
                                       minutes_played, goals, own_goals, yellow_cards, red_cards)
        VALUES (:m, :p, :c, :n, :s, :mi, :mo, :mp, :g, :og, :y, :r)
        ON CONFLICT (match_id, player_id) DO UPDATE SET
            club_id = EXCLUDED.club_id, shirt_number = EXCLUDED.shirt_number, is_starter = EXCLUDED.is_starter,
            minute_in = EXCLUDED.minute_in, minute_out = EXCLUDED.minute_out, minutes_played = EXCLUDED.minutes_played,
            goals = EXCLUDED.goals, own_goals = EXCLUDED.own_goals,
            yellow_cards = EXCLUDED.yellow_cards, red_cards = EXCLUDED.red_cards
    """), dict(m=match_id, p=player_id, c=club_id, n=app.shirt_number, s=app.is_starter, mi=app.minute_in,
               mo=app.minute_out, mp=app.minutes_played, g=app.goals, og=app.own_goals, y=app.yellow_cards,
               r=app.red_cards))
    events: list[tuple[int | None, str]] = [(m, "goal") for m in app.goal_minutes]
    if not app.is_starter:
        events.append((app.minute_in, "sub_in"))
    if app.minute_out < 90:
        events.append((app.minute_out, "sub_out" if not app.red_cards else "red"))
    for minute, kind in events:
        conn.execute(text("""
            INSERT INTO match_events (match_id, player_id, club_id, minute, event_type)
            VALUES (:m, :p, :c, :min, :t) ON CONFLICT DO NOTHING
        """), dict(m=match_id, p=player_id, c=club_id, min=minute, t=kind))
    return player_id


def load_match_report(conn: Connection, report: MatchReport, competition_id: UUID) -> UUID:
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

    # Late disciplinary corrections: rewrite the lineup wholesale.
    conn.execute(text("DELETE FROM match_events WHERE match_id = :m"), {"m": match_id})
    keep: list[UUID] = []
    for club_id, players in ((home_id, report.home_players), (away_id, report.away_players)):
        ids: dict[str, UUID] = {}
        for app in players:
            ids[app.mlsz_player_id] = _write_appearance(conn, match_id, club_id, app)
        keep.extend(ids.values())
        # substitution direction: substitute -> the teammate they replaced
        for app in players:
            replaced = ids.get(app.partner_mlsz_player_id or "") if not app.is_starter else None
            conn.execute(text("UPDATE match_appearances SET replaced_player_id = :r WHERE match_id = :m AND player_id = :p"),
                         {"r": replaced, "m": match_id, "p": ids[app.mlsz_player_id]})
    if keep:
        conn.execute(text("DELETE FROM match_appearances WHERE match_id = :m AND NOT (player_id = ANY(:keep))"),
                     {"m": match_id, "keep": keep})
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
    return conn.execute(text("INSERT INTO sync_runs (source, mode) VALUES (:s, :m) RETURNING id"),
                        {"s": source, "m": mode}).scalar_one()


def finish_sync(conn: Connection, run_id: UUID, *, matches: int, players: int, error: str | None = None,
                fatal: bool = False) -> None:
    """A run is 'failed' only on a fatal error or when nothing was loaded; per-match errors are kept as notes."""
    conn.execute(text("""
        UPDATE sync_runs SET finished_at = :t, matches_upserted = :m, players_upserted = :p,
               status = :s, error = :e WHERE id = :id
    """), dict(t=datetime.now(timezone.utc), m=matches, p=players, s="failed" if fatal or (error and matches == 0) else "ok", e=error, id=run_id))
