"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtValue } from "@/lib/utils";

type Point = { season: string; value_huf: number; source: "match" | "career"; club_name: string | null };

// Square markers: filled = computed from match reports, hollow = coarse estimate from the career rows.
function SquareDot(props: { cx?: number; cy?: number; payload?: Point }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;
  const career = payload?.source === "career";
  return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={career ? "#FFFFFF" : "#FFC414"} stroke="#000" strokeWidth={2.5} />;
}

export function ValueChart({ points }: { points: Point[] }) {
  if (points.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">Nincs értékbecslés.</p>;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="rgba(0,0,0,0.18)" vertical={false} />
          <XAxis dataKey="season" tick={{ fill: "#000", fontSize: 11 }} axisLine={{ stroke: "#000", strokeWidth: 2 }} tickLine={false} />
          <YAxis
            tickFormatter={(v: number) => fmtValue(v).replace(" Ft", "")}
            tick={{ fill: "#000", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{ background: "#fff", border: "3px solid #000", borderRadius: 0, boxShadow: "4px 4px 0 #000", fontSize: 12, color: "#000" }}
            formatter={(v) => [fmtValue(Number(v)), "Becsült érték"]}
            labelFormatter={(label, p) => {
              const pt = p?.[0]?.payload as Point | undefined;
              return `${String(label)}${pt?.club_name ? ` · ${pt.club_name}` : ""}${pt?.source === "career" ? " (karrieradatokból)" : ""}`;
            }}
          />
          <Line type="stepAfter" dataKey="value_huf" stroke="#000" strokeWidth={3} dot={<SquareDot />} activeDot={<SquareDot />} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
