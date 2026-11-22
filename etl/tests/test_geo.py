

def test_full_settlement_list_adjective_forms():
    from geo import resolve_town
    assert resolve_town("Gödi SE") == "Göd"
    assert resolve_town("Halásztelki FC") == "Halásztelek"  # vowel drop
    assert resolve_town("Opus Tigáz Tatabánya") == "Tatabánya"  # longest name wins over Tata
    assert resolve_town("Tatai AC") == "Tata"
    assert resolve_town("Bacsó Beton-Cigánd SE") == "Cigánd"  # hyphen part
    assert resolve_town("Nyárlőrinci LSC") == "Nyárlőrinc"  # not Lőrinci


def test_budapest_and_club_aliases():
    from geo import resolve_town
    for name in ("III. Ker. TVE", "Esmtk", "XV. Kerületi Issimo SE", "Pestszentimrei SK", "Kelen SC II."):
        assert resolve_town(name) == "Budapest", name
    assert resolve_town("Tiszaszentimre SE") == "Tiszaszentimre"
    assert resolve_town("ETO FC") == "Győr"
    assert resolve_town("Dvtk") == "Miskolc"


def test_no_false_town_inside_words():
    from geo import resolve_town
    assert resolve_town("Griff & Bulls SE") is None
    assert resolve_town("FC Főnix") is None
