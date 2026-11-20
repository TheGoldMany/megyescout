"""HTTP entrypoint of the ETL service (Vercel service `etl`, internal only).

The service has no public route: the `web` service reaches it through a Vercel service
binding (`ETL_URL`). The scheduled MLSZ sync is a Vercel schedule hitting
`web /api/cron/sync`, which calls `POST /sync` here once per competition and
`POST /analytics` at the end, so every invocation stays well inside the function time limit.

Locally:  uvicorn api:app --port 8000   (or `vercel dev` from the repo root)

Endpoints
    GET  /health      database reachability
    GET  /targets     V1 competition targets (keys accepted by /sync)
    POST /sync        scrape MLSZ: {"mode", "only", "season", "profiles", "analytics"}
    POST /analytics   recompute metrics + refresh mv_player_explorer
    POST /profiles    fetch missing/stale player profile pages
"""
from __future__ import annotations

import logging
import os
import secrets
import time
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text

import analytics
import db
import scraper
from config import CURRENT_SEASON, SEASON_IDS, V1_TARGETS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("hunscout.api")

app = FastAPI(title="HUN-SCOUT ETL", docs_url=None, redoc_url=None, openapi_url=None)

TARGET_KEYS = {t.key for t in V1_TARGETS}


def require_token(x_internal_token: str | None = Header(default=None)) -> None:
    """Defence in depth on top of the private binding: if ETL_INTERNAL_TOKEN is set, require it."""
    expected = os.getenv("ETL_INTERNAL_TOKEN")
    if expected and not (x_internal_token and secrets.compare_digest(x_internal_token, expected)):
        raise HTTPException(status_code=401, detail="invalid internal token")


class SyncRequest(BaseModel):
    mode: Literal["incremental", "backfill"] = "incremental"
    only: list[str] | None = Field(default=None, description="target keys; omit for all V1 targets")
    season: str = CURRENT_SEASON
    profiles: bool = True
    analytics: bool = True

    @field_validator("only")
    @classmethod
    def known_targets(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            unknown = sorted(set(v) - TARGET_KEYS)
            if unknown:
                raise ValueError(f"unknown target(s): {', '.join(unknown)}")
        return v

    @field_validator("season")
    @classmethod
    def known_season(cls, v: str) -> str:
        if v not in SEASON_IDS:
            raise ValueError(f"unknown season {v!r}")
        return v


class ProfilesRequest(BaseModel):
    limit: int | None = Field(default=200, ge=1, le=5000)
    stale_days: int = Field(default=30, ge=0, le=3650)


@app.get("/health")
def health() -> dict:
    try:
        with db.engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True}
    except Exception as exc:  # report, don't crash the probe
        raise HTTPException(status_code=503, detail=f"database unreachable: {exc.__class__.__name__}")


@app.get("/targets", dependencies=[Depends(require_token)])
def targets() -> list[dict]:
    return [{"key": t.key, "name": t.name, "short_name": t.short_name, "tier": t.tier, "category": t.category}
            for t in V1_TARGETS]


@app.post("/sync", dependencies=[Depends(require_token)])
async def sync(req: SyncRequest) -> dict:
    started = time.monotonic()
    try:
        stats = await scraper.run(req.mode, req.only, req.season, req.profiles)
    except Exception as exc:
        log.exception("sync failed")
        raise HTTPException(status_code=502, detail=f"sync failed: {exc}")
    result = {
        "targets": req.only or sorted(TARGET_KEYS),
        "season": req.season,
        "mode": req.mode,
        "matches": stats.matches,
        "players": len(stats.players),
        "errors": stats.errors[:20],
    }
    if req.analytics:
        result["analytics"] = analytics.run()
    result["seconds"] = round(time.monotonic() - started, 1)
    return result


@app.post("/analytics", dependencies=[Depends(require_token)])
def run_analytics() -> dict:
    return analytics.run()


@app.post("/profiles", dependencies=[Depends(require_token)])
async def profiles(req: ProfilesRequest) -> dict:
    async with scraper.MlszClient() as client:
        loaded = await scraper.refresh_profiles(client, None, req.stale_days, req.limit)
    return {"loaded": loaded, "analytics": analytics.run() if loaded else None}
