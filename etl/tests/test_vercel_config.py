"""Guards for vercel.json on the Vercel Hobby plan (300 s functions, jitter fixed at 15 min,
max 100 static schedules per deployment, 5,000 runs per billing period)."""
import json
import re
from collections import defaultdict
from pathlib import Path

from config import V1_TARGETS

CFG = json.loads((Path(__file__).resolve().parents[2] / "vercel.json").read_text(encoding="utf-8"))
SCHEDULES = CFG["schedules"]
HOBBY_JITTER_MIN = 15


def _start_minutes(cron: str) -> tuple[int, int]:
    minute, hour, _dom, _mon, dow = cron.split()
    return int(dow), int(hour) * 60 + int(minute)


def test_every_target_synced_monday_and_wednesday():
    per_target = defaultdict(set)
    for s in SCHEDULES.values():
        m = re.fullmatch(r"/api/cron/sync/([a-z0-9_]+)", s["path"])
        assert m, s["path"]
        per_target[m.group(1)].add(_start_minutes(s["schedule"])[0])
        assert s["timezone"] == "Europe/Budapest"
    assert set(per_target) == {t.key for t in V1_TARGETS}
    assert all(days == {1, 3} for days in per_target.values())


def test_runs_do_not_pile_up_under_hobby_jitter():
    by_day = defaultdict(list)
    for s in SCHEDULES.values():
        dow, start = _start_minutes(s["schedule"])
        by_day[dow].append(start)
    for starts in by_day.values():
        starts.sort()
        gaps = [b - a for a, b in zip(starts, starts[1:])]
        assert min(gaps) >= HOBBY_JITTER_MIN


def test_hobby_limits():
    assert len(SCHEDULES) <= 100
    runs_per_month = len(SCHEDULES) * 31 / 7  # each schedule fires weekly
    assert runs_per_month < 5000


def test_services_and_binding():
    services = CFG["services"]
    assert set(services) == {"web", "etl"}
    assert {"type": "service", "service": "etl", "format": "url", "env": "ETL_URL"} in services["web"]["bindings"]
    # etl stays internal: no public rewrite points at it
    assert all(r["destination"]["service"] != "etl" for r in CFG["rewrites"])
