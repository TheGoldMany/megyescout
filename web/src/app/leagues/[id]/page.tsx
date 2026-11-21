import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeague } from "@/lib/queries";
import { sessionOrLogin } from "@/lib/session";
import { ClubLink, SectorHeading, StandingsTable, ValueTag } from "@/components/stadium";
import { POSITION_SHORT, TIER_LABEL } from "@/lib/labels";
import { fmtValue, titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await getLeague(id).catch(() => null);
  return { title: l?.comp.name ?? "Bajnokság" };
}

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sessionOrLogin(`/leagues/${id}`);
  const data = await getLeague(id);
  if (!data) notFound();
  const { comp, standings, valuable, scorers } = data;
  const total = standings.reduce((s, r) => s + r.squad_value_huf, 0);
  const seasonStart = Number(comp.season.slice(0, 4));

  return (
    <div className="space-y-9">
      <section className="nb-box border-[3px] shadow-[7px_7px_0_#000] p-4 sm:p-5">
        <Link href="/leagues" className="nb-mark text-xs font-semibold text-muted-foreground">
          Bajnokságok
        </Link>
        <h1 className="font-display text-4xl font-bold leading-none tracking-tight sm:text-5xl">{comp.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {comp.season} szezon, {TIER_LABEL[comp.tier] ?? `${comp.tier}. szint`}
          {comp.federation ? `, ${comp.federation}` : ""}. A keretek összértéke {fmtValue(total)}.
        </p>
      </section>

      <section>
        <SectorHeading sector="A" title="Tabella" sub="A lejátszott jegyzőkönyvekből számolva" />
        {standings.length ? <StandingsTable rows={standings} /> : <p className="text-sm text-muted-foreground">Még nincs lejátszott mérkőzés.</p>}
      </section>

      <div className="grid gap-9 lg:grid-cols-2">
        <section>
          <SectorHeading sector="B" title="A legértékesebb játékosok" />
          <ol className="divide-y divide-border border border-border">
            {valuable.map((p, i) => (
              <li key={p.player_id} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-5 text-right font-display text-lg text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/players/${p.player_id}`} className="font-semibold hover:bg-accent hover:text-black">
                    {titleCase(p.full_name)}
                  </Link>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {p.primary_position ? `${POSITION_SHORT[p.primary_position]}, ` : ""}
                    {p.birth_year ? `${seasonStart - p.birth_year} év, ` : ""}
                    <ClubLink id={p.club_id} name={p.club_name} />
                  </div>
                </div>
                <ValueTag value={p.market_value_huf} prev={p.prev_market_value_huf} size="sm" />
              </li>
            ))}
          </ol>
        </section>
        <section>
          <SectorHeading sector="C" title="Góllövőlista" />
          <ol className="divide-y divide-border border border-border">
            {scorers.map((p, i) => (
              <li key={p.player_id} className="flex items-center gap-3 px-3 py-1.5">
                <span className="w-5 text-right font-display text-lg text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/players/${p.player_id}`} className="font-semibold hover:bg-accent hover:text-black">
                    {titleCase(p.full_name)}
                  </Link>
                  <div className="truncate text-[11px] text-muted-foreground">
                    <ClubLink id={p.club_id} name={p.club_name} />, {p.matches_played} meccs, {p.total_minutes}′
                  </div>
                </div>
                <span className="border-2 border-black bg-black px-2 font-display text-xl font-bold text-accent">{p.goals}</span>
              </li>
            ))}
            {scorers.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Még nincs gól.</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}
