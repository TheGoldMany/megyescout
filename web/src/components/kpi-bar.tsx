import { Users, Sparkles, Star, RefreshCw } from "lucide-react";
import { fmtDateTime, fmtInt } from "@/lib/utils";

type Kpis = {
  season: string;
  youthWindow: [number, number];
  tracked: number;
  youth: number;
  shortlisted: number;
  lastSync: string | null;
  lastSyncSource: string | null;
};

export function KpiBar({ k }: { k: Kpis }) {
  const items = [
    { icon: Users, label: "Követett játékosok", value: fmtInt(k.tracked), sub: `${k.season} szezon, felnőtt 11v11` },
    {
      icon: Sparkles,
      label: "Fiatalszabály-kiemeltek",
      value: fmtInt(k.youth),
      sub: `${k.youthWindow[0]}–${k.youthWindow[1]}-es születésűek, ≥270 perc, 70 km-en belül`,
    },
    { icon: Star, label: "Shortlist célpontok", value: fmtInt(k.shortlisted), sub: "Shortlist + tárgyalás alatt" },
    {
      icon: RefreshCw,
      label: "Utolsó MLSZ szinkron",
      value: fmtDateTime(k.lastSync),
      sub: k.lastSyncSource === "demo_seed" ? "demó adatok" : "adatbank.mlsz.hu",
      small: true,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 sm:gap-3">
      {items.map(({ icon: Icon, label, value, sub, small }) => (
        <div key={label} className="min-w-0 rounded-lg border bg-card p-2.5 sm:p-4">
          <div className="flex items-center gap-1.5 truncate text-[10px] font-semibold text-muted-foreground sm:gap-2 sm:text-[11px]">
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
            {label}
          </div>
          <div className={small ? "mt-1.5 truncate font-mono text-sm font-semibold sm:text-lg" : "mt-1 font-mono text-xl font-semibold sm:text-2xl"}>
            {value}
          </div>
          <div className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">{sub}</div>
        </div>
      ))}
    </div>
  );
}
