import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, Database, MapPinOff, XCircle } from "lucide-react";
import { getCoverage, getDataQuality, getSyncRuns, getUnlocatedClubs } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_LABEL, TIER_LABEL } from "@/lib/labels";
import { clubCase, cn, fmtDateTime, fmtInt } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adatállapot" };

const MODE_LABEL: Record<string, string> = {
  incremental: "Inkrementális",
  backfill: "Teljes visszatöltés",
  seed: "Demó adatok",
};

function duration(start: string, end: string | null) {
  if (!end) return "–";
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return s < 60 ? `${s} mp` : `${Math.floor(s / 60)} p ${s % 60} mp`;
}

export default async function DataHealthPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const [runs, coverage, unlocated, quality] = await Promise.all([
    getSyncRuns(),
    getCoverage(),
    getUnlocatedClubs(),
    getDataQuality(),
  ]);
  const unlocatedPlayers = unlocated.reduce((n, c) => n + c.players, 0);

  const tiles = [
    { label: "Játékosok az adatbázisban", value: fmtInt(quality.players), warn: false },
    { label: "Születési év nélkül", value: fmtInt(quality.no_birth_year), warn: quality.no_birth_year > 0, hint: "Életkor és fiatalszabály-szűrő nem működik rájuk" },
    { label: "MLSZ adatlap még nincs letöltve", value: fmtInt(quality.no_profile), warn: quality.no_profile > 0, hint: "scrape --profiles pótolja" },
    { label: "Helymeghatározás nélküli klubok", value: fmtInt(unlocated.length), warn: unlocated.length > 0, hint: `${unlocatedPlayers} játékos kiesik a távolságszűrőből` },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl">
          <Database className="h-5 w-5 text-primary" /> Adatállapot
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          MLSZ szinkronizálások, bajnokságonkénti lefedettség és adatminőségi figyelmeztetések
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 sm:gap-3">
        {tiles.map((t) => (
          <div key={t.label} className={cn("rounded-lg border bg-card p-3", t.warn && "border-amber-500/30")}>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</div>
            <div className={cn("mt-1 font-mono text-xl font-semibold", t.warn && "text-amber-300")}>{t.value}</div>
            {t.hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{t.hint}</div>}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Szinkronizálási napló</CardTitle>
          <CardDescription>Ütemezés: hétfő 06:00 és szerda 21:00 (aktuális forduló + 2 előző a fegyelmi módosítások miatt)</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pl-4 text-left font-medium">Állapot</th>
                <th className="px-2 text-left font-medium">Indítva</th>
                <th className="px-2 text-left font-medium">Forrás / mód</th>
                <th className="px-2 text-right font-medium">Időtartam</th>
                <th className="px-2 text-right font-medium">Meccs</th>
                <th className="px-2 text-right font-medium">Játékos</th>
                <th className="pr-4 text-left font-medium">Megjegyzés</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pl-4">
                    {r.status === "ok" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Rendben</span>
                    ) : r.status === "failed" ? (
                      <span className="inline-flex items-center gap-1 text-rose-300"><XCircle className="h-3.5 w-3.5" /> Hiba</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sky-300"><Clock className="h-3.5 w-3.5" /> Fut</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 font-mono">{fmtDateTime(r.started_at)}</td>
                  <td className="whitespace-nowrap px-2">
                    {r.source === "mlsz" ? "MLSZ adatbank" : "Demó"} · {MODE_LABEL[r.mode] ?? r.mode}
                  </td>
                  <td className="px-2 text-right font-mono">{duration(r.started_at, r.finished_at)}</td>
                  <td className="px-2 text-right font-mono">{r.matches_upserted}</td>
                  <td className="px-2 text-right font-mono">{r.players_upserted}</td>
                  <td className="max-w-[360px] truncate pr-4 text-muted-foreground" title={r.error ?? ""}>
                    {r.error ? (
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {r.error}
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Még nem futott szinkronizálás.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Bajnokságok lefedettsége</CardTitle>
            <CardDescription>Lejátszott meccsek, amelyekhez jegyzőkönyv (felállás) is van</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pl-4 text-left font-medium">Bajnokság</th>
                  <th className="px-2 text-left font-medium">Szezon</th>
                  <th className="px-2 text-right font-medium">Meccs</th>
                  <th className="px-2 text-left font-medium">Jegyzőkönyv</th>
                  <th className="px-2 text-right font-medium">Utolsó ford.</th>
                  <th className="px-2 text-right font-medium">Játékos</th>
                  <th className="pr-4 text-right font-medium">Utolsó letöltés</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((c) => {
                  const pct = c.matches ? Math.round((c.matches_with_lineups / c.matches) * 100) : 0;
                  return (
                    <tr key={c.competition_id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pl-4">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {CATEGORY_LABEL[c.category] ?? c.category} · {TIER_LABEL[c.tier] ?? `${c.tier}. szint`}
                        </div>
                      </td>
                      <td className="px-2 font-mono">{c.season}</td>
                      <td className="px-2 text-right font-mono">{c.matches}</td>
                      <td className="px-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                            <div className={cn("h-full", pct >= 95 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-mono">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-2 text-right font-mono">{c.last_round ?? "–"}</td>
                      <td className="px-2 text-right font-mono">{c.players}</td>
                      <td className="whitespace-nowrap pr-4 text-right font-mono text-muted-foreground">
                        {c.last_scraped ? fmtDateTime(c.last_scraped) : "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPinOff className="h-4 w-4 text-amber-400" /> Helymeghatározás nélküli klubok
            </CardTitle>
            <CardDescription>
              Ezek játékosai nem jelennek meg távolságszűrésnél. Pótlás: <code className="font-mono">cli.py geo --set</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unlocated.length === 0 ? (
              <p className="text-sm text-emerald-300">Minden klub helye ismert.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {unlocated.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span className="truncate">{clubCase(c.name)}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">{c.players} játékos</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
