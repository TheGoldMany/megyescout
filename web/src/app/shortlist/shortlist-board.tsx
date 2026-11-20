"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { GitCompare, Pencil, Check, X } from "lucide-react";
import type { ShortlistRow } from "@/lib/queries";
import { STATUS_LABEL, type NoteStatus } from "@/lib/labels";
import { quickStatusAction } from "@/app/actions";
import { IndexBadge, PositionBadge, Stars } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { clubCase, cn, fmtNum, titleCase } from "@/lib/utils";

type Column = { key: string; label: string; rows: ShortlistRow[] };
const STATUSES: NoteStatus[] = ["radar", "watching", "shortlist", "contacted", "rejected"];

export function ShortlistBoard({ columns }: { columns: Column[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {columns.map((col) => (
          <section key={col.key} className="flex flex-col rounded-lg border bg-card/60">
            <header className="flex items-center justify-between border-b px-3 py-2">
              <h2 className="text-sm font-semibold">{col.label}</h2>
              <span className="rounded bg-secondary px-1.5 font-mono text-xs text-muted-foreground">{col.rows.length}</span>
            </header>
            <div className="flex-1 space-y-2 p-2">
              {col.rows.map((r) => (
                <ShortlistCard key={r.id} r={r} selected={selected.includes(r.player_id)} onToggle={() => toggle(r.player_id)} />
              ))}
              {col.rows.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Üres</p>}
            </div>
          </section>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border bg-card px-4 py-2 shadow-2xl">
          <span className="text-xs text-muted-foreground">{selected.length} kiválasztva (max. 4)</span>
          <Button asChild size="sm" disabled={selected.length < 2}>
            <Link href={`/compare?ids=${selected.join(",")}`} aria-disabled={selected.length < 2} className={cn(selected.length < 2 && "pointer-events-none opacity-50")}>
              <GitCompare /> Összehasonlítás
            </Link>
          </Button>
          <button onClick={() => setSelected([])} className="text-muted-foreground hover:text-foreground" aria-label="Kijelölés törlése">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

function ShortlistCard({ r, selected, onToggle }: { r: ShortlistRow; selected: boolean; onToggle: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.notes ?? "");
  const [pending, start] = useTransition();

  return (
    <article className={cn("rounded-md border bg-background/50 p-2.5 text-sm transition", selected && "border-primary/60 ring-1 ring-primary/40")}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 accent-emerald-500"
          aria-label="Kijelölés összehasonlításhoz"
        />
        <div className="min-w-0 flex-1">
          <Link href={`/players/${r.player_id}`} className="block truncate font-medium hover:text-primary">
            {titleCase(r.full_name)}
          </Link>
          <div className="truncate text-[11px] text-muted-foreground">
            {r.club_name ? clubCase(r.club_name) : "–"} · {r.distance_km !== null ? `${fmtNum(r.distance_km, 0)} km` : "?"}
          </div>
        </div>
        <IndexBadge value={r.scouting_index} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        <PositionBadge pos={r.primary_position} />
        {r.birth_year && <span className="font-mono text-muted-foreground">{r.birth_year}</span>}
        <span className="text-muted-foreground">{r.competition_short}</span>
        <span className="ml-auto">
          <Stars value={r.rating} />
        </span>
      </div>

      {editing ? (
        <div className="mt-2 space-y-1.5">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[70px] text-xs" autoFocus />
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => { setText(r.notes ?? ""); setEditing(false); }}>
              Mégse
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await quickStatusAction(r.player_id, r.status, text.trim() || null);
                  setEditing(false);
                })
              }
            >
              <Check /> Mentés
            </Button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="group mt-2 block w-full text-left text-xs text-muted-foreground">
          <span className="line-clamp-3">{r.notes || <em>Nincs jegyzet – kattints a szerkesztéshez</em>}</span>
          <Pencil className="mt-0.5 hidden h-3 w-3 group-hover:inline" />
        </button>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Státusz</span>
        <select
          value={r.status}
          disabled={pending}
          onChange={(e) => start(() => quickStatusAction(r.player_id, e.target.value))}
          className="h-7 rounded border border-input bg-background px-1 text-[11px]"
          aria-label="Státusz módosítása"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {r.author_name && <div className="mt-1 truncate text-[10px] text-muted-foreground">{r.author_name}</div>}
    </article>
  );
}
