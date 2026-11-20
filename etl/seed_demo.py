"""Demo data generator: realistic regional leagues around Lajosmizse.

Creates clubs, competitions, a full match schedule up to the current round with
consistent lineups / substitutions / goals / cards, multi-season career stints
(youth academy + futsal detours) and a few private scout notes, then runs the
analytics engine. All MLSZ ids are prefixed with "demo-" so live scraping can
never collide with them; `python cli.py seed --reset` wipes demo rows first.

    python seed_demo.py            # seed + analytics
    python seed_demo.py --reset    # delete previous demo data first
"""
from __future__ import annotations

import argparse
import logging
import math
import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import text

import analytics
import db
from config import CURRENT_SEASON, HOME_WORKSPACE
from geo import GAZETTEER

log = logging.getLogger("hunscout.seed")
RNG = random.Random(20261120)

SEASON = CURRENT_SEASON              # "2026/2027"
CURRENT_ROUND = 13                   # autumn half nearly done
SEASON_START = datetime(2026, 8, 8, 16, 30)

# (key, name, short, tier, multiplier, federation, [(club name, town, strength 0-1)])
LEAGUES = [
    ("nb3_dk", "NB III. Dél-Keleti csoport", "NB III DK", 3, 1.60, "MLSZ", [
        ("Tiszakécskei LC", "Tiszakécske", 0.78), ("Kecskeméti TE II", "Kecskemét", 0.70),
        ("Szolnoki MÁV FC", "Szolnok", 0.80), ("Ceglédi VSE", "Cegléd", 0.66),
        ("Hódmezővásárhelyi FC", "Hódmezővásárhely", 0.72), ("Kiskunfélegyházi HTK", "Kiskunfélegyháza", 0.58),
        ("Monor SE", "Monor", 0.62), ("Dunaharaszti MTK", "Dunaharaszti", 0.68),
        ("Martfűi LSE", "Martfű", 0.50), ("Szentesi Kinizsi", "Szentes", 0.54),
        ("Békéscsaba 1912 Előre II", "Békéscsaba", 0.57), ("Gyulai Termál FC", "Gyula", 0.60),
    ]),
    ("bk1", "Bács-Kiskun Vármegyei I.", "BK Megye I", 4, 1.10, "Bács-Kiskun", [
        ("Lajosmizsei VLC", "Lajosmizse", 0.66), ("Kecskeméti LC", "Kecskemét", 0.70),
        ("Kerekegyházi SE", "Kerekegyháza", 0.55), ("Kiskunhalas FC", "Kiskunhalas", 0.72),
        ("Kalocsai FC", "Kalocsa", 0.62), ("Kiskőrösi LC", "Kiskőrös", 0.60),
        ("Bácsalmási PVSE", "Bácsalmás", 0.50), ("Izsáki Sárfehér SE", "Izsák", 0.57),
        ("Soltvadkerti TE", "Soltvadkert", 0.64), ("Jánoshalmi FC", "Jánoshalma", 0.48),
        ("Kunszentmiklósi TE", "Kunszentmiklós", 0.53), ("Helvécia SE", "Helvécia", 0.45),
    ]),
    ("pest1", "Pest Vármegyei I. osztály", "Pest Megye I", 4, 1.15, "Pest", [
        ("Dabas-Gyón FC", "Dabas", 0.72), ("Nagykőrösi Kinizsi FC", "Nagykőrös", 0.65),
        ("Pilisi LK", "Pilis", 0.55), ("Albertirsai SE", "Albertirsa", 0.58),
        ("Ócsai TK", "Ócsa", 0.52), ("Gyáli BKSE", "Gyál", 0.60), ("Vecsési FC", "Vecsés", 0.68),
        ("Üllői SE", "Üllő", 0.54), ("Abonyi FC", "Abony", 0.62), ("Örkényi SE", "Örkény", 0.49),
        ("Dunavarsányi TE", "Dunavarsány", 0.57), ("Szigetszentmiklósi TK", "Szigetszentmiklós", 0.70),
    ]),
    ("blsz1", "BLSZ I. osztály", "BLSZ I", 4, 1.15, "Budapest", [
        ("Csepel SC II", "Budapest", 0.62), ("Rákosmenti KSK", "Budapest", 0.66),
        ("Soroksár SC II", "Budapest", 0.58), ("BKV Előre SC", "Budapest", 0.70),
        ("III. Kerületi TVE", "Budapest", 0.68), ("Budafoki LC", "Budapest", 0.55),
        ("Ferencvárosi Vasutas SC", "Budapest", 0.52), ("Újpesti Haladás", "Budapest", 0.50),
        ("Kőbányai Sörgyár SE", "Budapest", 0.57), ("Zuglói SE", "Budapest", 0.60),
    ]),
    ("jnsz1", "Jász-Nagykun-Szolnok Vármegyei I.", "JNSZ Megye I", 4, 1.00, "Jász-Nagykun-Szolnok", [
        ("Szolnoki MÁV FC II", "Szolnok", 0.60), ("Jászberényi FC", "Jászberény", 0.70),
        ("Törökszentmiklósi FC", "Törökszentmiklós", 0.66), ("Tiszaföldvári SE", "Tiszaföldvár", 0.58),
        ("Kunszentmártoni TE", "Kunszentmárton", 0.55), ("Rákóczifalvai SE", "Rákóczifalva", 0.52),
        ("Újszászi VVSE", "Újszász", 0.50), ("Mezőtúri AFC", "Mezőtúr", 0.62),
        ("Karcagi SE", "Karcag", 0.64), ("Besenyszögi SE", "Besenyszög", 0.47),
    ]),
    ("bk2e", "Bács-Kiskun Vármegyei II. Észak", "BK Megye II É", 5, 0.85, "Bács-Kiskun", [
        ("Ballószög KSE", "Ballószög", 0.60), ("Hetényegyházi SE", "Hetényegyháza", 0.62),
        ("Lakitelek SE", "Lakitelek", 0.66), ("Tiszaalpári SE", "Tiszaalpár", 0.58),
        ("Városföldi SE", "Városföld", 0.50), ("Ladánybene SE", "Ladánybene", 0.48),
        ("Fülöpszállási SE", "Fülöpszállás", 0.53), ("Szabadszállási SE", "Szabadszállás", 0.56),
        ("Orgoványi SE", "Orgovány", 0.45), ("Ágasegyházi SE", "Ágasegyháza", 0.44),
    ]),
    ("pest2d", "Pest Vármegyei II. osztály Dél", "Pest Megye II D", 5, 0.90, "Pest", [
        ("Táborfalvai SE", "Táborfalva", 0.55), ("Inárcsi SE", "Inárcs", 0.58),
        ("Kakucsi SE", "Kakucs", 0.52), ("Hernádi SE", "Hernád", 0.50),
        ("Újhartyáni SE", "Újhartyán", 0.62), ("Csévharaszti SE", "Csévharaszt", 0.47),
        ("Nyáregyházi SE", "Nyáregyháza", 0.54), ("Mikebudai SE", "Mikebuda", 0.45),
        ("Ceglédberceli SE", "Ceglédbercel", 0.60), ("Tápiószelei SE", "Tápiószele", 0.57),
    ]),
]

SURNAMES = (
    "Nagy Kovács Tóth Szabó Horváth Varga Kiss Molnár Németh Farkas Balogh Papp Takács Juhász Lakatos Mészáros "
    "Oláh Simon Rácz Fekete Szilágyi Török Fehér Balázs Gál Kis Szűcs Kocsis Orsós Pintér Fodor Szalai Sipos "
    "Magyar Lukács Gulyás Biró Király Katona László Jakab Bogdán Balog Sándor Boros Fazekas Kelemen Antal Orbán "
    "Somogyi Vincze Hegedűs Veres Deák Budai Pap Bálint Pál Illés Vörös Szőke Fülöp Vass Csizmadia Bakó Hajdu "
    "Bognár Lengyel Sárközi Major Szekeres Barna Halász Erdélyi Csonka Mohácsi Szénási Bozsó Dobos Kun Héjja "
    "Kardos Bartos Ujvári Pásztor Bencze Csóka Győri Kovacsics Dudás Rigó Szél Tamás Benkő Kónya Kecskeméti"
).split()
GIVEN = (
    "Bence Máté Levente Dominik Dávid Ádám Balázs Gergő Márk Zalán Péter Tamás Zoltán Gábor László Attila "
    "Krisztián Norbert Richárd Roland Milán Marcell Botond Kristóf Olivér Benedek Barnabás Patrik Áron Csaba "
    "Dániel Norbert Szabolcs Viktor Zsombor Noel Martin Ákos Erik Kornél Bálint Hunor Soma Vince Nándor Tibor "
    "Róbert István János Sándor Ferenc Imre Gyula Mihály András Benjámin Kevin Alex Dezső Lóránt Zsolt"
).split()

ACADEMIES = [
    ("Kecskeméti TE U19", "MLSZ Országos U19 Kiemelt csoport"),
    ("Puskás Akadémia FC U17", "MLSZ Országos U17 Kiemelt csoport"),
    ("MTK Budapest U19", "MLSZ Országos U19 Kiemelt csoport"),
    ("Budapest Honvéd-MFA U17", "MLSZ Országos U17 Kiemelt csoport"),
    ("Ferencvárosi TC U19", "MLSZ Országos U19 Kiemelt csoport"),
    ("Szolnoki MÁV FC U19", "MLSZ Regionális U19 Kiemelt Kelet"),
    ("Illés Akadémia U17", "MLSZ Országos U17 Kiemelt csoport"),
]
LOCAL_YOUTH = "Vármegyei U19"
FUTSAL_COMPS = ["Férfi Futsal NB II. Keleti csoport", "Regionális Futsal Bajnokság Közép csoport"]


@dataclass
class DemoPlayer:
    id: uuid.UUID
    mlsz_id: str
    name: str
    birth_date: datetime
    position: str
    shirt: int
    talent: float          # 0-1 overall level (relative to league)
    finishing: float       # goal scoring tendency
    aggression: float      # card tendency
    availability: float    # chance to be available on a matchday
    academy: str | None = None
    futsal: bool = False


@dataclass
class DemoClub:
    id: uuid.UUID
    mlsz_id: str
    name: str
    town: str
    strength: float
    league_key: str
    squad: list[DemoPlayer] = field(default_factory=list)


# ---------------------------------------------------------------------------
# generation
# ---------------------------------------------------------------------------
_used_names: set[str] = set()
_player_seq = [100000]


def _name() -> str:
    for _ in range(50):
        n = f"{RNG.choice(SURNAMES)} {RNG.choice(GIVEN)}"
        if RNG.random() < 0.18:
            n += f" {RNG.choice(GIVEN)}"
        if n not in _used_names:
            _used_names.add(n)
            return n
    return n


def _birth_date() -> datetime:
    # Lower-league age profile: a lot of 18-24s, a long tail of 30+ veterans.
    year = int(round(RNG.triangular(1987, 2009, 2003)))
    return datetime(year, RNG.randint(1, 12), RNG.randint(1, 28))


def _shirt_for(position: str, taken: set[int]) -> int:
    conventional = {"GK": [1, 12, 31], "DEF": [2, 3, 4, 5], "MID": [6, 8, 10], "FWD": [7, 9, 11]}[position]
    pool = [n for n in conventional if n not in taken]
    if pool and RNG.random() < 0.75:
        n = RNG.choice(pool)
    else:
        free = [n for n in range(13, 31) if n not in taken] or list(range(32, 99))
        n = RNG.choice(free)
    taken.add(n)
    return n


def make_squad(club: DemoClub) -> None:
    layout = ["GK"] * 2 + ["DEF"] * 7 + ["MID"] * 7 + ["FWD"] * 5
    if RNG.random() < 0.5:
        layout.append("GK")
    taken: set[int] = set()
    for pos in layout:
        _player_seq[0] += RNG.randint(1, 37)
        bd = _birth_date()
        age = 2026 - bd.year
        talent = min(1.0, max(0.05, RNG.gauss(club.strength, 0.16)))
        # young + talented players are more often academy products
        academy = None
        if age <= 24 and talent > 0.62 and RNG.random() < 0.55:
            academy = RNG.choice(ACADEMIES)[0]
        elif RNG.random() < 0.07:
            academy = RNG.choice(ACADEMIES)[0]
        finishing = {"GK": 0.0, "DEF": 0.12, "MID": 0.35, "FWD": 0.85}[pos] * RNG.uniform(0.5, 1.6)
        club.squad.append(DemoPlayer(
            id=uuid.uuid4(), mlsz_id=f"demo-{_player_seq[0]}", name=_name(), birth_date=bd, position=pos,
            shirt=_shirt_for(pos, taken), talent=talent, finishing=finishing,
            aggression=RNG.uniform(0.4, 1.8) * (1.3 if pos in ("DEF", "MID") else 0.8),
            availability=RNG.uniform(0.72, 0.97), academy=academy,
            futsal=RNG.random() < (0.18 if pos in ("MID", "FWD") else 0.05),
        ))


def round_robin(n: int) -> list[list[tuple[int, int]]]:
    """Circle method; returns rounds of (home_idx, away_idx)."""
    teams = list(range(n)) + ([None] if n % 2 else [])
    m = len(teams)
    rounds = []
    for r in range(m - 1):
        pairs = []
        for i in range(m // 2):
            a, b = teams[i], teams[m - 1 - i]
            if a is None or b is None:
                continue
            pairs.append((a, b) if (r + i) % 2 == 0 else (b, a))
        rounds.append(pairs)
        teams = [teams[0]] + [teams[-1]] + teams[1:-1]
    return rounds


def _poisson(lam: float) -> int:
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= RNG.random()
        if p <= l:
            return k
        k += 1


def pick_lineup(club: DemoClub) -> tuple[list[DemoPlayer], list[DemoPlayer]]:
    avail = [p for p in club.squad if RNG.random() < p.availability]
    def best(pos: str, k: int) -> list[DemoPlayer]:
        c = [p for p in avail if p.position == pos]
        c.sort(key=lambda p: p.talent + RNG.gauss(0, 0.08), reverse=True)
        return c[:k]
    formation = {"GK": 1, "DEF": 4, "MID": 4, "FWD": 2}
    xi: list[DemoPlayer] = []
    for pos, k in formation.items():
        xi += best(pos, k)
    # fill gaps from anyone available (short-handed amateur squads)
    rest = [p for p in avail if p not in xi and p.position != "GK"]
    rest.sort(key=lambda p: p.talent, reverse=True)
    while len(xi) < 11 and rest:
        xi.append(rest.pop(0))
    bench = [p for p in avail if p not in xi][:7]
    return xi, bench


@dataclass
class AppRow:
    player: DemoPlayer
    is_starter: bool
    minute_in: int
    minute_out: int
    goals: int = 0
    yellow: int = 0
    red: int = 0
    replaced: DemoPlayer | None = None


def simulate_side(xi: list[DemoPlayer], bench: list[DemoPlayer], goals_for: int) -> list[AppRow]:
    rows = {p.id: AppRow(p, True, 0, 90) for p in xi}
    # substitutions: 2-5, attacking players more likely to come on
    n_subs = min(len(bench), RNG.choice([2, 3, 3, 4, 4, 5]))
    bench_sorted = sorted(bench, key=lambda p: p.talent + (0.15 if p.position in ("FWD", "MID") else 0)
                          + RNG.gauss(0, 0.1), reverse=True)
    outfield_xi = [p for p in xi if p.position != "GK"]
    for sub in bench_sorted[:n_subs]:
        if sub.position == "GK":
            continue
        candidates = [p for p in outfield_xi if rows[p.id].minute_out == 90 and rows[p.id].is_starter]
        if not candidates:
            break
        # mostly like-for-like changes (as in real lower-league football), sometimes tactical
        same = [p for p in candidates if p.position == sub.position]
        if same and RNG.random() < 0.72:
            candidates = same
        candidates.sort(key=lambda p: p.talent + (0.1 if p.position == "DEF" else 0) + RNG.gauss(0, 0.12))
        off = candidates[0]
        minute = RNG.choice([46, 46] + list(range(55, 89)))
        rows[off.id].minute_out = minute
        rows[sub.id] = AppRow(sub, False, minute, 90, replaced=off)

    # cards
    for r in rows.values():
        if r.minute_out <= r.minute_in:
            continue
        mins = r.minute_out - r.minute_in
        if RNG.random() < 0.13 * r.player.aggression * mins / 90:
            r.yellow = 1
            if RNG.random() < 0.06:
                r.yellow, r.red = 2, 1
        elif RNG.random() < 0.006 * r.player.aggression:
            r.red = 1
        if r.red:
            r.minute_out = max(r.minute_in + 1, min(r.minute_out, RNG.randint(max(r.minute_in + 1, 20), 89)))

    # goals: pick a minute, then a scorer among players on the pitch at that minute
    for _ in range(goals_for):
        minute = RNG.randint(1, 90)
        on_pitch = [r for r in rows.values() if r.minute_in <= minute < r.minute_out]
        if not on_pitch:
            continue
        weights = [max(0.01, r.player.finishing * (0.6 + r.player.talent)) for r in on_pitch]
        RNG.choices(on_pitch, weights)[0].goals += 1
    return list(rows.values())


def career_stints(p: DemoPlayer, club: DemoClub, league_name: str, tier: int, all_clubs: list[DemoClub]) -> list[dict]:
    """Previous-season history: youth (academy or local), futsal detours, senior moves."""
    stints = []
    birth = p.birth_date.year
    for start in range(2022, 2026):
        season = f"{start}/{start + 1}"
        age = start - birth
        if age < 15:
            continue
        if age <= 18:
            if p.academy:
                comp = next(c for a, c in ACADEMIES if a == p.academy)
                stints.append(dict(season=season, club_names=p.academy, competition_name=comp, category="youth",
                                   tier=None, appearances=RNG.randint(12, 26), goals=_poisson(p.finishing * 5)))
            else:
                stints.append(dict(season=season, club_names=f"{club.name} U19", competition_name=LOCAL_YOUTH,
                                   category="youth", tier=None, appearances=RNG.randint(8, 22),
                                   goals=_poisson(p.finishing * 6)))
            continue
        # senior seasons: mostly the same club / tier, sometimes a move
        if RNG.random() < 0.72:
            cname, comp, t = club.name, league_name, tier
        else:
            other = RNG.choice(all_clubs)
            cname = other.name
            comp, t = next((l[1], l[3]) for l in LEAGUES if l[0] == other.league_key)
        if p.academy and age <= 21 and RNG.random() < 0.35:
            cname, comp, t = p.academy.replace(" U19", " II").replace(" U17", " II"), "NB III. Közép csoport", 3
        apps = max(0, int(RNG.gauss(14 + p.talent * 14, 5)))
        stints.append(dict(season=season, club_names=cname, competition_name=comp, category="senior_11v11",
                           tier=t, appearances=apps, goals=_poisson(p.finishing * apps * 0.22)))
        if p.futsal and RNG.random() < 0.6:
            stints.append(dict(season=season, club_names=f"{club.town} Futsal", competition_name=RNG.choice(FUTSAL_COMPS),
                               category="futsal", tier=None, appearances=RNG.randint(5, 18),
                               goals=_poisson(6 * p.finishing)))
    return stints


# ---------------------------------------------------------------------------
# persistence
# ---------------------------------------------------------------------------
def reset_demo(conn) -> None:
    conn.execute(text("SELECT set_config('app.workspace_id', :w, true)"), {"w": HOME_WORKSPACE})
    conn.execute(text("DELETE FROM scout_notes WHERE player_id IN (SELECT id FROM players WHERE mlsz_player_id LIKE 'demo-%')"))
    conn.execute(text("DELETE FROM matches WHERE mlsz_match_id LIKE 'demo-%'"))
    conn.execute(text("DELETE FROM players WHERE mlsz_player_id LIKE 'demo-%'"))
    conn.execute(text("DELETE FROM competitions WHERE mlsz_comp_id LIKE 'demo-%'"))
    conn.execute(text("DELETE FROM clubs WHERE mlsz_club_id LIKE 'demo-%'"))
    conn.execute(text("DELETE FROM sync_runs WHERE source = 'demo_seed'"))


def seed(reset: bool = False) -> dict:
    with db.engine().begin() as conn:
        if reset:
            reset_demo(conn)
        if conn.execute(text("SELECT 1 FROM players WHERE mlsz_player_id LIKE 'demo-%' LIMIT 1")).first():
            log.info("demo data already present (use --reset to regenerate)")
            return {"skipped": True}
        run_id = db.start_sync(conn, "demo_seed", "seed")

        clubs: list[DemoClub] = []
        comp_ids: dict[str, uuid.UUID] = {}
        league_meta = {}
        for key, name, short, tier, mult, fed, teams in LEAGUES:
            comp_ids[key] = db.upsert_competition(
                conn, mlsz_comp_id=f"demo-{key}", season=SEASON, name=name, short_name=short, tier=tier,
                strength_multiplier=mult, category="senior_11v11", federation=fed)
            league_meta[key] = (name, tier)
            for cname, town, strength in teams:
                lat, lng, county = GAZETTEER[town]
                # jitter Budapest clubs across districts so distances differ
                if town == "Budapest":
                    lat += RNG.uniform(-0.06, 0.06)
                    lng += RNG.uniform(-0.08, 0.08)
                cid = conn.execute(text("""
                    INSERT INTO clubs (mlsz_club_id, name, short_name, city, county, latitude, longitude)
                    VALUES (:m, :n, :s, :c, :co, :lat, :lng) RETURNING id
                """), dict(m=f"demo-{key}-{len(clubs)}", n=cname, s=cname.replace(" SE", "").replace(" FC", ""),
                           c=town, co=county, lat=lat, lng=lng)).scalar_one()
                club = DemoClub(cid, f"demo-{key}-{len(clubs)}", cname, town, strength, key)
                make_squad(club)
                clubs.append(club)

        # players
        player_rows = []
        for club in clubs:
            for p in club.squad:
                player_rows.append(dict(id=p.id, m=p.mlsz_id, n=p.name, by=p.birth_date.year, bd=p.birth_date.date(),
                                        acad=p.academy is not None, club=club.id))
        conn.execute(text("""
            INSERT INTO players (id, mlsz_player_id, full_name, birth_year, birth_date, has_academy_pedigree,
                                 current_club_id, profile_scraped_at)
            VALUES (:id, :m, :n, :by, :bd, :acad, :club, now())
        """), player_rows)

        # matches
        match_rows, app_rows = [], []
        for key, *_rest in LEAGUES:
            lclubs = [c for c in clubs if c.league_key == key]
            first_half = round_robin(len(lclubs))
            schedule = first_half + [[(a, h) for h, a in rnd] for rnd in first_half]
            for rnd_idx, pairs in enumerate(schedule[:CURRENT_ROUND], start=1):
                kickoff = SEASON_START + timedelta(weeks=rnd_idx - 1)
                for hi, ai in pairs:
                    h, a = lclubs[hi], lclubs[ai]
                    diff = h.strength - a.strength
                    hg = _poisson(max(0.25, 1.45 + 2.2 * diff))
                    ag = _poisson(max(0.25, 1.10 - 2.2 * diff))
                    mid = uuid.uuid4()
                    match_rows.append(dict(id=mid, m=f"demo-{key}-{rnd_idx}-{hi}-{ai}", comp=comp_ids[key], rnd=rnd_idx,
                                           dt=kickoff + timedelta(hours=RNG.choice([0, 0, 0, -1, 18])),
                                           h=h.id, a=a.id, hg=hg, ag=ag))
                    for club, gf in ((h, hg), (a, ag)):
                        xi, bench = pick_lineup(club)
                        for r in simulate_side(xi, bench, gf):
                            app_rows.append(dict(m=mid, p=r.player.id, c=club.id, n=r.player.shirt, s=r.is_starter,
                                                 mi=r.minute_in, mo=r.minute_out, mp=max(0, r.minute_out - r.minute_in),
                                                 g=r.goals, y=min(r.yellow, 1) if not r.red else r.yellow, r=r.red,
                                                 rp=r.replaced.id if r.replaced else None))
        conn.execute(text("""
            INSERT INTO matches (id, mlsz_match_id, competition_id, round_number, match_date, home_club_id, away_club_id,
                                 home_goals, away_goals, status, scraped_at)
            VALUES (:id, :m, :comp, :rnd, :dt, :h, :a, :hg, :ag, 'played', now())
        """), match_rows)
        conn.execute(text("""
            INSERT INTO match_appearances (match_id, player_id, club_id, shirt_number, is_starter, minute_in, minute_out,
                                           minutes_played, goals, yellow_cards, red_cards, replaced_player_id)
            VALUES (:m, :p, :c, :n, :s, :mi, :mo, :mp, :g, :y, :r, :rp)
        """), app_rows)

        # career history
        stint_rows = []
        for club in clubs:
            lname, tier = league_meta[club.league_key]
            for p in club.squad:
                for s in career_stints(p, club, lname, tier, clubs):
                    starts = int(s["appearances"] * RNG.uniform(0.4, 0.95))
                    stint_rows.append(dict(p=p.id, season=s["season"], clubs=s["club_names"], comp=s["competition_name"],
                                           cat=s["category"], tier=s["tier"], apps=s["appearances"], st=starts,
                                           sub=s["appearances"] - starts, g=s["goals"],
                                           y=_poisson(s["appearances"] * 0.12 * p.aggression)))
        conn.execute(text("""
            INSERT INTO player_career_stints (player_id, season, club_names, competition_name, category, tier,
                                              appearances, starts, sub_ins, goals, yellow_cards)
            VALUES (:p, :season, :clubs, :comp, :cat, :tier, :apps, :st, :sub, :g, :y)
            ON CONFLICT DO NOTHING
        """), stint_rows)
        conn.execute(text("""
            UPDATE players p SET highest_tier_played = s.t
            FROM (SELECT player_id, MIN(tier) AS t FROM player_career_stints
                  WHERE category = 'senior_11v11' AND appearances > 0 GROUP BY player_id) s
            WHERE s.player_id = p.id AND p.mlsz_player_id LIKE 'demo-%'
        """))
        db.finish_sync(conn, run_id, matches=len(match_rows), players=len(player_rows))

    summary = analytics.run()
    summary["position_accuracy"] = position_accuracy(clubs)

    with db.engine().begin() as conn:
        seed_notes(conn)
    return {"clubs": len(clubs), "players": len(player_rows), "matches": len(match_rows),
            "appearances": len(app_rows), "stints": len(stint_rows), **summary}


def position_accuracy(clubs: list[DemoClub]) -> float:
    """Share of demo players whose inferred primary position equals the generated one."""
    truth = {p.id: p.position for c in clubs for p in c.squad}
    with db.engine().connect() as conn:
        rows = conn.execute(text("SELECT id, primary_position FROM players WHERE mlsz_player_id LIKE 'demo-%' "
                                 "AND primary_position IS NOT NULL")).all()
    hits = sum(1 for r in rows if truth.get(r.id) == r.primary_position)
    acc = round(hits / len(rows), 3) if rows else 0.0
    log.info("position inference accuracy on demo data: %.1f%% (%d players)", acc * 100, len(rows))
    return acc


def seed_notes(conn) -> None:
    """A handful of realistic private notes for the pilot workspace."""
    conn.execute(text("SELECT set_config('app.workspace_id', :w, true)"), {"w": HOME_WORKSPACE})
    picks = conn.execute(text("""
        SELECT player_id, full_name, primary_position, club_name FROM mv_player_explorer
        WHERE club_name <> 'Lajosmizsei VLC' AND scouting_index IS NOT NULL
        ORDER BY scouting_index DESC LIMIT 14
    """)).all()
    templates = [
        ("shortlist", 5, "Nagyon jó helyezkedés, bal lábbal is veszélyes. Tavasszal kölcsönben elérhető lehet."),
        ("watching", 4, "Szombaton élőben megnézni — a második félidőben látványosan elfáradt."),
        ("contacted", 4, "Edzője szerint nyitott a váltásra, munkahelye Kecskeméten van."),
        ("radar", 3, "Statisztikailag erős, de videó kell még. Fiatalszabály miatt érdekes."),
        ("shortlist", 4, "Fizikálisan kész, NB III-ra is alkalmas. Bérigény tisztázandó."),
        ("rejected", 2, "Fegyelmezetlen, sok felesleges lap. Most nem."),
        ("watching", 3, "Veo-felvétel alapján jól váltja a játékot. Következő hazai meccsen nézzük."),
    ]
    authors = ["Kovács Gábor (vezetőedző)", "Szabó Péter (pályaedző)", "Tóth Ákos (scout)"]
    for i, row in enumerate(picks):
        status, rating, note = templates[i % len(templates)]
        conn.execute(text("""
            INSERT INTO scout_notes (club_workspace_id, player_id, author_name, status, rating, notes, video_url, updated_at)
            VALUES (:w, :p, :a, :s, :r, :n, :v, now() - make_interval(hours => :h))
            ON CONFLICT (club_workspace_id, player_id) DO NOTHING
        """), dict(w=HOME_WORKSPACE, p=row.player_id, a=authors[i % 3], s=status, r=rating, n=note,
                   v="https://app.veo.co/matches/demo-meccs/?t=754" if i % 3 == 0 else None, h=i * 7))


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed realistic demo data for the Lajosmizse pilot")
    ap.add_argument("--reset", action="store_true", help="delete existing demo-* rows first")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    db.run_migrations()
    print(seed(reset=args.reset))


if __name__ == "__main__":
    main()
