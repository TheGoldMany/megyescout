"""Club geolocation: map a club name to a town.

MLSZ pages carry no coordinates, so clubs are resolved in three steps:
1. ALIASES: abbreviations and Budapest district/club names that hide the town (ETO, ZTE, Esmtk, "III. Ker.").
2. GAZETTEER: hand-checked towns of the pilot region (loose stem match, as before).
3. data/hu_settlements.csv: every Hungarian settlement (3177, KSH code + coordinates from Wikidata, CC0),
   matched strictly as a whole word or its adjective form (Göd -> "Gödi", Halásztelek -> "Halásztelki").
Matching is accent-insensitive and prefers the longest name ("Tatabánya" before "Tata").
"""
from __future__ import annotations

import csv
import math
import os
import re
import unicodedata

# town -> (lat, lng, county)
GAZETTEER: dict[str, tuple[float, float, str]] = {
    # Bács-Kiskun
    "Lajosmizse": (47.0264, 19.5542, "Bács-Kiskun"),
    "Kecskemét": (46.9062, 19.6913, "Bács-Kiskun"),
    "Kiskunfélegyháza": (46.7120, 19.8500, "Bács-Kiskun"),
    "Nagykőrös": (47.0340, 19.7787, "Pest"),
    "Tiszakécske": (46.9311, 20.0956, "Bács-Kiskun"),
    "Kerekegyháza": (46.9372, 19.4781, "Bács-Kiskun"),
    "Ballószög": (46.8620, 19.5700, "Bács-Kiskun"),
    "Helvécia": (46.8364, 19.6197, "Bács-Kiskun"),
    "Hetényegyháza": (46.9300, 19.6100, "Bács-Kiskun"),
    "Kunszentmiklós": (47.0264, 19.1256, "Bács-Kiskun"),
    "Izsák": (46.8019, 19.3542, "Bács-Kiskun"),
    "Kiskőrös": (46.6214, 19.2853, "Bács-Kiskun"),
    "Kiskunhalas": (46.4344, 19.4847, "Bács-Kiskun"),
    "Kiskunmajsa": (46.4903, 19.7369, "Bács-Kiskun"),
    "Kalocsa": (46.5264, 18.9853, "Bács-Kiskun"),
    "Solt": (46.8017, 19.0011, "Bács-Kiskun"),
    "Dunavecse": (46.9147, 18.9739, "Bács-Kiskun"),
    "Szabadszállás": (46.8753, 19.2242, "Bács-Kiskun"),
    "Fülöpszállás": (46.8203, 19.2397, "Bács-Kiskun"),
    "Lakitelek": (46.8761, 19.9947, "Bács-Kiskun"),
    "Tiszaalpár": (46.8122, 19.9897, "Bács-Kiskun"),
    "Városföld": (46.8167, 19.7564, "Bács-Kiskun"),
    "Jakabszállás": (46.7611, 19.6056, "Bács-Kiskun"),
    "Orgovány": (46.7500, 19.4700, "Bács-Kiskun"),
    "Soltvadkert": (46.5789, 19.3936, "Bács-Kiskun"),
    "Bácsalmás": (46.1253, 19.3328, "Bács-Kiskun"),
    "Baja": (46.1803, 18.9539, "Bács-Kiskun"),
    "Jánoshalma": (46.2986, 19.3256, "Bács-Kiskun"),
    "Szank": (46.5561, 19.6614, "Bács-Kiskun"),
    "Kunfehértó": (46.3622, 19.4136, "Bács-Kiskun"),
    "Akasztó": (46.6914, 19.2042, "Bács-Kiskun"),
    "Hajós": (46.4003, 19.1197, "Bács-Kiskun"),
    "Harta": (46.6983, 19.0336, "Bács-Kiskun"),
    "Tázlár": (46.5472, 19.5144, "Bács-Kiskun"),
    "Kunbaja": (46.0844, 19.4231, "Bács-Kiskun"),
    "Bugac": (46.6869, 19.6814, "Bács-Kiskun"),
    "Fülöpháza": (46.8775, 19.4353, "Bács-Kiskun"),
    "Ágasegyháza": (46.8394, 19.4519, "Bács-Kiskun"),
    "Kunadacs": (46.9561, 19.2864, "Bács-Kiskun"),
    "Ladánybene": (47.0347, 19.4567, "Bács-Kiskun"),
    "Kunszállás": (46.7611, 19.7531, "Bács-Kiskun"),
    "Felsőlajos": (47.0644, 19.4936, "Bács-Kiskun"),
    "Tiszaug": (46.8564, 20.0533, "Bács-Kiskun"),
    "Kecel": (46.5256, 19.2519, "Bács-Kiskun"),
    "Császártöltés": (46.4219, 19.1836, "Bács-Kiskun"),
    "Tompa": (46.2061, 19.5392, "Bács-Kiskun"),
    "Mélykút": (46.2153, 19.3814, "Bács-Kiskun"),
    "Hercegszántó": (45.9500, 18.9389, "Bács-Kiskun"),
    "Dusnok": (46.3906, 18.9603, "Bács-Kiskun"),
    "Bátya": (46.4878, 18.9539, "Bács-Kiskun"),
    "Csengőd": (46.7142, 19.2639, "Bács-Kiskun"),
    "Kaskantyú": (46.6750, 19.3889, "Bács-Kiskun"),
    "Imrehegy": (46.4875, 19.3083, "Bács-Kiskun"),
    "Csólyospálos": (46.4167, 19.8417, "Bács-Kiskun"),
    "Kiskunlacháza": (47.1883, 19.0072, "Pest"),
    # Pest
    "Budapest": (47.4979, 19.0402, "Budapest"),
    "Cegléd": (47.1720, 19.7990, "Pest"),
    "Dabas": (47.1856, 19.3108, "Pest"),
    "Monor": (47.3500, 19.4500, "Pest"),
    "Dunaharaszti": (47.3542, 19.0844, "Pest"),
    "Örkény": (47.1300, 19.4333, "Pest"),
    "Táborfalva": (47.1031, 19.4769, "Pest"),
    "Inárcs": (47.2625, 19.3283, "Pest"),
    "Ócsa": (47.2994, 19.2297, "Pest"),
    "Gyál": (47.3842, 19.2214, "Pest"),
    "Vecsés": (47.4058, 19.2650, "Pest"),
    "Üllő": (47.3878, 19.3439, "Pest"),
    "Pilis": (47.2894, 19.5481, "Pest"),
    "Albertirsa": (47.2408, 19.6058, "Pest"),
    "Abony": (47.1897, 20.0097, "Pest"),
    "Nagykáta": (47.4150, 19.7442, "Pest"),
    "Tápiószele": (47.3361, 19.8778, "Pest"),
    "Tápiószecső": (47.4519, 19.6061, "Pest"),
    "Tápióbicske": (47.3611, 19.6864, "Pest"),
    "Szigetszentmiklós": (47.3436, 19.0472, "Pest"),
    "Ráckeve": (47.1611, 18.9450, "Pest"),
    "Szigethalom": (47.3225, 19.0019, "Pest"),
    "Taksony": (47.3292, 19.0675, "Pest"),
    "Dunavarsány": (47.2786, 19.0661, "Pest"),
    "Délegyháza": (47.2464, 19.0911, "Pest"),
    "Kakucs": (47.2414, 19.3647, "Pest"),
    "Hernád": (47.1633, 19.4339, "Pest"),
    "Újhartyán": (47.2186, 19.3858, "Pest"),
    "Gomba": (47.3714, 19.5311, "Pest"),
    "Maglód": (47.4436, 19.3533, "Pest"),
    "Gyömrő": (47.4256, 19.3992, "Pest"),
    "Pécel": (47.4894, 19.3417, "Pest"),
    "Sülysáp": (47.4528, 19.5339, "Pest"),
    "Mende": (47.4311, 19.4569, "Pest"),
    "Isaszeg": (47.5300, 19.4019, "Pest"),
    "Gödöllő": (47.5961, 19.3550, "Pest"),
    "Érd": (47.3919, 18.9046, "Pest"),
    "Budaörs": (47.4621, 18.9580, "Pest"),
    "Törökbálint": (47.4294, 18.9136, "Pest"),
    "Diósd": (47.4097, 18.9489, "Pest"),
    "Halásztelek": (47.3619, 18.9811, "Pest"),
    "Tököl": (47.3217, 18.9614, "Pest"),
    "Szentendre": (47.6694, 19.0756, "Pest"),
    "Vác": (47.7756, 19.1361, "Pest"),
    "Dunakeszi": (47.6364, 19.1386, "Pest"),
    "Fót": (47.6175, 19.1886, "Pest"),
    "Veresegyház": (47.6542, 19.2861, "Pest"),
    "Pomáz": (47.6436, 19.0236, "Pest"),
    "Biatorbágy": (47.4706, 18.8228, "Pest"),
    "Nagykovácsi": (47.5794, 18.8814, "Pest"),
    "Csömör": (47.5508, 19.2286, "Pest"),
    "Kistarcsa": (47.5478, 19.2625, "Pest"),
    "Kerepes": (47.5603, 19.2836, "Pest"),
    "Tura": (47.6075, 19.6031, "Pest"),
    "Aszód": (47.6511, 19.4878, "Pest"),
    "Péteri": (47.3897, 19.4086, "Pest"),
    "Csévharaszt": (47.2892, 19.4228, "Pest"),
    "Nyáregyháza": (47.2622, 19.5000, "Pest"),
    "Mikebuda": (47.1639, 19.6306, "Pest"),
    "Ceglédbercel": (47.2236, 19.6703, "Pest"),
    "Jászkarajenő": (47.0533, 20.0592, "Pest"),
    "Kocsér": (47.0011, 19.9203, "Pest"),
    "Tápiószentmárton": (47.3394, 19.7508, "Pest"),
    "Tápiógyörgye": (47.3333, 19.9500, "Pest"),
    "Tápiószőlős": (47.3017, 19.8486, "Pest"),
    "Nyársapát": (47.1006, 19.8064, "Pest"),
    "Törtel": (47.1225, 19.9364, "Pest"),
    "Szigetújfalu": (47.2389, 18.9289, "Pest"),
    # Jász-Nagykun-Szolnok
    "Szolnok": (47.1749, 20.1950, "Jász-Nagykun-Szolnok"),
    "Jászberény": (47.5000, 19.9167, "Jász-Nagykun-Szolnok"),
    "Törökszentmiklós": (47.1717, 20.4128, "Jász-Nagykun-Szolnok"),
    "Martfű": (47.0167, 20.2833, "Jász-Nagykun-Szolnok"),
    "Tiszaföldvár": (46.9833, 20.2500, "Jász-Nagykun-Szolnok"),
    "Kunszentmárton": (46.8392, 20.2886, "Jász-Nagykun-Szolnok"),
    "Mezőtúr": (47.0028, 20.6292, "Jász-Nagykun-Szolnok"),
    "Karcag": (47.3117, 20.9264, "Jász-Nagykun-Szolnok"),
    "Kisújszállás": (47.2167, 20.7667, "Jász-Nagykun-Szolnok"),
    "Túrkeve": (47.1000, 20.7500, "Jász-Nagykun-Szolnok"),
    "Újszász": (47.3000, 20.0833, "Jász-Nagykun-Szolnok"),
    "Zagyvarékas": (47.2667, 20.1333, "Jász-Nagykun-Szolnok"),
    "Rákóczifalva": (47.0833, 20.2333, "Jász-Nagykun-Szolnok"),
    "Tiszakürt": (46.8833, 20.1167, "Jász-Nagykun-Szolnok"),
    "Cibakháza": (46.9583, 20.1972, "Jász-Nagykun-Szolnok"),
    "Jászárokszállás": (47.6417, 19.9806, "Jász-Nagykun-Szolnok"),
    "Jászapáti": (47.5139, 20.1417, "Jász-Nagykun-Szolnok"),
    "Jászfényszaru": (47.5667, 19.7167, "Jász-Nagykun-Szolnok"),
    "Jászladány": (47.3667, 20.1667, "Jász-Nagykun-Szolnok"),
    "Besenyszög": (47.3000, 20.2667, "Jász-Nagykun-Szolnok"),
    "Fegyvernek": (47.2667, 20.5333, "Jász-Nagykun-Szolnok"),
    "Kenderes": (47.2500, 20.6833, "Jász-Nagykun-Szolnok"),
    "Szajol": (47.1833, 20.3000, "Jász-Nagykun-Szolnok"),
    "Abádszalók": (47.4667, 20.6000, "Jász-Nagykun-Szolnok"),
    "Tiszafüred": (47.6167, 20.7667, "Jász-Nagykun-Szolnok"),
    "Kunhegyes": (47.3667, 20.6333, "Jász-Nagykun-Szolnok"),
    "Jánoshida": (47.3833, 20.0667, "Jász-Nagykun-Szolnok"),
    "Tószeg": (47.1000, 20.1500, "Jász-Nagykun-Szolnok"),
    "Tiszajenő": (47.0333, 20.1500, "Jász-Nagykun-Szolnok"),
    "Vezseny": (47.0333, 20.2167, "Jász-Nagykun-Szolnok"),
    # Csongrád (NB III DK neighbours)
    "Szeged": (46.2530, 20.1414, "Csongrád-Csanád"),
    "Csongrád": (46.7133, 20.1428, "Csongrád-Csanád"),
    "Szentes": (46.6519, 20.2572, "Csongrád-Csanád"),
    "Hódmezővásárhely": (46.4181, 20.3300, "Csongrád-Csanád"),
    "Kistelek": (46.4728, 19.9797, "Csongrád-Csanád"),
    "Makó": (46.2167, 20.4833, "Csongrád-Csanád"),
    "Mórahalom": (46.2178, 19.8858, "Csongrád-Csanád"),
    "Kiszombor": (46.1833, 20.4333, "Csongrád-Csanád"),
    "Sándorfalva": (46.3639, 20.0989, "Csongrád-Csanád"),
    # Békés / others in NB III DK
    "Békéscsaba": (46.6833, 21.1000, "Békés"),
    "Gyula": (46.6500, 21.2833, "Békés"),
    "Orosháza": (46.5667, 20.6667, "Békés"),
    "Békés": (46.7667, 21.1333, "Békés"),
    "Szeghalom": (47.0333, 21.1667, "Békés"),
    "Gyomaendrőd": (46.9333, 20.8333, "Békés"),
    "Paks": (46.6219, 18.8558, "Tolna"),
    "Dunaújváros": (46.9619, 18.9355, "Fejér"),
    "Debrecen": (47.5316, 21.6273, "Hajdú-Bihar"),
}

# Common Hungarian club-name abbreviations that hide the town name.
ALIASES: dict[str, str] = {
    # Budapest districts, neighbourhoods and clubs (district precision is irrelevant for a 70 km radius)
    "ker.": "Budapest",
    "kerületi": "Budapest",
    "esmtk": "Budapest",
    "újpalota": "Budapest",
    "testvériség": "Budapest",
    "kelen": "Budapest",
    "ikarus": "Budapest",
    "pestszentimrei": "Budapest",
    "pestszentimre": "Budapest",
    "budatétény": "Budapest",
    "nagytétényi": "Budapest",
    "ferencvárosi": "Budapest",
    "pénzügyőr": "Budapest",
    "fővárosi": "Budapest",
    "szabadkikötő": "Budapest",
    "ludovika": "Budapest",
    "építők": "Budapest",
    "tfse": "Budapest",
    "reac": "Budapest",
    "unione": "Budapest",
    "szent istván se": "Budapest",
    # well-known club abbreviations elsewhere
    "eto": "Győr",
    "dac nádorváros": "Győr",
    "zte": "Zalaegerszeg",
    "andráshida": "Zalaegerszeg",
    "dvtk": "Miskolc",
    "deac": "Debrecen",
    "haladás": "Szombathely",
    "pmfc": "Pécs",
    "peac": "Pécs",
    "sbtc": "Salgótarján",
    "puskás akadémia": "Felcsút",
    "videoton": "Székesfehérvár",
    "fehérvár": "Székesfehérvár",
    "jvse": "Jászberény",
    "mezőmegyer": "Békéscsaba",
    "kaposfüred": "Kaposvár",
    "dorozsma": "Szeged",
    "majosi": "Bonyhád",
    "miklósi": "Szigetszentmiklós",
    "aranyszarvas": "Szarvas",
    "halas": "Kiskunhalas",
    "nagybátonyi": "Bátonyterenye",
    "koppánymonostori": "Komárom",
    "kte": "Kecskemét",
    "kecskeméti": "Kecskemét",
    "kecskemeti": "Kecskemét",
    "hírös": "Kecskemét",  # "Hírös város" = Kecskemét
    "vlc": "Lajosmizse",
    "lajosmizsei": "Lajosmizse",
    "ceglédi": "Cegléd",
    "ceglédi ve": "Cegléd",
    "dabasi": "Dabas",
    "monori": "Monor",
    "kiskunfélegyházi": "Kiskunfélegyháza",
    "kiskunfelegyhazi": "Kiskunfélegyháza",
    "kfhte": "Kiskunfélegyháza",
    "tiszakécskei": "Tiszakécske",
    "nagykőrösi": "Nagykőrös",
    "dunaharaszti": "Dunaharaszti",
    "dmtk": "Dunaharaszti",
    "szolnoki": "Szolnok",
    "mávsk": "Szolnok",
    "ftc": "Budapest",
    "mtk": "Budapest",
    "vasas": "Budapest",
    "bkv előre": "Budapest",
    "rkfc": "Budapest",
    "bvsc": "Budapest",
    "iii. kerület": "Budapest",
    "kerület": "Budapest",
    "kispest": "Budapest",
    "újpest": "Budapest",
    "csepel": "Budapest",
    "rákosmente": "Budapest",
    "soroksár": "Budapest",
    "budafoki": "Budapest",
    "szeged": "Szeged",
    "szegedi": "Szeged",
    "hódmezővásárhelyi": "Hódmezővásárhely",
    "hmvfc": "Hódmezővásárhely",
    "dvsc": "Debrecen",
}


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", s.lower()).strip()


def _load_settlements() -> dict[str, tuple[float, float, str]]:
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "hu_settlements.csv")
    out: dict[str, tuple[float, float, str]] = {}
    with open(path, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if "kerülete" in row["name"]:
                continue  # Budapest districts are reached through ALIASES
            out[row["name"]] = (float(row["lat"]), float(row["lng"]), row["county"] or "Budapest")
    return out


SETTLEMENTS = _load_settlements()
# every known town: the hand-checked gazetteer wins over the generated list
TOWNS: dict[str, tuple[float, float, str]] = {**SETTLEMENTS, **GAZETTEER}

_FOLDED_TOWNS = sorted(((_fold(t), t) for t in GAZETTEER), key=lambda x: -len(x[0]))
_FOLDED_ALIASES = sorted(((_fold(a), t) for a, t in ALIASES.items()), key=lambda x: -len(x[0]))
_VOWELS = set("aeiou")


def _adjective_forms(ft: str) -> set[str]:
    """Folded town name plus its usual -i adjective forms (Göd -> godi, Halásztelek -> halasztelki)."""
    forms = {ft, ft + "i"}
    if len(ft) > 3 and ft[-2] in _VOWELS and ft[-1] not in _VOWELS:
        forms.add(ft[:-2] + ft[-1] + "i")  # vowel drop: telek -> telki, Eger -> egri
    if ft[-1] in "ae":
        forms.add(ft[:-1] + "i")  # Kiskunfélegyháza -> kiskunfelegyhazi
    return forms


_SETTLEMENT_FORMS = sorted(
    ((form, town) for town in SETTLEMENTS for form in _adjective_forms(_fold(town))),
    key=lambda x: -len(x[0]),
)
_WORD_EDGE_L = r"(?:^|[\s\-.('\"/])"
_WORD_EDGE_R = r"(?=$|[\s\-.,)'\"/])"


def resolve_town(club_name: str) -> str | None:
    """Best-effort town lookup for a club name."""
    folded = _fold(club_name)
    tokens = set(re.findall(r"[a-z0-9.]+", folded))
    for alias, town in _FOLDED_ALIASES:
        if (" " in alias and alias in folded) or alias in tokens:
            return town
    for ft, town in _FOLDED_TOWNS:
        # match the town stem at a word start (Hungarian adjectives add -i / -I suffixes)
        stem = ft[:-1] if len(ft) > 5 else ft
        if re.search(r"(?:^|[\s\-.(])" + re.escape(stem), folded):
            return town
    for form, town in _SETTLEMENT_FORMS:
        # strict: a whole word (or hyphen part); short names like "Bő" must not match inside other words
        if len(form) >= 3 and form in folded and re.search(_WORD_EDGE_L + re.escape(form) + _WORD_EDGE_R, folded):
            return town
    return None


def geolocate(club_name: str) -> tuple[str | None, float | None, float | None, str | None]:
    town = resolve_town(club_name)
    if not town:
        return None, None, None, None
    lat, lng, county = TOWNS[town]
    return town, lat, lng, county


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
