import { redirect } from "next/navigation";
import Link from "next/link";
import { getShortlist } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { POSITION_LABEL, STATUS_LABEL, STATUS_ORDER, type NoteStatus, type Position } from "@/lib/labels";
import { ShortlistBoard } from "./shortlist-board";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Igazolási tábla" };

export default async function ShortlistPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { group = "status" } = await searchParams;
  const rows = await getShortlist(session.workspaceId);

  const byStatus = group !== "position";
  const columns = byStatus
    ? STATUS_ORDER.map((s) => ({ key: s, label: STATUS_LABEL[s], rows: rows.filter((r) => r.status === s) }))
    : (["GK", "DEF", "MID", "FWD"] as Position[]).map((p) => ({
        key: p,
        label: POSITION_LABEL[p],
        rows: rows.filter((r) => r.primary_position === p && r.status !== "rejected"),
      }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Lajosmizsei VLC · Igazolási tábla</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {rows.length} megfigyelt játékos · a jegyzetek csak a klub stábja számára láthatók
          </p>
        </div>
        <div className="inline-flex rounded-md bg-secondary p-1 text-xs">
          {[
            ["status", "Státusz szerint"],
            ["position", "Poszt szerint"],
          ].map(([k, label]) => (
            <Link
              key={k}
              href={`/shortlist?group=${k}`}
              className={cn(
                "rounded px-3 py-1 font-medium text-muted-foreground",
                (group === k || (k === "status" && group !== "position")) && "bg-card text-foreground shadow",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
      <ShortlistBoard columns={columns as { key: NoteStatus | Position; label: string; rows: typeof rows }[]} />
    </div>
  );
}
