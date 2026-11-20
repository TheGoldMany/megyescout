"""HTTP contract of the internal ETL service (no database or network needed)."""
import pytest
from fastapi.testclient import TestClient

import api


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("ETL_INTERNAL_TOKEN", raising=False)
    return TestClient(api.app)


def test_targets_lists_all_v1_competitions(client):
    r = client.get("/targets")
    assert r.status_code == 200
    keys = {t["key"] for t in r.json()}
    assert {"bk1", "nb3_dk", "pest1", "blsz1", "jnsz1", "mk"} <= keys


def test_internal_token_is_enforced_when_configured(client, monkeypatch):
    monkeypatch.setenv("ETL_INTERNAL_TOKEN", "s3cret")
    assert client.get("/targets").status_code == 401
    assert client.get("/targets", headers={"X-Internal-Token": "wrong"}).status_code == 401
    assert client.get("/targets", headers={"X-Internal-Token": "s3cret"}).status_code == 200


def test_sync_rejects_unknown_targets_and_seasons(client):
    assert client.post("/sync", json={"only": ["nope"]}).status_code == 422
    assert client.post("/sync", json={"season": "1999/2000"}).status_code == 422


def test_sync_passes_arguments_to_scraper(client, monkeypatch):
    calls = {}

    async def fake_run(mode, only, season, profiles, deadline=None):
        calls.update(mode=mode, only=only, season=season, profiles=profiles)
        calls["budget"] = round(deadline - api.time.monotonic())
        return api.scraper.ScrapeStats(matches=7, players={"1", "2"})

    monkeypatch.setattr(api.scraper, "run", fake_run)
    r = client.post("/sync", json={"only": ["bk1"], "analytics": False, "profiles": False, "budget_seconds": 120})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["matches"], body["players"], body["targets"]) == (7, 2, ["bk1"])
    assert calls == {"mode": "incremental", "only": ["bk1"], "season": api.CURRENT_SEASON, "profiles": False,
                     "budget": 120}
    assert body["truncated"] is False


def test_sync_failure_maps_to_502(client, monkeypatch):
    async def boom(*_a, **_k):
        raise RuntimeError("giving up on /league/...")

    monkeypatch.setattr(api.scraper, "run", boom)
    r = client.post("/sync", json={"only": ["bk1"], "analytics": False})
    assert r.status_code == 502
    assert "giving up" in r.json()["detail"]


def test_database_url_normalisation():
    from config import _normalize_db_url
    assert _normalize_db_url("postgres://u:p@h:6543/db") == "postgresql+psycopg://u:p@h:6543/db"
    assert _normalize_db_url("postgresql+psycopg://u@h/db") == "postgresql+psycopg://u@h/db"


def test_budget_bounds_are_enforced(client):
    assert client.post("/sync", json={"only": ["bk1"], "budget_seconds": 1}).status_code == 422
