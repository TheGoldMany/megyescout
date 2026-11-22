import Link from "next/link";
import { getHome } from "@/lib/queries";
import { sessionOrLogin } from "@/lib/session";
import { ClubCrest, ClubLink, SectorHeading, TopPlayers, TransferList, ValueTag } from "@/components/stadium";
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
            <h1 className="font-display text-5xl font-extrabold leading-[0.9] tracking-tight sm:text-7xl">
              Ki mennyit ér az NB III-tól a megyei osztályokig
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Becsült piaci értékek, keretek, tabellák és átigazolások{h.season ? ` a ${h.season} szezonból` : ""}, minden
              lejátszott jegyzőkönyv alapján.
            </p>
          </div>
          {/* scoreboard */}
          <dl className="grid grid-cols-2 border-[3px] border-black bg-black shadow-[6px_6px_0_var(--color-accent)] sm:grid-cols-4 lg:shrink-0">
            {[
              ["Játékos", fmtNum(h.totals?.players, 0)],
              ["Klub", fmtNum(h.totals?.clubs, 0)],
              ["Összérték", fmtValue(h.totals?.value)],
              ["Átigazolás", fmtNum(h.transferCount, 0)],
            ].map(([label, value]) => (
              <div key={label} className="border-white/25 px-4 py-2 odd:border-r-2 sm:border-r-2 sm:last:border-r-0">
                <dd className="font-display text-3xl font-extrabold text-accent">{value}</dd>
                <dt className="text-xs text-white/75">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
        {/* start here: a search box, then the four things people come for */}
        <form action="/explorer" role="search" className="nb-box flex items-stretch gap-0 p-0">
          <label htmlFor="home-q" className="sr-only">Keresés</label>
          <input
            id="home-q"
            name="q"
            placeholder="Játékos, klub vagy település neve"
            className="min-w-0 flex-1 bg-white px-4 py-3 text-base font-semibold placeholder:font-normal placeholder:text-[#464b52] focus:bg-[#fff6cc] focus:outline-none"
          />
          <button className="border-l-[3px] border-black bg-accent px-5 font-display text-xl font-extrabold hover:bg-black hover:text-accent">
            Keresés
          </button>
        </form>
        <nav aria-label="Gyors indulás" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              href: "/explorer",
              title: "Játékosok a közelben",
              text: "Mindenki, aki 70 km-en belül játszik Lajosmizsétől, érték szerint rendezve.",
            },
            {
              href: `/explorer?byMin=${seasonStart - 20}&byMax=${seasonStart - 18}`,
              title: "Fiatalok a szabályhoz",
              text: `${seasonStart - 20} és ${seasonStart - 18} között született játékosok a környékről.`,
            },
            h.pilot
              ? { href: `/clubs/${h.pilot.id}`, title: "A mi keretünk", text: `${clubCase(h.pilot.name)}: játékosok, tabella, átigazolások.` }
              : { href: "/shortlist", title: "Figyelőlista", text: "A kiszemelt játékosok és a jegyzetek egy helyen." },
            { href: "/leagues", title: "Tabellák", text: "Minden bajnokság állása, góllövőlistája és a keretek értéke." },
          ].map((t) => (
            <Link key={t.title} href={t.href} className="nb-press block border-[3px] border-black bg-white p-3">
              <span className="font-display text-2xl font-extrabold leading-tight">{t.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t.text}</span>
            </Link>
          ))}
        </nav>
        {h.top.length > 0 ? (
          <TopPlayers players={h.top} seasonStart={seasonStart} season={h.season} />
        ) : (
          <div className="nb-box p-5">
            <h2 className="font-display text-2xl font-extrabold">A lelátó még üres</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Az MLSZ-jegyzőkönyvek betöltése folyamatban van. A játékosok és az értékek a betöltés végén, az elemzés
              lefutása után jelennek meg. Az állapotot az{" "}
              <Link href="/data" className="nb-mark font-semibold underline decoration-2 underline-offset-4">
                Adatállapot
              </Link>{" "}
              oldalon követheted.
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-5">
        <section className="lg:col-span-2">
          <SectorHeading sector="A" title="A legértékesebb keretek" sub="A játékosok becsült értékének összege" />
          <ol className="border-[3px] border-black bg-white shadow-[4px_4px_0_#000]">
            {h.clubs.map((c, i) => (
              <li key={c.club_id} className="border-t-2 border-black first:border-t-0">
                <Link href={`/clubs/${c.club_id}`} className="group block px-3 py-2 hover:bg-[#fff6cc]">
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-right font-display text-xl font-bold">{i + 1}.</span>
                    <ClubCrest name={c.name} logoUrl={c.logo_url} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{clubCase(c.name)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.competition_short ?? "–"}, {c.squad_size} fős keret
                        {c.avg_age ? `, átlagéletkor ${fmtNum(c.avg_age, 1)}` : ""}
                      </div>
                    </div>
                    <ValueTag value={c.squad_value_huf} size="sm" />
                  </div>
                  {/* stand-section bar: share of the most valuable squad */}
                  <div className="ml-8 mt-1.5 h-2.5 border-2 border-black bg-white">
                    <div className="h-full bg-accent" style={{ width: `${(c.squad_value_huf / maxClub) * 100}%` }} />
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
            sub={`Klubváltások a ${h.season} szezon elején. Az összeg becsült piaci érték, nem átigazolási díj.`}
            action={<Link href="/transfers" className="nb-press inline-block border-[3px] border-black bg-accent px-2 py-0.5 font-bold">Összes átigazolás</Link>}
          />
          <TransferList rows={h.transfers} />
        </section>
      </div>

      <section>
        <SectorHeading sector="C" title="Bajnokságok" sub="Éllovas és a keretek összértéke" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {h.leagues.map((l) => (
            <Link key={l.competition_id} href={`/leagues/${l.competition_id}`} className="nb-press group border-[3px] border-black bg-white p-3">
              <div className="text-xs font-semibold text-muted-foreground">{TIER_LABEL[l.tier] ?? `${l.tier}. szint`}</div>
              <div className="font-display text-2xl font-extrabold leading-tight">{l.name}</div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-muted-foreground">
                  Éllovas: <span className="text-foreground">{l.leader_name ? clubCase(l.leader_name) : "–"}</span>
                </span>
                <span className="shrink-0 border-2 border-black bg-black px-1.5 font-display text-base font-bold text-accent">{fmtValue(l.total_value_huf)}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {l.clubs} klub, {l.matches} lejátszott meccs
              </div>
            </Link>
          ))}
          <Link href="/leagues" className="nb-press grid place-items-center border-[3px] border-black bg-accent p-3 font-display text-2xl font-extrabold">
            Összes bajnokság
          </Link>
        </div>
      </section>

      {h.risers.length > 0 && (
        <section>
          <SectorHeading sector="D" title="Akiknek a legtöbbet nőtt az értéke" sub="Az előző szezonhoz képest" />
          <div className="grid gap-px border-[3px] border-black bg-black shadow-[4px_4px_0_#000] sm:grid-cols-2 lg:grid-cols-3">
            {h.risers.map((p) => (
              <div key={p.player_id} className="flex items-center justify-between gap-3 bg-white px-3 py-2">
                <div className="min-w-0">
                  <Link href={`/players/${p.player_id}`} className="font-semibold hover:bg-accent hover:text-black">
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
