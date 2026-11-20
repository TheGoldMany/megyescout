"""HTML parsers for adatbank.mlsz.hu pages.

Supported pages:
  * match report ("jegyzőkönyv"):  /match/<season>/<fed>/<league>/<round>/<match_id>.html
  * round fixture list:            /league/<season>/<fed>/<league>/<round>.html
  * player profile:                /player/<player_id>.html

The parsers are pure functions (HTML string in, pydantic model out) so they can be
unit-tested against saved fixtures in tests/fixtures/.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime

from bs4 import BeautifulSoup, Tag

from models import CareerStint, FixtureLink, MatchReport, PlayerAppearance, PlayerProfile, TeamRef

MATCH_URL_RE = re.compile(r"/match/(\d+)/(\d+)/(\d+)/(\d+)/(\d+)\.html")
MATCH_ITEM_RE = re.compile(r"match\?itemId=(\d+)")
PLAYER_URL_RE = re.compile(r"/player/(\d+)\.html|player\?itemId=(\d+)")
CLUB_URL_RE = re.compile(r"/club/\d+/\d+/\d+/\d+/(\d+)\.html")
LOGO_ID_RE = re.compile(r"/EgyesuletLogo/Logo/\d+/(\d+)\.\w+")
EVENT_ICON_RE = re.compile(r"event_([a-z_]+)\.png")
MINUTE_RE = re.compile(r"(\d{1,3})(?:\s*\+\s*(\d{1,2}))?")
SCORE_RE = re.compile(r"(\d+)\s*-\s*(\d+)")

REGULATION_MINUTES = 90


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _clean(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _player_id(href: str | None) -> str | None:
    if not href:
        return None
    m = PLAYER_URL_RE.search(href)
    if not m:
        return None
    return m.group(1) or m.group(2)


def _minute(text: str) -> int | None:
    """'39'' -> 39, '90+3'' -> 90 (stoppage time folds into regulation)."""
    m = MINUTE_RE.search(text.replace("&apos;", "'"))
    if not m:
        return None
    return min(int(m.group(1)), REGULATION_MINUTES)


def _bg_logo(tag: Tag | None) -> str | None:
    if tag is None:
        return None
    style = tag.get("style", "")
    m = re.search(r"url\(([^)]+)\)", style)
    return m.group(1).strip("'\"") if m else None


def make_club_key(name: str, logo_url: str | None, team_id: str | None) -> str:
    """Stable club identity across seasons.

    The MLSZ /club/ link id is season-specific, but the association ("egyesület")
    logo id is stable. Reserve teams share the logo, so the slugged name is appended.
    """
    logo_id = None
    if logo_url:
        m = LOGO_ID_RE.search(logo_url)
        logo_id = m.group(1) if m else None
    if logo_id:
        return f"e{logo_id}-{slugify(name)}"[:32]
    if team_id:
        return f"t{team_id}"
    return f"n-{slugify(name)}"[:32]


def classify_event(icon: str) -> str | None:
    """Map an MLSZ timeline icon name to our event type."""
    icon = icon.lower()
    if "swap" in icon or "csere" in icon:
        return "swap"
    if "own" in icon:
        return "own_goal"
    if "miss" in icon:
        return None
    if "yellow" in icon and ("red" in icon or "second" in icon or "2" in icon):
        return "second_yellow"
    if "red" in icon:
        return "red"
    if "yellow" in icon:
        return "yellow"
    if "goal" in icon or "penalty" in icon or "penal" in icon:
        return "goal"
    return None


def _row_events(row: Tag) -> list[tuple[str, int | None]]:
    cell = row.find("td", class_="match_players_cards")
    events: list[tuple[str, int | None]] = []
    if not cell:
        return events
    for span in cell.find_all("span"):
        m = EVENT_ICON_RE.search(span.get("style", ""))
        if not m:
            continue
        kind = classify_event(m.group(1))
        if kind:
            events.append((kind, _minute(span.get_text())))
    return events


def _parse_player_row(row: Tag, is_starter: bool) -> PlayerAppearance | None:
    num_cell = row.find("td", class_="match_players_num")
    name_cell = row.find("td", class_="match_players_name")
    if not name_cell:
        return None
    main_link = None
    for a in name_cell.find_all("a"):
        if "match_players_changeup" not in (a.get("class") or []):
            main_link = a
            break
    if main_link is None:
        return None
    pid = _player_id(main_link.get("href"))
    if not pid:
        return None
    name = _clean(main_link.get("title") or main_link.get_text())

    shirt = None
    if num_cell:
        first_num = num_cell.find("span", class_="playerNum")
        if first_num and first_num.get_text(strip=True).isdigit():
            shirt = int(first_num.get_text(strip=True))

    events = _row_events(row)
    swaps = sorted(m for k, m in events if k == "swap" and m is not None)
    app = PlayerAppearance(mlsz_player_id=pid, full_name=name, shirt_number=shirt, is_starter=is_starter)

    if is_starter:
        app.minute_in = 0
        app.minute_out = swaps[0] if swaps else REGULATION_MINUTES
    else:
        if not swaps:
            return None  # unused substitute
        app.minute_in = swaps[0]
        app.minute_out = swaps[1] if len(swaps) > 1 else REGULATION_MINUTES

    for kind, minute in events:
        if kind == "goal":
            app.goals += 1
            if minute is not None:
                app.goal_minutes.append(minute)
        elif kind == "own_goal":
            app.own_goals += 1
        elif kind == "yellow":
            app.yellow_cards += 1
        elif kind == "second_yellow":
            app.yellow_cards += 1
            app.red_cards += 1
            if minute is not None:
                app.minute_out = min(app.minute_out, minute)
        elif kind == "red":
            app.red_cards += 1
            if minute is not None:
                app.minute_out = min(app.minute_out, minute)
    app.minute_out = max(app.minute_out, app.minute_in)
    return app


def _parse_team_block(block: Tag) -> tuple[TeamRef, list[PlayerAppearance]]:
    info = block.find("div", class_="team_info")
    link = info.find("a") if info else None
    name = _clean(info.find("h2").get_text()) if info and info.find("h2") else "Ismeretlen"
    team_id = None
    if link and link.get("href"):
        m = CLUB_URL_RE.search(link["href"])
        team_id = m.group(1) if m else None
    logo = _bg_logo(info.find("span")) if info else None
    team = TeamRef(mlsz_club_id=make_club_key(name, logo, team_id), name=name, team_id=team_id, logo_url=logo)

    players: list[PlayerAppearance] = []
    content = block.find("div", class_="content")
    if not content:
        return team, players
    for table in content.find_all("table", recursive=False):
        classes = table.get("class") or []
        if "coach" in classes or "crew" in classes:
            continue
        is_starter = "replacement" not in classes
        for row in table.find_all("tr", class_="template-tr-selectable"):
            app = _parse_player_row(row, is_starter)
            if app:
                players.append(app)
    return team, players


# ---------------------------------------------------------------------------
# public parsers
# ---------------------------------------------------------------------------
def parse_match_report(html: str, url: str | None = None) -> MatchReport:
    soup = BeautifulSoup(html, "html.parser")

    season_id = fed_id = league_id = None
    round_number: int | None = None
    match_id: str | None = None
    if url:
        m = MATCH_URL_RE.search(url)
        if m:
            season_id, fed_id, league_id, rnd, match_id = m.groups()
            round_number = int(rnd)
        else:
            m2 = MATCH_ITEM_RE.search(url)
            match_id = m2.group(1) if m2 else None
    if match_id is None:
        # self-link in the team form strip / schedule: first /match/ link whose title has the score
        canon = soup.find("link", rel="canonical")
        if canon and MATCH_URL_RE.search(canon.get("href", "")):
            season_id, fed_id, league_id, rnd, match_id = MATCH_URL_RE.search(canon["href"]).groups()
            round_number = int(rnd)
    if round_number is None:
        h = soup.find(id="headerText")
        if h:
            m = re.search(r"(\d+)\.\s*forduló", h.get_text())
            round_number = int(m.group(1)) if m else None

    left = soup.find(id="left_team")
    right = soup.find(id="right_team")
    if left is None or right is None:
        raise ValueError("match report has no team blocks (not a jegyzőkönyv page?)")
    home, home_players = _parse_team_block(left)
    away, away_players = _parse_team_block(right)

    home_goals = away_goals = None
    res = soup.find("div", class_="match-result")
    if res and res.find("span"):
        sm = SCORE_RE.search(res.find("span").get_text())
        if sm:
            home_goals, away_goals = int(sm.group(1)), int(sm.group(2))

    match_date = None
    d = soup.find("p", class_="match_data_date")
    if d:
        dm = re.search(r"(\d{4})\.(\d{2})\.(\d{2})\.?\s*-?\s*(\d{1,2}):(\d{2})?", d.get_text())
        if dm:
            y, mo, da, hh, mi = dm.groups()
            match_date = datetime(int(y), int(mo), int(da), int(hh), int(mi or 0))
    venue = None
    hv = soup.find("input", id="hiddenLocation")
    if hv and hv.get("value"):
        venue = _clean(hv["value"])

    return MatchReport(
        mlsz_match_id=match_id or "unknown",
        season_id=season_id,
        federation_id=fed_id,
        league_id=league_id,
        round_number=round_number,
        match_date=match_date,
        venue=venue,
        home=home,
        away=away,
        home_goals=home_goals,
        away_goals=away_goals,
        home_players=home_players,
        away_players=away_players,
    )


def parse_round_page(html: str) -> list[FixtureLink]:
    """Extract the fixtures of the selected round from a /league/... page."""
    soup = BeautifulSoup(html, "html.parser")
    panel = soup.find(id="match_panel") or soup
    fixtures: list[FixtureLink] = []
    seen: set[str] = set()
    for sched in panel.find_all("div", class_="schedule"):
        link = None
        rc = sched.find("div", class_="result-cont")
        if rc:
            link = rc.find("a", href=MATCH_URL_RE)
        if link is None:
            continue
        m = MATCH_URL_RE.search(link["href"])
        match_id = m.group(5)
        if match_id in seen:
            continue
        seen.add(match_id)
        score_text = _clean(rc.get_text())
        home = sched.find("div", class_="home_team")
        away = sched.find("div", class_="away_team")
        kickoff = None
        dt = sched.find("div", class_="team_sorsolas_date")
        if dt:
            dm = re.search(r"(\d{4})\.\s*(\d{2})\.\s*(\d{2})\.?\s*(\d{1,2}):(\d{2})", _clean(dt.get_text()))
            if dm:
                kickoff = datetime(*map(int, dm.groups()))
        fixtures.append(
            FixtureLink(
                mlsz_match_id=match_id,
                url=link["href"],
                round_number=int(m.group(4)),
                home_name=_clean(home.get_text()) if home else None,
                away_name=_clean(away.get_text()) if away else None,
                kickoff=kickoff,
                has_result=bool(SCORE_RE.search(score_text)),
            )
        )
    return fixtures


def parse_round_count(html: str) -> int:
    soup = BeautifulSoup(html, "html.parser")
    sel = soup.find("select", id="turns")
    if not sel:
        return 0
    values = [int(o["value"]) for o in sel.find_all("option") if str(o.get("value", "")).isdigit()]
    return max(values) if values else 0


def parse_selected_round(html: str) -> int | None:
    soup = BeautifulSoup(html, "html.parser")
    sel = soup.find("select", id="turns")
    if not sel:
        return None
    opt = sel.find("option", selected=True)
    return int(opt["value"]) if opt and str(opt.get("value", "")).isdigit() else None


def parse_league_options(html: str) -> list[tuple[str, str]]:
    """(league_id, name) pairs from the league dropdown — used by `cli discover`."""
    soup = BeautifulSoup(html, "html.parser")
    sel = soup.find("select", id="leagues")
    if not sel:
        return []
    return [(o["value"], _clean(o.get_text())) for o in sel.find_all("option") if o.get("value", "-1") != "-1"]


def parse_player_profile(html: str, mlsz_player_id: str) -> PlayerProfile:
    soup = BeautifulSoup(html, "html.parser")
    fields: dict[str, Tag] = {}
    for tr in soup.find_all("tr", class_="detail"):
        k = tr.find("td", class_="dataname")
        v = tr.find("td", class_="datas")
        if k and v:
            fields[_clean(k.get_text())] = v

    name = _clean(fields["Név"].get_text()) if "Név" in fields else ""
    birth = None
    if "Születési idő" in fields:
        bm = re.search(r"(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})", fields["Születési idő"].get_text())
        if bm:
            birth = date(*map(int, bm.groups()))
    club = _clean(fields["Aktuális Klub"].get_text()) if "Aktuális Klub" in fields else None
    if club:
        club = re.sub(r"\s*\(Labdarúgás\)|\s*\(Futsal\)", "", club)

    stints: list[CareerStint] = []
    for table in soup.find_all("table", class_="player_szezon"):
        header = table.find("div", class_="all_matches_table_season")
        if not header:
            continue
        head = _clean(header.get_text())
        season, _, clubs = head.partition(" - ")
        tbody = table.find("tbody")
        if not tbody:
            continue
        for tr in tbody.find_all("tr", class_="hideLeague"):
            tds = tr.find_all("td")
            if len(tds) < 9:
                continue
            comp = tds[0]
            if comp.find("b"):
                comp.find("b").decompose()
            nums = []
            for td in tds[1:9]:
                t = td.get_text(strip=True)
                nums.append(int(t) if t.isdigit() else 0)
            league_id = None
            onclick = tds[-1].get("onclick", "") if len(tds) >= 10 else ""
            lm = re.search(r",\s*(\d+)\);?\s*$", onclick)
            if lm:
                league_id = lm.group(1)
            stints.append(
                CareerStint(
                    season=season.strip(),
                    club_names=clubs.strip(),
                    competition_name=_clean(comp.get_text()),
                    mlsz_league_id=league_id,
                    appearances=nums[0],
                    starts=nums[1],
                    sub_ins=nums[2],
                    bench=nums[3],
                    goals=nums[4],
                    own_goals=nums[5],
                    yellow_cards=nums[6],
                    red_cards=nums[7],
                )
            )
    return PlayerProfile(mlsz_player_id=mlsz_player_id, full_name=name, birth_date=birth,
                         current_club_name=club, stints=stints)


# ---------------------------------------------------------------------------
# competition-name classification (used for career stints from profiles)
# ---------------------------------------------------------------------------
def classify_competition_name(name: str) -> tuple[str, int | None]:
    """Return (category, tier) guessed from a free-text MLSZ competition name."""
    n = name.lower()
    if any(k in n for k in NON_COMPETITIVE_MARKERS):
        return "other", None
    if "futsal" in n:
        return "futsal", None
    if re.search(r"\bu[- ]?\d{1,2}\b|utánpótlás|ifjúsági|serdülő|leány", n):
        return "youth", None
    if "öregfiú" in n or "old boys" in n:
        return "oldboys", None
    if "kupa" in n:
        return "cup", None
    if "nb iii" in n:
        return "senior_11v11", 3
    if "merkantil" in n or "nb ii" in n:
        return "senior_11v11", 2
    if "otp bank liga" in n or "fizz liga" in n or re.search(r"\bnb i\b", n):
        return "senior_11v11", 1
    m = re.search(r"\b(iv|iii|ii|i)\.\s*(?:osztály|oszt)", n) or re.search(
        r"(?:vármegyei|megyei|megye|blsz)\s+(iv|iii|ii|i)\b", n
    )
    if m:
        return "senior_11v11", {"i": 4, "ii": 5, "iii": 6, "iv": 7}[m.group(1)]
    return "senior_11v11", None


# Friendlies, winter indoor cups, regional amateur-select tournaments, hobby leagues: tracked but never rated.
NON_COMPETITIVE_MARKERS = (
    "edzőmérkőzés", "korlátozott adat", "téli", "teremtorna", "amatőrválogatott", "dlsz", "torna",
    "strandfoci", "kispályás", "osztályozó",
)

TOP_ACADEMY_MARKERS = (
    "fehérvár", "videoton", "puskás", "felcsút", "ferencváros", "ftc", "mtk", "honvéd", "mfa", "illés",
    "dvsc", "debreceni vsc", "győri eto", "eto fc", "újpest", "paksi fc", "kecskeméti te", "kte", "zte",
    "budafoki mte", "vasas", "kubala", "haladás", "diósgyőr", "dvtk", "várda", "nyíregyháza spartacus",
    "szeged-csanád", "grosics", "mezőkövesd", "kisvárda",
)
_ACADEMY_RE = re.compile(r"(?<![a-zá-ű])(" + "|".join(re.escape(m) for m in TOP_ACADEMY_MARKERS) + r")(?![a-zá-ű])")


def is_top_academy(club_names: str, competition_name: str) -> bool:
    """Youth record in an elite competition (Kiemelt / "A" group) or at a known NB I/NB II academy."""
    comp = competition_name.lower()
    if "kiemelt" in comp or '"a" csoport' in comp:
        return True
    return bool(_ACADEMY_RE.search(club_names.lower()))
