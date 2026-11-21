import Link from "next/link";
import { Activity } from "lucide-react";
import type { FormRow } from "@/lib/queries";
import { clubCase, cn, titleCase } from "@/lib/utils";
import { PositionBadge, StatusBadge } from "./badges";

function resultTone(gf: number, ga: number) {
  if (gf > ga) return "bg-emerald-500/20 text-emerald-800";
  if (gf === ga) return "bg-amber-500/20 text-amber-800";
  return "bg-rose-500/20 text-rose-700";
}

function fmtDate(d: string | null) {
  if (!d) return "–";
  return new Intl.DateTimeFormat("hu-HU", { month: "short", day: "numeric", timeZone: "Europe/Budapest" }).format(new Date(d));
}

/** "What did our targets do last weekend?" — one line per watched player, their club's latest match. */
export function RecentForm({ rows }: { rows: FormRow[] }) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-3 py-2 sm:px-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" /> Friss forma – a kiszemeltek legutóbbi meccse
        </h2>
        <span className="text-[11px] text-muted-foreground">csapatuk utolsó lejátszott mérkőzése alapján</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          Még nincs megfigyelt játékos – a játékos-adatlapon a klub-széfben veheted fel őket.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r) => (
                <tr key={r.player_id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pl-3 pr-2 sm:pl-4">
                    <Link href={`/players/${r.player_id}`} className="font-medium hover:text-primary">
                      {titleCase(r.full_name)}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <PositionBadge pos={r.primary_position} />
                      <StatusBadge status={r.status} />
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-2 font-mono text-muted-foreground sm:table-cell">
                    {fmtDate(r.match_date)}
                    {r.round_number ? ` · ${r.round_number}. ford.` : ""}
                  </td>
                  <td className="max-w-[240px] px-2">
                    <div className="truncate">
                      {clubCase(r.club_name)} <span className="text-muted-foreground">{r.is_home ? "vs" : "@"}</span>{" "}
                      {clubCase(r.opponent)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{r.competition_short}</div>
                  </td>
                  <td className="whitespace-nowrap px-2 font-mono">
                    <span className={cn("mr-1 inline-block rounded px-1 text-[10px]", resultTone(r.goals_for, r.goals_against))}>
                      {r.goals_for}–{r.goals_against}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pl-2 pr-3 text-right sm:pr-4">
                    {r.played ? (
                      <span className="inline-flex items-center gap-1.5 font-mono">
                        <span className={cn(r.is_starter ? "text-foreground" : "text-sky-800")}>
                          {r.is_starter ? "Kezdő" : `Csere ${r.minute_in}′`}
                        </span>
                        <span className="text-muted-foreground">{r.minutes_played}′</span>
                        {(r.goals ?? 0) > 0 && <span className="text-emerald-800">{r.goals} gól</span>}
                        {(r.yellow_cards ?? 0) > 0 && <span className="inline-block h-3 w-2 rounded-[1px] bg-yellow-400" />}
                        {(r.red_cards ?? 0) > 0 && <span className="inline-block h-3 w-2 rounded-[1px] bg-red-500" />}
                      </span>
                    ) : (
                      <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700 ring-1 ring-inset ring-rose-500/30">
                        Nem lépett pályára
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
