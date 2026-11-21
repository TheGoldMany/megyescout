"""Resuming a backfill: --skip-known must not fetch matches that are already stored."""
import asyncio

import scraper
from models import FixtureLink


class _Rt:
    class target:
        key, federation_id, tier, strength_multiplier, category, federation = "t", 1, 3, 1.0, "senior_11v11", "x"
    season, league_id, name, short_name = "2026/2027", 99, "Teszt liga", "TL"


class _Client:
    def __init__(self):
        self.fetched: list[str] = []

    async def get(self, path):
        self.fetched.append(path)
        return "<html></html>"


def test_skip_known_matches(monkeypatch):
    fixtures = [FixtureLink(mlsz_match_id=m, url=f"{scraper.MLSZ_BASE}/match/{m}", has_result=True) for m in ("1", "2")]

    class _Conn:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def execute(self, *a, **k): return [("1",)]

    class _Eng:
        def begin(self): return _Conn()

    monkeypatch.setattr(scraper.db, "engine", lambda: _Eng())
    monkeypatch.setattr(scraper.db, "upsert_competition", lambda conn, **k: 7)
    monkeypatch.setattr(scraper.db, "load_match_report", lambda conn, report, cid: None)

    async def rounds(*a):
        return [1]
    monkeypatch.setattr(scraper, "rounds_to_scrape", rounds)
    monkeypatch.setattr(scraper, "parse_round_page", lambda html: fixtures)

    class _Rep:
        round_number = 1
        home_players: list = []
        away_players: list = []
    monkeypatch.setattr(scraper, "parse_match_report", lambda html, url: _Rep())
    monkeypatch.setitem(scraper.SEASON_IDS, "2026/2027", scraper.SEASON_IDS["2026/2027"])

    client, stats = _Client(), scraper.ScrapeStats()
    asyncio.run(scraper.scrape_competition(client, _Rt, "backfill", False, stats, skip_known=True))
    assert [p for p in client.fetched if "/match/" in p] == ["/match/2"]
    assert stats.matches == 1
