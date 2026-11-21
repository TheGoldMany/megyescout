"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { RADAR_AXES, type RadarVector } from "@/lib/labels";

const COLORS = ["#00A862", "#000000", "#FF4B3E", "#2F5BFF"];

export type RadarSeries = { name: string; values: RadarVector | null; dashed?: boolean };

const SHORT: Record<string, string> = {
  minutes_stability: "Játékperc",
  goal_threat: "Gólveszély",
  team_impact: "On/Off",
  discipline: "Fegyelem",
  league_level: "Liga-szint",
  experience: "Pedigré",
};

export function PlayerRadar({ series, height = 320 }: { series: RadarSeries[]; height?: number }) {
  const data = RADAR_AXES.map((a) => {
    const row: Record<string, string | number> = { axis: SHORT[a.key], full: a.label };
    series.forEach((s, i) => {
      row[`s${i}`] = s.values ? Math.round(Number(s.values[a.key]) || 0) : 0;
    });
    return row;
  });
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="rgba(0,0,0,0.3)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#000", fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
          {series.map((s, i) => (
            <Radar
              key={s.name}
              name={s.name}
              dataKey={`s${i}`}
              stroke={s.dashed ? "#464B52" : COLORS[i % COLORS.length]}
              fill={s.dashed ? "#464B52" : COLORS[i % COLORS.length]}
              fillOpacity={s.dashed ? 0.05 : i === 0 ? 0.3 : 0.12}
              strokeDasharray={s.dashed ? "4 4" : undefined}
              strokeWidth={s.dashed ? 1.5 : 2}
              isAnimationActive={false}
            />
          ))}
          <Tooltip
            contentStyle={{ background: "#fff", border: "3px solid #000", borderRadius: 0, boxShadow: "4px 4px 0 #000", fontSize: 12, color: "#000" }}
            labelFormatter={(_, p) => (p?.[0]?.payload?.full as string) ?? ""}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#000" }} iconType="square" iconSize={8} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
