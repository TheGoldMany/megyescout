import Link from "next/link";
import { sessionOrLogin } from "@/lib/session";
import { SectorHeading } from "@/components/stadium";

export const metadata = { title: "Honnan jönnek az adatok?" };

/* Data provenance, in plain language: what is copied from MLSZ as-is, what is calculated from it and how,
   and what is never shown because it has no official source. Keep the numbers in sync with etl/market.py
   and etl/analytics.py (see CLAUDE.md "Market values" / "Scouting Index"). */

const OFFICIAL = [
  ["Mérkőzések és eredmények", "Forduló, dátum, helyszín, végeredmény."],
  ["Tabellák", "A lejátszott mérkőzések eredményeiből: győzelem 3, döntetlen 1 pont."],
  ["Kezdők és cserék", "Ki kezdett, ki kit váltott, hányadik percben."],
  ["Játékperc", "Kezdőknek a lecserélésig, cseréknek a beállástól; a hosszabbítás a 90. percbe számít, piros lapnál a kiállításig."],
  ["Gólok, öngólok, lapok", "A jegyzőkönyv eseményei percre pontosan."],
  ["Születési dátum", "A játékos MLSZ-adatlapjáról."],
  ["Pályafutás", "Az MLSZ-adatlap szezononkénti klub- és bajnokságsorai."],
];

export default async function MethodologyPage() {
  await sessionOrLogin("/modszertan");
  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">Honnan jönnek az adatok?</h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Minden szám az MLSZ adatbank nyilvános oldalairól származik, vagy rögzített képlettel ezekből számoljuk.
          Kitalált, véletlenszerű vagy kézzel beírt adat nincs az oldalon.
        </p>
      </div>

      <section>
        <SectorHeading sector="A" title="Hivatalos adatok" sub="Az adatbank.mlsz.hu oldalairól, változtatás nélkül" />
        <dl className="nb-box divide-y-2 divide-black p-0">
          {OFFICIAL.map(([term, desc]) => (
            <div key={term} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr]">
              <dt className="font-bold">{term}</dt>
              <dd className="text-sm text-muted-foreground">{desc}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted-foreground">
          Minden játékos oldalán ott a link az eredeti MLSZ-adatlapra, így bármelyik szám ellenőrizhető.
        </p>
      </section>

      <section>
        <SectorHeading sector="B" title="Számított mutatók" sub="A hivatalos adatokból, mindenkire ugyanazzal a képlettel" />
        <div className="space-y-4">
          <article className="nb-box p-4">
            <h3 className="font-display text-2xl font-extrabold">Becsült piaci érték</h3>
            <p className="mt-1 text-sm">
              Nem hivatalos ár és nem átigazolási díj, hanem összehasonlító szám: mennyit ér egy játékos a többiekhez
              képest. Kiindulás az osztály alapértéke (NB III 6 M Ft, Megye I és BLSZ I 1,8 M Ft, Megye II és BLSZ II
              0,7 M Ft), ezt a Scouting Index emeli vagy csökkenti, legfeljebb az alapérték hatszorosáig. 270 játékperc
              alatt 40%-kal, 33 éves kortól a felére csökken.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Ha egy szezonból csak az MLSZ-adatlap pályafutás-sora ismert (jegyzőkönyv nincs), az érték csak az osztályból
              és az életkorból számolt durva becslés. Az értékgrafikonon ezt üres négyzet jelöli, és a ▲/▼ változás sosem
              hasonlít össze ilyen becslést jegyzőkönyvből számolt értékkel.
            </p>
          </article>
          <article className="nb-box p-4">
            <h3 className="font-display text-2xl font-extrabold">Scouting Index (0–100)</h3>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
              <li>35% a bajnokság erőssége</li>
              <li>25% az életkor (a 18–22 év a csúcs)</li>
              <li>25% a teljesítmény: játékperc-arány, gólveszély, a csapat eredménye vele és nélküle (900 perc alatt az 50 felé húzzuk, mert kevés adatból nem ítélünk)</li>
              <li>15% az előélet: akadémia, magasabb osztályban töltött szezonok</li>
            </ul>
          </article>
          <article id="poszt" className="nb-box scroll-mt-28 p-4">
            <h3 className="font-display text-2xl font-extrabold">Becsült poszt</h3>
            <p className="mt-1 text-sm">
              Az MLSZ-jegyzőkönyv nem tartalmaz posztot. A mezszámokból, a gólokból és abból becsüljük, hogy a játékos
              kit szokott váltani, illetve ki váltja őt. A mellette álló százalék a becslés bizonyossága.
            </p>
          </article>
          <article className="nb-box p-4">
            <h3 className="font-display text-2xl font-extrabold">Átigazolások</h3>
            <p className="mt-1 text-sm">
              Átigazolásnak azt vesszük, ha egy játékos fő felnőtt csapata két szezon között megváltozik. Ezt az MLSZ
              jegyzőkönyvei és adatlapja mutatják, tehát tény. Az összeg mellette a játékos becsült piaci értéke az
              érkezés szezonjában, nem a kifizetett díj.
            </p>
          </article>
          <article className="nb-box p-4">
            <h3 className="font-display text-2xl font-extrabold">Csapat vele és nélküle, hasonló játékosok</h3>
            <p className="mt-1 text-sm">
              Vele és nélküle: a csapat meccsenkénti pontátlaga, amikor a játékos legalább 60 percet játszott, mínusz
              amikor nem (mindkét oldalon legalább 2 meccs kell). Hasonló játékosok: hat mutató összevetése azonos
              poszton, legalább 450 játékperccel.
            </p>
          </article>
        </div>
      </section>

      <section>
        <SectorHeading sector="C" title="Amit nem mutatunk" sub="Mert nincs rá hivatalos, nyilvános forrás" />
        <ul className="nb-box list-inside list-disc space-y-1 p-4 text-sm">
          <li>Átigazolási díjak, fizetések, szerződések</li>
          <li>Gólpasszok: az MLSZ-jegyzőkönyv nem rögzíti őket</li>
          <li>Magasság, erősebbik láb, sérülések</li>
        </ul>
      </section>

      <section>
        <SectorHeading sector="D" title="Frissítés" />
        <p className="text-sm">
          Az adatok hétfőn és szerdán maguktól frissülnek az MLSZ adatbankból (az aktuális és a két előző forduló, hogy
          az utólagos fegyelmi módosítások is bekerüljenek). Az utolsó frissítések az{" "}
          <Link href="/data" className="nb-mark font-semibold underline decoration-2 underline-offset-4">
            Adatállapot
          </Link>{" "}
          oldalon láthatók.
        </p>
      </section>
    </div>
  );
}
