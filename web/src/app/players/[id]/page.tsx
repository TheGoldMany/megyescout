import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, GraduationCap, MapPin, Info } from "lucide-react";
import {
  getCareer,
  getNote,
  getPlayer,
  getPositionalAverage,
  getRecentMatches,
  getSimilar,
  type CareerRow,
} from "@/lib/queries";
import { getSession } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArchetypeBadges, IndexBadge, IndexRing, OnOff, PositionBadge } from "@/components/badges";
import { PlayerRadar } from "@/components/radar-chart";
import { ScoutBox } from "@/components/scout-box";
import { Tip } from "@/components/ui/tooltip";
import { CATEGORY_LABEL, POSITION_LABEL, RADAR_AXES, TIER_LABEL } from "@/lib/labels";
import { clubCase, cn, fmtNum, titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const p = session ? await getPlayer(session.workspaceId, id) : null;
  return { title: p ? titleCase(p.full_name) : "Játékos" };
}

const CATEGORY_TONE: Record<string, string> = {
  senior_11v11: "bg-emerald-500",
  youth: "bg-sky-500",
  futsal: "bg-fuchsia-500",
  cup: "bg-amber-500",
  oldboys: "bg-zinc-500",
  other: "bg-zinc-600",
};

function groupBySeason(rows: CareerRow[]) {
  const m = new Map<string, CareerRow[]>();
  for (const r of rows) {
    const list = m.get(r.season) ?? [];
    list.push(r);
    m.set(r.season, list);
  }
  return [...m.entries()];
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const p = await getPlayer(session.workspaceId, id);
  if (!p) notFound();

  const [career, similar, note, recent, avg] = await Promise.all([
    getCareer(id),
    getSimilar(session.workspaceId, id),
    getNote(session.workspaceId, id),
    getRecentMatches(id),
    getPositionalAverage(p.competition_id, p.primary_position),
  ]);
  const seasonStart = p.season ? Number(p.season.slice(0, 4)) : new Date().getFullYear();
  const age = p.birth_year ? seasonStart - p.birth_year : null;
  const isMlsz = /^\d+$/.test(p.mlsz_player_id ?? "");

  return (
    <div className="space-y-4">
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Vissza a keresőhöz
      </Link>

      {/* hero */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent p-4 sm:flex-row sm:items-center sm:p-5">
          <IndexRing value={p.scouting_index ?? null} />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
              {titleCase(p.full_name)}
              {p.has_academy_pedigree && (
                <Tip content="Akadémiai előélet (kiemelt utánpótlás vagy NB I/NB II akadémia)">
                  <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-300 ring-1 ring-sky-500/30">
                    <GraduationCap className="h-3.5 w-3.5" /> Akadémia
                  </span>
                </Tip>
              )}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>
                {age !== null ? `${age} éves` : "kor ismeretlen"}
                {p.birth_date ? ` (${p.birth_date.replaceAll("-", ". ")}.)` : p.birth_year ? ` (${p.birth_year})` : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <PositionBadge pos={p.primary_position} secondary={p.secondary_position} />
                {p.primary_position && (
                  <span>
                    {POSITION_LABEL[p.primary_position]}
                    {p.position_confidence ? ` · ${Math.round(p.position_confidence * 100)}% biztos` : ""}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {p.club_name ? clubCase(p.club_name) : "–"}
                {p.distance_km !== null && p.distance_km !== undefined ? ` · ${fmtNum(p.distance_km, 0)} km` : ""}
              </span>
              {p.competition_name && <span>{p.competition_name}</span>}
            </div>
            <div className="mt-2">
              <ArchetypeBadges tags={p.archetypes} max={6} />
            </div>
          </div>
          {isMlsz && (
            <a
              href={`https://adatbank.mlsz.hu/player/${p.mlsz_player_id}.html`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 self-start rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
            >
              MLSZ adatlap <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {/* stat strip */}
        <div className="grid grid-cols-3 divide-x border-t sm:grid-cols-6">
          {[
            ["Meccs", `${p.matches_played ?? 0}`, `${p.starts ?? 0} kezdő · ${p.sub_ins ?? 0} csere`],
            ["Játékperc", `${p.total_minutes ?? 0}′`, `${fmtNum(p.minutes_share_pct, 0)}% kihasználtság`],
            ["Gól", `${p.goals ?? 0}`, `${fmtNum(p.goals_per_90)} / 90 perc`],
            ["Lap / 90", fmtNum(p.yellows_per_90), "sárga lap"],
            ["Pontátlag vele", fmtNum(p.team_ppg_with_player), `nélküle: ${fmtNum(p.team_ppg_without_player)}`],
            ["On/Off", null, "pont/meccs különbség"],
          ].map(([label, value, sub]) => (
            <div key={label} className="px-3 py-2.5 sm:px-4">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="font-mono text-lg font-semibold">
                {label === "On/Off" ? <OnOff value={p.on_off_impact} /> : value}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">{sub}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* radar */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Játékkép – 6 tengelyes radar</CardTitle>
            <CardDescription>
              Összevetve a(z) {p.competition_short ?? "liga"}{" "}
              {p.primary_position ? POSITION_LABEL[p.primary_position].toLowerCase() : ""} átlagával (min. 270 perc)
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_220px]">
            {p.radar_vector ? (
              <PlayerRadar
                series={[
                  { name: titleCase(p.full_name), values: p.radar_vector },
                  ...(avg ? [{ name: "Liga posztátlag", values: avg, dashed: true }] : []),
                ]}
              />
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Ebben a szezonban nincs felnőtt 11v11 játékperc.</p>
            )}
            <ul className="space-y-2 self-center text-xs">
              {RADAR_AXES.map((a) => {
                const v = p.radar_vector ? Math.round(Number(p.radar_vector[a.key])) : null;
                const ref = avg ? Math.round(Number(avg[a.key])) : null;
                return (
                  <li key={a.key}>
                    <div className="flex items-center justify-between">
                      <Tip content={a.hint}>
                        <span className="inline-flex cursor-help items-center gap-1 text-muted-foreground">
                          {a.label} <Info className="h-3 w-3" />
                        </span>
                      </Tip>
                      <span className="font-mono">
                        {v ?? "–"}
                        {ref !== null && v !== null && (
                          <span className={cn("ml-1 text-[10px]", v >= ref ? "text-emerald-400" : "text-rose-400")}>
                            {v >= ref ? "+" : ""}
                            {v - ref}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full bg-primary" style={{ width: `${v ?? 0}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {/* private scout box */}
        <Card className="border-amber-500/20">
          <CardHeader>
            <CardTitle className="text-amber-300">Klub-széf · Lajosmizsei VLC</CardTitle>
            <CardDescription>Privát megfigyelési jegyzet</CardDescription>
          </CardHeader>
          <CardContent>
            <ScoutBox playerId={id} note={note} />
          </CardContent>
        </Card>
      </div>

      {/* similar */}
      <Card>
        <CardHeader>
          <CardTitle>Hasonló profilok a régióban</CardTitle>
          <CardDescription>Koszinusz-hasonlóság a 6 tengelyes szezon-vektor alapján, azonos poszt-csoporton belül</CardDescription>
        </CardHeader>
        <CardContent>
          {similar.length === 0 ? (
            <p className="text-sm text-muted-foreground">Még nincs elég játékperc (min. 450) a hasonlóság számításához.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {similar.map((s) => {
                const pct = Math.max(0, Math.round(s.similarity * 100));
                return (
                  <Link
                    key={s.player_id}
                    href={`/players/${s.player_id}`}
                    className="group rounded-lg border bg-background/40 p-3 transition hover:border-primary/40 hover:bg-secondary/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium group-hover:text-primary">{titleCase(s.full_name)}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {s.birth_year ? `${seasonStart - s.birth_year} év · ` : ""}
                          {s.club_name ? clubCase(s.club_name) : "–"}
                        </div>
                      </div>
                      <IndexBadge value={s.scouting_index} />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <PositionBadge pos={s.primary_position} />
                      <span>{s.competition_short}</span>
                      <span>· {s.distance_km !== null ? `${fmtNum(s.distance_km, 0)} km` : "?"}</span>
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Hasonlóság</span>
                        <span className="font-mono text-emerald-300">{pct}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* career timeline */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Karrier & több bajnokságos idővonal</CardTitle>
            <CardDescription>Felnőtt 11v11, utánpótlás és futsal egymás mellett (mlsz_player_id alapján összefűzve)</CardDescription>
          </CardHeader>
          <CardContent>
            {career.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nincs karrier-adat.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-5">
                {groupBySeason(career).map(([season, rows]) => (
                  <li key={season}>
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                    <div className="font-mono text-xs text-muted-foreground">{season}</div>
                    <ul className="mt-1 space-y-1">
                      {rows.map((r, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", CATEGORY_TONE[r.category] ?? "bg-zinc-600")} />
                          <span className="font-medium">{clubCase(r.club_names)}</span>
                          <span className="text-muted-foreground">· {r.competition_name}</span>
                          <span className="rounded bg-secondary px-1 text-[10px] text-muted-foreground">
                            {CATEGORY_LABEL[r.category] ?? "Egyéb"}
                            {r.tier ? ` · ${TIER_LABEL[r.tier] ?? r.tier}` : ""}
                          </span>
                          <span className="ml-auto font-mono text-xs text-muted-foreground">
                            {r.appearances} meccs · {r.goals} gól{r.minutes ? ` · ${r.minutes}′` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* recent matches */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Utolsó mérkőzések</CardTitle>
            <CardDescription>Jegyzőkönyv alapján</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <table className="w-full text-xs">
              <tbody>
                {recent.map((m, i) => {
                  const res = m.goals_for > m.goals_against ? "GY" : m.goals_for === m.goals_against ? "D" : "V";
                  return (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 pl-4 font-mono text-muted-foreground">{m.round_number ?? "–"}.</td>
                      <td className="max-w-[160px] truncate px-2">
                        <span className="text-muted-foreground">{m.is_home ? "vs" : "@"}</span> {clubCase(m.opponent)}
                      </td>
                      <td className="px-2 font-mono">
                        <span
                          className={cn(
                            "mr-1 inline-block w-5 rounded text-center text-[10px]",
                            res === "GY" ? "bg-emerald-500/20 text-emerald-300" : res === "D" ? "bg-amber-500/20 text-amber-300" : "bg-rose-500/20 text-rose-300",
                          )}
                        >
                          {res}
                        </span>
                        {m.goals_for}–{m.goals_against}
                      </td>
                      <td className="px-2 font-mono text-muted-foreground">
                        {m.is_starter ? "K" : `${m.minute_in}′→`} {m.minutes_played}′
                      </td>
                      <td className="pr-4 text-right">
                        {m.goals > 0 && <span className="mr-1">{"⚽".repeat(m.goals)}</span>}
                        {m.yellow_cards > 0 && <span className="mr-0.5 inline-block h-3 w-2 rounded-[1px] bg-yellow-400 align-middle" />}
                        {m.red_cards > 0 && <span className="inline-block h-3 w-2 rounded-[1px] bg-red-500 align-middle" />}
                      </td>
                    </tr>
                  );
                })}
                {recent.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted-foreground">Nincs rögzített mérkőzés.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
