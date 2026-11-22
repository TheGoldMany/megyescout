import { Suspense } from "react";
import { History } from "lucide-react";
import { KpiBar } from "@/components/kpi-bar";
import { ExplorerFilters } from "@/components/explorer-filters";
import { PlayerTable } from "@/components/player-table";
import { getKpis, getSeasons, getTiers, searchPlayers } from "@/lib/queries";
import { DEFAULT_MAX_KM, parseFilters, type RawParams } from "@/lib/filters";
import { sessionOrLogin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Játékoskereső" };

export default async function ExplorerPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
  const session = await sessionOrLogin(qs.size ? `/explorer?${qs}` : "/explorer");
  const f = parseFilters(sp);
  const seasons = await getSeasons();
  const requested = typeof sp.season === "string" ? sp.season : undefined;
  const season = requested && seasons.includes(requested) ? requested : (seasons[0] ?? "");
  const isPast = season !== seasons[0];

  const [kpis, tiers, result] = await Promise.all([
    getKpis(session.workspaceId),
    getTiers(season),
    searchPlayers(session.workspaceId, f, season),
  ]);
  const seasonStart = Number(season.slice(0, 4)) || new Date().getFullYear();
  const youthWindow: [number, number] = [seasonStart - 20, seasonStart - 18];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Régiós Scout Kereső</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            NB III Dél-Kelet, Megye I–II, BLSZ I–II és JNSZ Megye I — Lajosmizse 70 km-es ingázási zónája
          </p>
        </div>
      </div>
      <KpiBar k={kpis} />
      <Suspense>
        <ExplorerFilters
          youthWindow={youthWindow}
          tiers={tiers}
          defaultKm={DEFAULT_MAX_KM}
          seasons={seasons}
          season={season}
        />
      </Suspense>
      {isPast && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          <History className="h-4 w-4 shrink-0" />
          A(z) {season} szezon adatait látod. Az életkor és a klub az akkori állapotot mutatja.
        </div>
      )}
      <PlayerTable rows={result.rows} total={result.total} f={f} sp={sp} seasonStart={seasonStart} />
    </div>
  );
}
