import Link from "next/link";
import { getLeagues } from "@/lib/queries";
import { sessionOrLogin } from "@/lib/session";
import { SectorHeading } from "@/components/stadium";
import { TIER_LABEL } from "@/lib/labels";
import { clubCase, fmtValue } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bajnokságok" };

export default async function LeaguesPage() {
  await sessionOrLogin("/leagues");
  const leagues = await getLeagues();
  const tiers = [...new Set(leagues.map((l) => l.tier))];
  return (
    <div className="space-y-8">
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Bajnokságok</h1>
      {tiers.map((tier, i) => (
        <section key={tier}>
          <SectorHeading sector={String.fromCharCode(65 + i)} title={TIER_LABEL[tier] ?? `${tier}. szint`} />
          <div className="overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead className="bg-black text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Bajnokság</th>
                  <th className="px-2 py-2 font-medium">Szövetség</th>
                  <th className="px-2 py-2 text-right font-medium">Klub</th>
                  <th className="px-2 py-2 text-right font-medium">Meccs</th>
                  <th className="px-2 py-2 font-medium">Éllovas</th>
                  <th className="px-3 py-2 text-right font-medium">Összérték</th>
                </tr>
              </thead>
              <tbody>
                {leagues
                  .filter((l) => l.tier === tier)
                  .map((l) => (
                    <tr key={l.competition_id} className="border-t border-border hover:bg-secondary/50">
                      <td className="px-3 py-2">
                        <Link href={`/leagues/${l.competition_id}`} className="font-display text-lg font-semibold hover:text-accent">
                          {l.name}
                        </Link>
                      </td>
                      <td className="px-2 text-muted-foreground">{l.federation ?? "–"}</td>
                      <td className="px-2 text-right font-display text-base">{l.clubs}</td>
                      <td className="px-2 text-right font-display text-base">{l.matches}</td>
                      <td className="px-2">
                        {l.leader_id ? (
                          <Link href={`/clubs/${l.leader_id}`} className="hover:text-accent">
                            {clubCase(l.leader_name ?? "")}
                          </Link>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="px-3 text-right">
                        <span className="bg-black px-1.5 font-display text-base font-semibold text-accent">{fmtValue(l.total_value_huf)}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {leagues.length === 0 && <p className="text-sm text-muted-foreground">Még nincs betöltött bajnokság.</p>}
    </div>
  );
}
