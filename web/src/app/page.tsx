import Link from "next/link";
import { getHome } from "@/lib/queries";
import { sessionOrLogin } from "@/lib/session";
import { ClubCrest, ClubLink, Grandstand, SectorHeading, TransferList, ValueTag } from "@/components/stadium";
import { TIER_LABEL } from "@/lib/labels";
import { clubCase, fmtNum, fmtValue, titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await sessionOrLogin("/");
  const h = await getHome();
  const seasonStart = Number(h.season.slice(0, 4)) || new Date().getFullYear();
  const maxClub = Math.max(1, ...h.clubs.map((c) => c.squad_value_huf));

  return (
    <div className="space-y-10">
      {/* hero: the headline is the stadium's name board, the grandstand below is the content */}
      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl font-bold leading-[0.95] tracking-tight sm:text-6xl">
              Ki mennyit ér az NB III-tól a megyei osztályokig
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Becsült piaci értékek, keretek, tabellák és átigazolások a {h.season} szezonból, minden lejátszott
              jegyzőkönyv alapján.
            </p>
          </div>
          {/* scoreboard */}
          <dl className="grid grid-cols-2 border-2 border-[#2a3038] bg-black sm:grid-cols-4 lg:shrink-0">
            {[
              ["Játékos", fmtNum(h.totals?.players, 0)],
              ["Klub", fmtNum(h.totals?.clubs, 0)],
              ["Összérték", fmtValue(h.totals?.value)],
              ["Átigazolás", fmtNum(h.transferCount, 0)],
            ].map(([label, value]) => (
              <div key={label} className="border-[#2a3038] px-4 py-2 odd:border-r sm:border-r sm:last:border-r-0">
                <dd className="font-display text-2xl font-bold text-accent">{value}</dd>
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
        <Grandstand players={h.top} seasonStart={seasonStart} />
      </section>

      <div className="grid gap-10 lg:grid-cols-5">
        <section className="lg:col-span-2">
          <SectorHeading sector="A" title="A legértékesebb keretek" sub="A játékosok becsült értékének összege" />
          <ol className="border border-border">
            {h.clubs.map((c, i) => (
              <li key={c.club_id} className="border-t border-border first:border-t-0">
                <Link href={`/clubs/${c.club_id}`} className="group block px-3 py-2 hover:bg-secondary/60">
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-right font-display text-lg text-muted-foreground">{i + 1}.</span>
                    <ClubCrest name={c.name} logoUrl={c.logo_url} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold group-hover:text-accent">{clubCase(c.name)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.competition_short ?? "–"}, {c.squad_size} fős keret
                        {c.avg_age ? `, átlagéletkor ${fmtNum(c.avg_age, 1)}` : ""}
                      </div>
                    </div>
                    <ValueTag value={c.squad_value_huf} size="sm" />
                  </div>
                  {/* stand-section bar: share of the most valuable squad */}
                  <div className="ml-8 mt-1.5 h-1.5 bg-secondary">
                    <div className="h-full bg-accent/80" style={{ width: `${(c.squad_value_huf / maxClub) * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="lg:col-span-3">
          <SectorHeading
            sector="B"
            title="Friss átigazolások"
            sub={`Klubváltások a ${h.season} szezon elején`}
            action={<Link href="/transfers" className="text-accent hover:underline">Összes átigazolás</Link>}
          />
          <TransferList rows={h.transfers} />
        </section>
      </div>

      <section>
        <SectorHeading sector="C" title="Bajnokságok" sub="Éllovas és a keretek összértéke" />
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {h.leagues.map((l) => (
            <Link key={l.competition_id} href={`/leagues/${l.competition_id}`} className="group bg-card p-3 hover:bg-secondary">
              <div className="text-[11px] text-muted-foreground">{TIER_LABEL[l.tier] ?? `${l.tier}. szint`}</div>
              <div className="font-display text-xl font-semibold leading-tight group-hover:text-accent">{l.name}</div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-muted-foreground">
                  Éllovas: <span className="text-foreground">{l.leader_name ? clubCase(l.leader_name) : "–"}</span>
                </span>
                <span className="shrink-0 font-display text-base text-accent">{fmtValue(l.total_value_huf)}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {l.clubs} klub, {l.matches} lejátszott meccs
              </div>
            </Link>
          ))}
          <Link href="/leagues" className="grid place-items-center bg-black p-3 font-display text-lg text-accent hover:bg-secondary">
            Összes bajnokság
          </Link>
        </div>
      </section>

      {h.risers.length > 0 && (
        <section>
          <SectorHeading sector="D" title="Akiknek a legtöbbet nőtt az értéke" sub="Az előző szezonhoz képest" />
          <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {h.risers.map((p) => (
              <div key={p.player_id} className="flex items-center justify-between gap-3 bg-card px-3 py-2">
                <div className="min-w-0">
                  <Link href={`/players/${p.player_id}`} className="font-semibold hover:text-accent">
                    {titleCase(p.full_name)}
                  </Link>
                  <div className="truncate text-[11px] text-muted-foreground">
                    <ClubLink id={p.club_id} name={p.club_name} />
                    {p.birth_year ? `, ${seasonStart - p.birth_year} év` : ""}
                  </div>
                </div>
                <ValueTag value={p.market_value_huf} prev={p.prev_market_value_huf} size="sm" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
