from pathlib import Path

import pytest

from parser import (classify_competition_name, classify_event, is_top_academy, make_club_key, parse_match_report,
                    parse_player_profile, parse_round_page)

FIX = Path(__file__).parent / "fixtures"
MATCH_URL = "https://adatbank.mlsz.hu/match/67/0/33586/13/2186449.html"


@pytest.fixture(scope="module")
def report():
    return parse_match_report((FIX / "match_nb1_2186449.html").read_text(encoding="utf-8"), MATCH_URL)


def test_match_header(report):
    assert report.mlsz_match_id == "2186449"
    assert report.round_number == 13
    assert (report.home.name, report.away.name) == ("DVSC", "ÚJPEST FC")
    assert (report.home_goals, report.away_goals) == (3, 1)
    assert report.status == "played"
    assert report.match_date.isoformat() == "2026-11-08T15:30:00"
    assert report.venue == "Debreceni Nagyerdei Stadion"
    assert report.home.mlsz_club_id == "e11492-dvsc"


def test_lineups_and_minutes(report):
    home = {p.full_name: p for p in report.home_players}
    assert sum(p.is_starter for p in report.home_players) == 11
    assert sum(p.is_starter for p in report.away_players) == 11
    # starter subbed off at 74'
    assert home["DZSUDZSÁK BALÁZS"].minute_out == 74
    # his replacement came on at 74' and scored at 86'
    cibla = home["CIBLA FLÓRIÁN"]
    assert (cibla.is_starter, cibla.minute_in, cibla.minute_out, cibla.goals) == (False, 74, 90, 1)
    assert cibla.goal_minutes == [86]
    assert home["SZENDREI ÁKOS"].goals == 1
    assert home["BOSKOVIC BLAZ"].yellow_cards == 1
    assert home["ANDREEV PLAMEN PLAMENOV"].shirt_number == 1
    # 11 players x 90 minutes per side
    assert sum(p.minutes_played for p in report.home_players) == 990
    assert sum(p.minutes_played for p in report.away_players) == 990


def test_goals_match_score(report):
    assert sum(p.goals for p in report.home_players) == report.home_goals
    assert sum(p.goals for p in report.away_players) == report.away_goals


def test_unused_subs_are_skipped(report):
    names = {p.full_name for p in report.home_players}
    assert "ERDÉLYI BENEDEK MIKLÓS" not in names


def test_round_page():
    fx = parse_round_page((FIX / "league_nb1_r13.html").read_text(encoding="utf-8"))
    assert len(fx) == 6
    assert {f.mlsz_match_id for f in fx} >= {"2186449", "2186452"}
    assert all(f.has_result and f.round_number == 13 for f in fx)


def test_player_profile():
    p = parse_player_profile((FIX / "player_511889.html").read_text(encoding="utf-8"), "511889")
    assert p.full_name == "DÉNES CSANÁD VILMOS"
    assert p.birth_date.isoformat() == "2004-11-17"
    assert p.current_club_name == "DVSC"
    first = p.stints[0]
    assert (first.season, first.competition_name, first.appearances, first.goals) == ("2026/2027", "OTP Bank Liga", 12, 3)
    assert first.mlsz_league_id == "33586"
    cats = {classify_competition_name(s.competition_name)[0] for s in p.stints}
    assert {"senior_11v11", "youth", "futsal", "cup"} <= cats


@pytest.mark.parametrize("name,expected", [
    ("NB III. Dél-Keleti csoport", ("senior_11v11", 3)),
    ("Merkantil Bank Liga NB II.", ("senior_11v11", 2)),
    ("Vármegyei I.", ("senior_11v11", 4)),
    ("BLSZ II. OSZTÁLY", ("senior_11v11", 5)),
    ("III. osztályú felnőttbajnokság, Déli csoport", ("senior_11v11", 6)),
    ("MLSZ Országos U19 Kiemelt csoport", ("youth", None)),
    ("Férfi Futsal NB II. Keleti csoport", ("futsal", None)),
    ("MOL Magyar Kupa", ("cup", None)),
])
def test_classify_competition(name, expected):
    assert classify_competition_name(name) == expected


def test_event_icons():
    assert classify_event("swap") == "swap"
    assert classify_event("goal") == "goal"
    assert classify_event("owngoal") == "own_goal"
    assert classify_event("yellowcard") == "yellow"
    assert classify_event("redcard") == "red"
    assert classify_event("yellowredcard") == "second_yellow"


def test_club_key_and_academy():
    assert make_club_key("Lajosmizsei VLC", None, "123") == "t123"
    assert make_club_key("KTE II.", "https://x/EgyesuletLogo/Logo/4/999.png", "5").startswith("e999-kte-ii")
    assert is_top_academy("Puskás Akadémia FC", "MLSZ Regionális U17")
    assert not is_top_academy("Ballószög KSE", "Vármegyei U19")


def test_non_competitive_and_academy_markers():
    assert classify_competition_name("Edzőmérkőzések")[0] == "other"
    assert classify_competition_name("DLSZ KK-Grain I. osztály")[0] == "other"
    assert is_top_academy("BUDAPEST HONVÉD-MFA II.", "MLSZ regionális U19 alap")
    assert not is_top_academy("CSETÉNY SE", "MLSZ Országos U19 Alap Csoport")


def test_substitution_partners(report):
    by_id = {p.mlsz_player_id: p for p in report.home_players}
    cibla = next(p for p in report.home_players if p.full_name == "CIBLA FLÓRIÁN")
    assert cibla.partner_mlsz_player_id == "12126"           # came on for Dzsudzsák
    assert by_id["12126"].partner_mlsz_player_id == cibla.mlsz_player_id
