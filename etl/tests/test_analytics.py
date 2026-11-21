import numpy as np

from analytics import (age_curve_score, assign_archetypes, cosine_top_n, infer_position, scouting_index,
                       team_impact_score, youth_rule_window)
from geo import haversine_km, resolve_town


def test_youth_rule_window():
    assert youth_rule_window("2026/2027") == (2006, 2008)


def test_age_curve_peaks_18_22():
    assert age_curve_score(19) == 100
    assert age_curve_score(22) > age_curve_score(27) > age_curve_score(33)


def test_position_from_shirts():
    assert infer_position([(1, 900)], 0.0, 0.0)[0] == "GK"
    assert infer_position([(4, 900), (3, 90)], 0.0, 0.0)[0] == "DEF"
    assert infer_position([(9, 800)], 0.7, 0.1)[0] == "FWD"
    # a "defender" number with striker output gets pushed forward
    p, s, _ = infer_position([(5, 900)], 0.8, 0.0)
    assert p == "FWD" or s == "FWD"


def test_scouting_index_bounds():
    assert 0 <= scouting_index(0, 0, 0, 0) <= scouting_index(100, 100, 100, 100) == 100


def test_team_impact():
    assert team_impact_score(None) == 50
    assert team_impact_score(0.5) == 70
    assert team_impact_score(5) == 100


def test_archetypes():
    row = dict(matches_played=12, starts=12, sub_ins=0, minutes_share_pct=95, goals=8, goals_per_90=0.7,
               team_goal_share=0.4, yellows_per_90=0.1, clean_sheets=0, sub_goals=0, sub_goals_per_90=0,
               total_minutes=1050, primary_position="FWD", birth_year=2007)
    tags = assign_archetypes(row, "2026/2027")
    assert {"Motor", "Gólfelelős", "Fiatalszabály-opció"} <= set(tags)


def test_cosine_top_n_groups_and_order():
    ids = ["a", "b", "c", "d"]
    vecs = np.array([[90, 10, 50, 50, 40, 30], [88, 12, 52, 49, 41, 29], [10, 90, 50, 50, 40, 30], [50, 50, 50, 50, 40, 30]])
    res = cosine_top_n(ids, vecs, ["X", "X", "X", "Y"], n=2)
    a_neighbours = [r for r in res if r[0] == "a"]
    assert a_neighbours[0][1] == "b"
    assert all(r[1] != "d" for r in res if r[0] != "d")  # different group never matched


def test_geo():
    assert resolve_town("Lajosmizsei VLC") == "Lajosmizse"
    assert resolve_town("Kiskunfélegyházi HTK") == "Kiskunfélegyháza"
    assert resolve_town("KECSKEMÉTI TE II.") == "Kecskemét"
    assert resolve_town("SC HÍRÖS-ÉP EGYESÜLET") == "Kecskemét"
    assert 15 < haversine_km(47.0264, 19.5542, 46.9062, 19.6913) < 19


def test_substitution_direction_moves_unknown_numbers():
    # shirt 17 carries no information; goal output alone says "defender-ish"
    base = infer_position([(17, 400)], 0.0, 0.8)
    assert base[0] == "DEF"
    # but he always replaces (or is replaced by) confident midfielders
    with_pairs = infer_position([(17, 400)], 0.0, 0.8, sub_partners=[("MID", 0.9)] * 6)
    assert with_pairs[0] == "MID"


def test_substitution_direction_does_not_override_strong_shirt_evidence():
    p, _, _ = infer_position([(4, 1800)], 0.0, 0.0, sub_partners=[("FWD", 0.9)])
    assert p == "DEF"


def test_time_left_helper():
    import time
    from scraper import time_left
    assert time_left(None) == float("inf")
    assert 9 < time_left(time.monotonic() + 10) <= 10


def test_market_values_scale_with_tier_index_and_age():
    from market import career_value_huf, market_value_huf, round_value
    assert round_value(1_234_567) == 1_200_000 and round_value(512_345) == 500_000
    megye1_avg = market_value_huf(4, 55, 1500, 24)
    assert 1_500_000 <= megye1_avg <= 2_000_000
    assert market_value_huf(3, 55, 1500, 24) > megye1_avg > market_value_huf(5, 55, 1500, 24)
    assert market_value_huf(4, 75, 1500, 20) > megye1_avg
    assert market_value_huf(4, 55, 100, 24) < megye1_avg          # small sample
    assert market_value_huf(4, 55, 1500, 34) < megye1_avg          # veteran
    assert career_value_huf(4, 25, 21) > career_value_huf(4, 5, 31)


def test_first_club_skips_futsal_teams():
    from market import _first_club
    assert _first_club("DIRNER-SILAND FUTSAL CLUB, TISZAKÉCSKEI LC II.") == "TISZAKÉCSKEI LC II."
    assert _first_club("KECSKEMÉTI TE II., TISZAKÉCSKEI LC") == "KECSKEMÉTI TE II."


def test_first_club_prefers_first_team_in_high_tiers():
    from market import _first_club
    assert _first_club("VASAS FC II., KOLORCITY KAZINCBARCIKA SC", tier=1) == "KOLORCITY KAZINCBARCIKA SC"
    assert _first_club("VASAS FC II., KOLORCITY KAZINCBARCIKA SC", tier=5) == "VASAS FC II."
