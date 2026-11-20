import { getShortlist } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { POSITION_LABEL, STATUS_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

// Hungarian Excel expects ";" separators, "," decimals and a UTF-8 BOM to show accents correctly.
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
  // neutralise spreadsheet formulas in free-text fields (CSV injection)
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Nincs bejelentkezve", { status: 401 });
  const rows = await getShortlist(session.workspaceId);

  const header = [
    "Név", "Születési év", "Poszt", "Klub", "Liga", "Távolság (km)", "Scouting Index", "Játékperc (%)", "Gól",
    "Státusz", "Értékelés", "Jegyzet", "Videó", "Szerző", "Frissítve",
  ];
  const lines = rows.map((r) =>
    [
      r.full_name,
      r.birth_year,
      r.primary_position ? POSITION_LABEL[r.primary_position] : "",
      r.club_name,
      r.competition_short,
      r.distance_km,
      r.scouting_index,
      r.minutes_share_pct,
      r.goals,
      STATUS_LABEL[r.status],
      r.rating,
      r.notes,
      r.video_url,
      r.author_name,
      r.updated_at?.slice(0, 16),
    ]
      .map(cell)
      .join(";"),
  );
  const body = "﻿" + [header.join(";"), ...lines].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lajosmizse-igazolasi-tabla-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
