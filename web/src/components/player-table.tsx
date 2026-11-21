import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import type { ExplorerRow, Filters, SortKey } from "@/lib/queries";
import { PAGE_SIZE } from "@/lib/queries";
import { clubCase, cn, fmtNum, titleCase } from "@/lib/utils";
import { ArchetypeBadges, IndexBadge, OnOff, PositionBadge, StatusBadge } from "./badges";
import { Tip } from "./ui/tooltip";
import { ValueTag } from "./stadium";
import type { RawParams } from "@/lib/filters";

function href(sp: RawParams, patch: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") next.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) next.delete(k);
    else next.set(k, v);
  }
  return `/explorer?${next.toString()}`;
}

function SortHead({
  label,
  k,
  f,
  sp,
  className,
  hint,
}: {
  label: string;
  k: SortKey;
  f: Filters;
  sp: RawParams;
  className?: string;
  hint?: string;
}) {
  const active = f.sort === k;
  // names/age/distance sort ascending first, metrics descending first
  const firstDir = ["name", "km", "tier"].includes(k) ? "asc" : k === "age" ? "desc" : "desc";
  const dir = active ? (f.dir === "asc" ? "desc" : "asc") : firstDir;
  const link = (
    <Link
      href={href(sp, { sort: k, dir, page: undefined })}
      scroll={false}
      className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
    >
      {label}
      {active && (f.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </Link>
  );
  return (
    <th className={cn("whitespace-nowrap px-2 py-2 text-left font-medium", className)}>
      {hint ? <Tip content={hint}>{link}</Tip> : link}
    </th>
  );
}

export function PlayerTable({
  rows,
  total,
  f,
  sp,
  seasonStart,
}: {
  rows: ExplorerRow[];
  total: number;
  f: Filters;
  sp: RawParams;
  seasonStart: number;
}) {
  const page = f.page ?? 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground sm:px-4">
        <span>
          <span className="font-mono text-foreground">{total}</span> játékos a szűrésnek megfelelően
        </span>
        <span className="hidden sm:inline">Kattints egy oszlopfejre a rendezéshez</span>
      </div>

      {/* desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-[11px] font-semibold text-muted-foreground">
            <tr className="border-b">
              <SortHead label="Név" k="name" f={f} sp={sp} className="pl-4" />
              <SortHead label="Kor" k="age" f={f} sp={sp} />
              <th className="px-2 py-2 text-left font-medium">Poszt</th>
              <SortHead label="Klub · km" k="km" f={f} sp={sp} />
              <SortHead label="Liga" k="tier" f={f} sp={sp} />
              <SortHead label="Perc (%)" k="minutes" f={f} sp={sp} hint="Összes játékperc és a csapat játékperceinek kihasznált aránya" />
              <SortHead label="Gól" k="goals" f={f} sp={sp} hint="Az MLSZ jegyzőkönyvek gólpasszt nem rögzítenek, ezért csak gól szerepel" />
              <SortHead label="G/90" k="g90" f={f} sp={sp} />
              <SortHead label="On/Off" k="onoff" f={f} sp={sp} hint="Csapat pont/meccs átlaga vele (≥60 perc) mínusz nélküle" />
              <th className="px-2 py-2 text-left font-medium">Szerepkör</th>
              <SortHead label="Érték" k="value" f={f} sp={sp} hint="Becsült piaci érték (Megyescout-becslés)" />
              <SortHead label="Index" k="index" f={f} sp={sp} className="pr-4" hint="Scouting Index 0–100: liga-erősség 35%, életkor 25%, teljesítmény 25%, pedigré 15%" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.player_id} className="border-b border-border/60 transition hover:bg-secondary/40">
                <td className="py-2 pl-4 pr-2">
                  <Link href={playerHref(r.player_id, sp)} className="group flex items-center gap-1.5 font-medium">
                    <span className="group-hover:text-primary">{titleCase(r.full_name)}</span>
                    {r.has_academy_pedigree && (
                      <Tip content="Akadémiai előélet">
                        <GraduationCap className="h-3.5 w-3.5 text-sky-800" />
                      </Tip>
                    )}
                  </Link>
                  {r.note_status && (
                    <div className="mt-0.5">
                      <StatusBadge status={r.note_status} />
                    </div>
                  )}
                </td>
                <td className="px-2 font-mono text-xs">
                  {r.birth_year ? (
                    <>
                      {seasonStart - r.birth_year}
                      <span className="text-muted-foreground"> ({String(r.birth_year).slice(2)})</span>
                    </>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="px-2">
                  <PositionBadge pos={r.primary_position} secondary={r.secondary_position} />
                </td>
                <td className="max-w-[220px] px-2">
                  <div className="truncate">{r.club_name ? clubCase(r.club_name) : "–"}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {r.distance_km !== null ? `${fmtNum(r.distance_km, 0)} km` : "ismeretlen hely"}
                    {r.club_city ? ` · ${r.club_city}` : ""}
                  </div>
                </td>
                <td className="whitespace-nowrap px-2 text-xs text-muted-foreground">{r.competition_short ?? r.competition_name}</td>
                <td className="px-2 font-mono text-xs">
                  {r.total_minutes}′
                  <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, r.minutes_share_pct ?? 0)}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{fmtNum(r.minutes_share_pct, 0)}%</span>
                </td>
                <td className="px-2 font-mono text-xs">{r.goals}</td>
                <td className="px-2 font-mono text-xs">{fmtNum(r.goals_per_90)}</td>
                <td className="px-2">
                  <OnOff value={r.on_off_impact} />
                </td>
                <td className="px-2">
                  <ArchetypeBadges tags={r.archetypes} max={2} />
                </td>
                <td className="whitespace-nowrap px-2">
                  <ValueTag value={r.market_value_huf} prev={r.prev_market_value_huf} size="sm" />
                </td>
                <td className="py-2 pl-2 pr-4">
                  <IndexBadge value={r.scouting_index} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards (sideline use) */}
      <ul className="divide-y md:hidden">
        {rows.map((r) => (
          <li key={r.player_id}>
            <Link href={playerHref(r.player_id, sp)} className="flex items-center gap-3 px-3 py-2.5 active:bg-secondary/60">
              <IndexBadge value={r.scouting_index} className="h-10 min-w-11 text-base" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="truncate">{titleCase(r.full_name)}</span>
                  {r.has_academy_pedigree && <GraduationCap className="h-3.5 w-3.5 shrink-0 text-sky-800" />}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.birth_year ? `${seasonStart - r.birth_year} év · ` : ""}
                  {r.club_name ? clubCase(r.club_name) : "–"} · {r.distance_km !== null ? `${fmtNum(r.distance_km, 0)} km` : "?"}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <PositionBadge pos={r.primary_position} />
                  <span className="font-mono text-muted-foreground">
                    {r.total_minutes}′ · {r.goals} gól
                  </span>
                  <OnOff value={r.on_off_impact} />
                </div>
              </div>
              <ValueTag value={r.market_value_huf} size="sm" />
              {r.note_status && <StatusBadge status={r.note_status} />}
            </Link>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          Nincs a szűrésnek megfelelő játékos. Próbáld növelni a távolságot vagy csökkenteni a minimum játékpercet.
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs sm:px-4">
          <span className="text-muted-foreground">
            {page}. / {pages} oldal
          </span>
          <div className="flex gap-1">
            <Link
              aria-disabled={page <= 1}
              href={href(sp, { page: String(Math.max(1, page - 1)) })}
              className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-secondary", page <= 1 && "pointer-events-none opacity-40")}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Előző
            </Link>
            <Link
              aria-disabled={page >= pages}
              href={href(sp, { page: String(Math.min(pages, page + 1)) })}
              className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-secondary", page >= pages && "pointer-events-none opacity-40")}
            >
              Következő <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** Keep the season context when opening a profile from a past-season list. */
function playerHref(id: string, sp: RawParams) {
  return typeof sp.season === "string" ? `/players/${id}?season=${encodeURIComponent(sp.season)}` : `/players/${id}`;
}
