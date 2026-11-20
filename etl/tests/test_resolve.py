from config import V1_TARGETS
from resolve import match_targets

# league dropdowns as published on adatbank.mlsz.hu for 2025/2026 (abridged)
OPTIONS_2025 = {
    0: [("31362", "Fizz Liga"), ("31782", "NB III. Dél-Keleti csoport"), ("31365", "MOL Magyar Kupa"),
        ("31366", "Amatőr Kupa")],
    1: [("31503", "Vármegyei I."), ("31504", "Vármegyei II."), ("31506", "Vármegyei III. Dél"),
        ("31560", "Vármegyei Kupa")],
    5: [("31531", "BLSZ I. OSZTÁLY"), ("31532", "BLSZ II. OSZTÁLY"), ("31533", "BLSZ III. OSZTÁLY 1. CSOPORT")],
    11: [("31489", "Vármegyei I. felnőtt"), ("31490", "Vármegyei II. felnőtt")],
    14: [("31445", "I. osztályú felnőttbajnokság"), ("31815", "II. osztályú felnőttbajnokság, Északi csoport"),
         ("31816", "II. osztályú felnőttbajnokság, Déli csoport"),
         ("31818", "III. osztályú felnőttbajnokság, Északi csoport")],
}


def test_resolve_previous_season():
    resolved, unresolved = match_targets(V1_TARGETS, OPTIONS_2025, "2025/2026")
    assert unresolved == []
    by_league = {r.league_id: r for r in resolved}
    assert by_league[31782].target.key == "nb3_dk"
    assert by_league[31365].target.key == "mk"
    assert by_league[31503].target.key == "bk1"          # not "Vármegyei III. Dél"
    assert by_league[31445].target.key == "pest1"
    assert by_league[31815].target.key == "pest2e" and by_league[31816].target.key == "pest2d"
    assert by_league[31489].target.key == "jnsz1"
    assert by_league[31532].target.key == "blsz2"
    # BK II. was a single group that season: both targets collapse onto one league, scraped once
    merged = by_league[31504]
    assert merged.short_name == "BK Megye II"
    assert merged.name == "Bács-Kiskun Vármegyei II."
    assert len(resolved) == 10


def test_unresolved_reported():
    resolved, unresolved = match_targets(V1_TARGETS, {0: [], 1: OPTIONS_2025[1]}, "2025/2026")
    assert "nb3_dk" in unresolved and "bk1" not in unresolved


OPTIONS_2026 = {
    0: [("33586", "OTP Bank Liga"), ("34054", "NB III. Dél-Keleti csoport"), ("33589", "MOL Magyar Kupa")],
    1: [("33671", "Vármegyei I."), ("33672", "Vármegyei II. Dél"), ("33675", "Vármegyei II. Észak"),
        ("33674", "Vármegyei III. Dél")],
    5: [("33753", "BLSZ I. OSZTÁLY"), ("33754", "BLSZ II. OSZTÁLY")],
    11: [("33736", "Vármegyei I.osztály felnőtt"), ("33737", "Vármegyei II.osztály felnőtt")],
    14: [("33660", "I. osztályú felnőttbajnokság"), ("34067", "II. osztályú felnőttbajnokság, Északi csoport"),
         ("34068", "II. osztályú felnőttbajnokság, Déli csoport")],
}


def test_patterns_agree_with_verified_current_ids():
    resolved, unresolved = match_targets(V1_TARGETS, OPTIONS_2026, "2026/2027")
    assert unresolved == []
    assert {r.target.key: r.league_id for r in resolved} == {t.key: t.league_id for t in V1_TARGETS}
