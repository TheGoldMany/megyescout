"""Set-based match loading against a real Postgres (TEST_DATABASE_URL; CI provides one, skipped locally without it)."""
import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

import config
import db
from parser import parse_match_report

URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL not set")
FIX = Path(__file__).parent / "fixtures"
MATCH_URL = "https://adatbank.mlsz.hu/match/67/0/33586/13/2186449.html"


@pytest.fixture()
def conn(monkeypatch):
    url = config._normalize_db_url(URL)
    monkeypatch.setattr(db, "DATABASE_URL", url)
    monkeypatch.setattr(db, "_engine", create_engine(url))
    db.run_migrations()
    with db.engine().begin() as c:
        c.execute(text("TRUNCATE matches, players, clubs, competitions CASCADE"))
    with db.engine().begin() as c:
        yield c
    monkeypatch.setattr(db, "_engine", None)


def test_load_match_report_is_complete_and_idempotent(conn):
    rep = parse_match_report((FIX / "match_nb1_2186449.html").read_text(encoding="utf-8"), MATCH_URL)
    cid = db.upsert_competition(conn, mlsz_comp_id="t", season="2026/2027", name="T", short_name="T", tier=1,
                                strength_multiplier=1.0, category="senior_11v11", federation="x")
    mid = db.load_match_report(conn, rep, cid)
    assert db.load_match_report(conn, rep, cid) == mid  # re-running rewrites, never duplicates
    n_players = len({p.mlsz_player_id for p in rep.home_players + rep.away_players})
    assert conn.execute(text("SELECT count(*) FROM match_appearances WHERE match_id = :m"), {"m": mid}).scalar() == n_players
    assert conn.execute(text("SELECT count(*) FROM players")).scalar() == n_players
    # every substitute that MLSZ pairs with a teammate points at that teammate
    subs = [p for p in rep.home_players + rep.away_players if not p.is_starter and p.partner_mlsz_player_id]
    paired = conn.execute(text("""
        SELECT count(*) FROM match_appearances a JOIN players r ON r.id = a.replaced_player_id WHERE a.match_id = :m
    """), {"m": mid}).scalar()
    assert subs and paired == len(subs)
    goals = sum(len(p.goal_minutes) for p in rep.home_players + rep.away_players)
    assert conn.execute(text("SELECT count(*) FROM match_events WHERE match_id = :m AND event_type = 'goal'"),
                        {"m": mid}).scalar() == goals

    # a player removed from the report (late correction) disappears from the lineup
    dropped = rep.home_players[-1]
    rep.home_players = rep.home_players[:-1]
    db.load_match_report(conn, rep, cid)
    assert conn.execute(text("""
        SELECT count(*) FROM match_appearances a JOIN players p ON p.id = a.player_id
        WHERE a.match_id = :m AND p.mlsz_player_id = :pid
    """), {"m": mid, "pid": dropped.mlsz_player_id}).scalar() == 0
