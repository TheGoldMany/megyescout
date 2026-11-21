import { Database } from "lucide-react";

// Shown on every page while the database has no tables yet (migrations not applied).
export function SetupNotice() {
  return (
    <div className="nb-box mx-auto mt-10 max-w-2xl p-6">
      <div className="flex items-center gap-3">
        <Database className="h-6 w-6" />
        <h1 className="font-display text-3xl font-bold leading-none">Az adatbázis még üres</h1>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        A kapcsolat működik, de a táblák még nincsenek létrehozva. Két lépés hiányzik:
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
        <li>
          GitHubon a repó <span className="text-foreground">Settings → Secrets and variables → Actions</span> oldalán add
          hozzá az <code className="bg-accent px-1 font-semibold">ETL_DATABASE_URL</code> titkot (ugyanazzal az értékkel, mint a Vercelen),
          majd az <span className="text-foreground">Actions → Migrate production database → Run workflow</span> gombbal
          futtasd a migrációt.
        </li>
        <li>
          Ha a migráció már sikeresen lefutott, és mégis ezt látod, akkor a Vercel{" "}
          <code className="bg-accent px-1 font-semibold">DATABASE_URL</code> másik adatbázisra mutat, mint a GitHub{" "}
          <code className="bg-accent px-1 font-semibold">ETL_DATABASE_URL</code>: a hosztnak és az adatbázis nevének egyeznie kell (a
          szerver naplója kiírja, melyikhez kapcsolódik az oldal).
        </li>
        <li>
          Töltsd be az adatokat: a Vercel-ütemezések hétfőn és szerdán maguktól futnak, vagy helyben:{" "}
          <code className="bg-accent px-1 font-semibold">python cli.py scrape --mode backfill --profiles</code>
        </li>
      </ol>
    </div>
  );
}
