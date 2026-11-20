import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCompare } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerRadar } from "@/components/radar-chart";
import { ArchetypeBadges, IndexBadge, OnOff, PositionBadge } from "@/components/badges";
import { clubCase, fmtNum, titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Összehasonlítás" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { ids = "" } = await searchParams;
  const players = await getCompare(session.workspaceId, ids.split(","));
  const seasonStart = players[0]?.season ? Number(players[0].season.slice(0, 4)) : new Date().getFullYear();

  const rows: [string, (p: (typeof players)[number]) => React.ReactNode][] = [
    ["Index", (p) => <IndexBadge value={p.scouting_index} />],
    ["Kor", (p) => (p.birth_year ? `${seasonStart - p.birth_year} (${p.birth_year})` : "–")],
    ["Poszt", (p) => <PositionBadge pos={p.primary_position} secondary={p.secondary_position} />],
    ["Klub", (p) => (p.club_name ? clubCase(p.club_name) : "–")],
    ["Távolság", (p) => (p.distance_km !== null ? `${fmtNum(p.distance_km, 0)} km` : "–")],
    ["Liga", (p) => p.competition_short ?? p.competition_name],
    ["Meccs / kezdő", (p) => `${p.matches_played} / ${p.starts}`],
    ["Játékperc", (p) => `${p.total_minutes}′ (${fmtNum(p.minutes_share_pct, 0)}%)`],
    ["Gól (G/90)", (p) => `${p.goals} (${fmtNum(p.goals_per_90)})`],
    ["On/Off", (p) => <OnOff value={p.on_off_impact} />],
    ["Szerepkör", (p) => <ArchetypeBadges tags={p.archetypes} max={4} />],
  ];

  return (
    <div className="space-y-4">
      <Link href="/shortlist" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Vissza az igazolási táblához
      </Link>
      <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Játékos-összehasonlítás</h1>
      {players.length < 2 ? (
        <p className="text-sm text-muted-foreground">Válassz ki legalább két játékost az igazolási táblán.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Radar egymásra vetítve</CardTitle>
            </CardHeader>
            <CardContent>
              <PlayerRadar height={380} series={players.map((p) => ({ name: titleCase(p.full_name), values: p.radar_vector }))} />
            </CardContent>
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th />
                  {players.map((p) => (
                    <th key={p.player_id} className="px-3 py-3 text-left font-semibold">
                      <Link href={`/players/${p.player_id}`} className="hover:text-primary">
                        {titleCase(p.full_name)}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, render]) => (
                  <tr key={label} className="border-b border-border/50 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{label}</td>
                    {players.map((p) => (
                      <td key={p.player_id} className="px-3 py-2 text-xs">
                        {render(p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
