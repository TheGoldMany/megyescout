import { Suspense } from "react";
import { redirect } from "next/navigation";
import { KpiBar } from "@/components/kpi-bar";
import { ExplorerFilters } from "@/components/explorer-filters";
import { PlayerTable } from "@/components/player-table";
import { getKpis, getTiers, searchPlayers } from "@/lib/queries";
import { DEFAULT_MAX_KM, parseFilters, type RawParams } from "@/lib/filters";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ExplorerPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const sp = await searchParams;
  const f = parseFilters(sp);
  const [kpis, tiers, result] = await Promise.all([
    getKpis(session.workspaceId),
    getTiers(),
    searchPlayers(session.workspaceId, f),
  ]);
  const seasonStart = Number(kpis.season.slice(0, 4)) || new Date().getFullYear();

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
        <ExplorerFilters youthWindow={kpis.youthWindow} tiers={tiers} defaultKm={DEFAULT_MAX_KM} />
      </Suspense>
      <PlayerTable rows={result.rows} total={result.total} f={f} sp={sp} seasonStart={seasonStart} />
    </div>
  );
}
