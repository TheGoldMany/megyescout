import { Database } from "lucide-react";

// Shown on every page while the database has no tables yet (migrations not applied).
export function SetupNotice() {
  return (
    <div className="mx-auto mt-10 max-w-2xl border-2 border-accent bg-black p-6">
      <div className="flex items-center gap-3">
        <Database className="h-6 w-6 text-accent" />
        <h1 className="font-display text-3xl font-bold leading-none">Az adatbázis még üres</h1>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        A kapcsolat működik, de a táblák még nincsenek létrehozva. Két lépés hiányzik:
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
        <li>
          GitHubon a repó <span className="text-foreground">Settings → Secrets and variables → Actions</span> oldalán add
          hozzá az <code className="text-accent">ETL_DATABASE_URL</code> titkot (ugyanazzal az értékkel, mint a Vercelen),
          majd az <span className="text-foreground">Actions → Migrate production database → Run workflow</span> gombbal
          futtasd a migrációt.
        </li>
        <li>
          Töltsd be az adatokat: a Vercel-ütemezések hétfőn és szerdán maguktól futnak, vagy helyben:{" "}
          <code className="text-accent">python cli.py scrape --mode backfill --profiles</code>
        </li>
      </ol>
    </div>
  );
}
