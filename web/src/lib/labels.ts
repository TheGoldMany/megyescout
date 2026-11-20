// All user-facing Hungarian labels live here.

export type Position = "GK" | "DEF" | "MID" | "FWD";
export type NoteStatus = "radar" | "watching" | "shortlist" | "contacted" | "rejected";

export const POSITION_LABEL: Record<Position, string> = {
  GK: "Kapus",
  DEF: "Védő",
  MID: "Középpályás",
  FWD: "Támadó",
};

export const POSITION_SHORT: Record<Position, string> = {
  GK: "KAP",
  DEF: "VÉD",
  MID: "KP",
  FWD: "TÁM",
};

export const STATUS_LABEL: Record<NoteStatus, string> = {
  radar: "Kiszemelt",
  watching: "Megfigyelés alatt",
  shortlist: "Shortlist",
  contacted: "Tárgyalás",
  rejected: "Elvetve",
};

export const STATUS_ORDER: NoteStatus[] = ["shortlist", "contacted", "watching", "radar", "rejected"];

export const STATUS_STYLE: Record<NoteStatus, string> = {
  radar: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  watching: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  shortlist: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  contacted: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  rejected: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30",
};

export const RADAR_AXES = [
  { key: "minutes_stability", label: "Játékperc-stabilitás", hint: "A csapat összes játékpercéből hány %-ot töltött pályán." },
  { key: "goal_threat", label: "Gólveszély", hint: "Gól/90 percentilis a posztján belül (kapusnál kapott gól nélküli meccsek aránya)." },
  { key: "team_impact", label: "Csapat-impakt (On/Off)", hint: "Csapat pontátlaga vele (≥60 perc) és nélküle — 50 = semleges." },
  { key: "discipline", label: "Fegyelem", hint: "Sárga lap/90 és kiállítások alapján — magasabb = fegyelmezettebb." },
  { key: "league_level", label: "Liga-szint", hint: "A bajnokság erősségi szorzója (NB III > Megye I > Megye II)." },
  { key: "experience", label: "Tapasztalat / Pedigré", hint: "Akadémiai múlt, legmagasabb osztály, felnőtt mérkőzésszám." },
] as const;

export type RadarKey = (typeof RADAR_AXES)[number]["key"];
export type RadarVector = Record<RadarKey, number>;

export const ARCHETYPE_STYLE: Record<string, string> = {
  Motor: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  Szupercsere: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
  "Gólfelelős": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  "Ütköző": "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  "Fiatalszabály-opció": "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  "Biztos kéz": "bg-teal-500/15 text-teal-300 ring-teal-500/30",
};

export const ARCHETYPE_HINT: Record<string, string> = {
  Motor: "Szinte minden percet végigjátszik kezdőként.",
  Szupercsere: "Gyakran csereként lép pályára, és ilyenkor is betalál.",
  "Gólfelelős": "A csapat góljainak jelentős részét ő szerzi.",
  "Ütköző": "Védekező típusú, sok párharc (lapok) – stabil kezdő.",
  "Fiatalszabály-opció": "Fiatalszabály szerinti korosztály, már felnőtt percekkel.",
  "Biztos kéz": "Kapus, sok kapott gól nélküli mérkőzéssel.",
};

export const CATEGORY_LABEL: Record<string, string> = {
  senior_11v11: "Felnőtt",
  youth: "Utánpótlás",
  futsal: "Futsal",
  cup: "Kupa",
  oldboys: "Öregfiúk",
};

export const TIER_LABEL: Record<number, string> = {
  1: "NB I",
  2: "NB II",
  3: "NB III",
  4: "Megye I / BLSZ I",
  5: "Megye II / BLSZ II",
  6: "Megye III+",
  7: "Megye IV",
};
