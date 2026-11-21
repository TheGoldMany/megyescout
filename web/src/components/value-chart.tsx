"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtValue } from "@/lib/utils";

type Point = { season: string; value_huf: number; source: "match" | "career"; club_name: string | null };

// Square markers: filled = computed from match reports, hollow = coarse estimate from the career rows.
function SquareDot(props: { cx?: number; cy?: number; payload?: Point }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;
  const career = payload?.source === "career";
  return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={career ? "#000" : "#F59E0B"} stroke="#F59E0B" strokeWidth={2} />;
}

export function ValueChart({ points }: { points: Point[] }) {
  if (points.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">Nincs értékbecslés.</p>;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#2a3038" vertical={false} />
          <XAxis dataKey="season" tick={{ fill: "#9AA0A6", fontSize: 11 }} axisLine={{ stroke: "#3b4450" }} tickLine={false} />
          <YAxis
            tickFormatter={(v: number) => fmtValue(v).replace(" Ft", "")}
            tick={{ fill: "#9AA0A6", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{ background: "#000", border: "1px solid #2a3038", borderRadius: 0, fontSize: 12 }}
            formatter={(v) => [fmtValue(Number(v)), "Becsült érték"]}
            labelFormatter={(label, p) => {
              const pt = p?.[0]?.payload as Point | undefined;
              return `${String(label)}${pt?.club_name ? ` · ${pt.club_name}` : ""}${pt?.source === "career" ? " (karrieradatokból)" : ""}`;
            }}
          />
          <Line type="stepAfter" dataKey="value_huf" stroke="#F59E0B" strokeWidth={2} dot={<SquareDot />} activeDot={<SquareDot />} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
