import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { getClub } from "@/lib/queries";
import { sessionOrLogin } from "@/lib/session";
import { ClubCrest, ClubLink, Pitch, SectorHeading, StandingsTable, TransferList, ValueTag } from "@/components/stadium";
import { ArchetypeBadges } from "@/components/badges";
import { POSITION_LABEL, type Position } from "@/lib/labels";
import { clubCase, cn, fmtNum, fmtValue, titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getClub(id).catch(() => null);
  return { title: c?.name ? clubCase(c.name) : "Klub" };
}

const ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sessionOrLogin(`/clubs/${id}`);
  const data = await getClub(id);
  if (!data) notFound();
  const { club, squad, results, standings, transfersIn, transfersOut, venue, season } = data;
  const seasonStart = Number(season.slice(0, 4)) || new Date().getFullYear();
  const place = standings.findIndex((s) => s.club_id === id);

  return (
    <div className="space-y-9">
      {/* name board */}
      <section className="nb-box border-[3px] shadow-[7px_7px_0_#000]">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <ClubCrest name={data.name} logoUrl={club?.logo_url} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl font-bold leading-none tracking-tight sm:text-5xl">{clubCase(data.name)}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {club?.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {club.city}
                  {club.county && club.county !== club.city ? `, ${club.county}` : ""}
                </span>
              )}
              {club?.competition_id && (
                <Link href={`/leagues/${club.competition_id}`} className="text-foreground hover:bg-accent hover:text-black hover:underline">
                  {club.competition_short}
                </Link>
              )}
              {venue && <span>Pálya: {venue}</span>}
            </div>
          </div>
          <dl className="grid grid-cols-2 border-[3px] border-black bg-black shadow-[5px_5px_0_var(--color-accent)] sm:grid-cols-4">
            {[
              ["Keretérték", fmtValue(club?.squad_value_huf)],
              ["Keret", club ? `${club.squad_size} fő` : "–"],
              ["Átlagéletkor", club?.avg_age ? fmtNum(club.avg_age, 1) : "–"],
              ["Helyezés", place >= 0 ? `${place + 1}.` : "–"],
            ].map(([label, value]) => (
              <div key={label} className="border-white/25 px-3 py-2 odd:border-r-2 sm:border-r-2 sm:last:border-r-0">
                <dd className="font-display text-2xl font-bold text-accent">{value}</dd>
                <dt className="text-[11px] text-white/75">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="grid gap-9 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section>
          <SectorHeading sector="A" title="Keret" sub={`${season} szezon, becsült értékek`} />
          <div className="overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead className="bg-black text-left text-xs text-white">
                <tr>
                  <th className="px-3 py-2 font-medium">Játékos</th>
                  <th className="px-2 py-2 text-right font-medium">Kor</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Meccs</th>
                  <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Perc</th>
                  <th className="px-2 py-2 text-right font-medium">Gól</th>
                  <th className="hidden px-2 py-2 font-medium lg:table-cell">Szerepkör</th>
                  <th className="px-3 py-2 text-right font-medium">Piaci érték</th>
                </tr>
              </thead>
              {ORDER.map((pos) => {
                const group = squad.filter((p) => p.primary_position === pos);
                if (!group.length) return null;
                return (
                  <tbody key={pos}>
                    <tr className="border-t-[3px] border-black bg-secondary">
                      <th colSpan={7} className="px-3 py-1 text-left font-display text-sm font-semibold">
                        {POSITION_LABEL[pos]}
                        <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                          {group.length} fő, {fmtValue(group.reduce((s, p) => s + (p.market_value_huf ?? 0), 0))}
                        </span>
                      </th>
                    </tr>
                    {group.map((p) => (
                      <tr key={p.player_id} className="border-t border-border hover:bg-secondary/40">
                        <td className="px-3 py-1.5">
                          <Link href={`/players/${p.player_id}`} className="font-medium hover:bg-accent hover:text-black">
                            {titleCase(p.full_name)}
                          </Link>
                        </td>
                        <td className="px-2 text-right font-display text-base">{p.birth_year ? seasonStart - p.birth_year : "–"}</td>
                        <td className="hidden px-2 text-right font-display text-base sm:table-cell">{p.matches_played}</td>
                        <td className="hidden px-2 text-right font-display text-base sm:table-cell">{p.total_minutes}′</td>
                        <td className="px-2 text-right font-display text-base">{p.goals}</td>
                        <td className="hidden px-2 lg:table-cell">
                          <ArchetypeBadges tags={p.archetypes} max={2} />
                        </td>
                        <td className="px-3 py-1 text-right">
                          <ValueTag value={p.market_value_huf} prev={p.prev_market_value_huf} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
            {squad.length === 0 && <p className="p-4 text-sm text-muted-foreground">Ebben a szezonban nincs rögzített játékos.</p>}
          </div>
        </section>

        <div className="space-y-9">
          <section>
            <SectorHeading sector="B" title="Felállás a pályán" sub="A posztonként legértékesebb játékosok" />
            <Pitch players={squad} />
          </section>
          {standings.length > 0 && (
            <section>
              <SectorHeading
                sector="C"
                title="Tabella"
                action={
                  club?.competition_id ? (
                    <Link href={`/leagues/${club.competition_id}`} className="font-semibold underline decoration-2 underline-offset-4 nb-mark">
                      Teljes tabella
                    </Link>
                  ) : undefined
                }
              />
              <StandingsTable rows={standings} highlight={id} compact />
            </section>
          )}
        </div>
      </div>

      <div className="grid gap-9 lg:grid-cols-3">
        <section>
          <SectorHeading sector="D" title="Eredmények" sub="Az utolsó tíz mérkőzés" />
          <ul className="divide-y divide-border border border-border">
            {results.map((m) => {
              const res = m.goals_for > m.goals_against ? "GY" : m.goals_for === m.goals_against ? "D" : "V";
              return (
                <li key={m.match_id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span
                    className={cn(
                      "grid h-5 w-6 shrink-0 place-items-center font-display text-[11px] font-bold",
                      res === "GY" ? "bg-primary text-primary-foreground" : res === "D" ? "bg-accent text-accent-foreground" : "bg-seat text-black",
                    )}
                  >
                    {res}
                  </span>
                  <span className="w-10 shrink-0 font-display text-base">
                    {m.goals_for}–{m.goals_against}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{m.is_home ? "otthon" : "idegenben"}</span>
                  <ClubLink id={m.opponent_id} name={m.opponent} className="min-w-0 truncate" />
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{m.round_number ? `${m.round_number}. ford.` : ""}</span>
                </li>
              );
            })}
            {results.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Nincs lejátszott mérkőzés.</li>}
          </ul>
        </section>
        <section>
          <SectorHeading sector="E" title="Érkezők" />
          <TransferList rows={transfersIn} showSeason perspective="in" />
        </section>
        <section>
          <SectorHeading sector="F" title="Távozók" />
          <TransferList rows={transfersOut} showSeason perspective="out" />
        </section>
      </div>
    </div>
  );
}
