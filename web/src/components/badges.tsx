import { cn } from "@/lib/utils";
import { ARCHETYPE_HINT, ARCHETYPE_STYLE, POSITION_SHORT, POSITION_LABEL, STATUS_LABEL, STATUS_STYLE, type NoteStatus, type Position } from "@/lib/labels";
import { Tip } from "./ui/tooltip";

export function indexTone(v: number | null | undefined) {
  if (v === null || v === undefined) return "text-muted-foreground bg-secondary ring-border";
  if (v >= 75) return "text-emerald-800 bg-emerald-500/20 ring-emerald-400/50";
  if (v >= 60) return "text-emerald-800 bg-emerald-500/10 ring-emerald-500/30";
  if (v >= 45) return "text-amber-800 bg-amber-500/10 ring-amber-500/30";
  return "text-zinc-400 bg-zinc-500/10 ring-zinc-500/30";
}

export function IndexBadge({ value, className }: { value: number | null | undefined; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-9 items-center justify-center rounded-md px-1.5 font-mono text-sm font-semibold ring-1 ring-inset",
        indexTone(value),
        className,
      )}
    >
      {value ?? "–"}
    </span>
  );
}

/* Scouting Index as a square scoreboard tile: the fill rises from the bottom like a stand filling up. */
export function IndexRing({ value, size = 88 }: { value: number | null; size?: number }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = v >= 60 ? "#00D47C" : v >= 45 ? "#FFC414" : "#9AA0A6";
  return (
    <div
      className="relative shrink-0 border-[3px] border-black bg-black shadow-[4px_4px_0_var(--color-accent)]"
      style={{ width: size, height: size }}
      aria-label={`Scouting Index: ${value ?? "nincs"}`}
    >
      <div className="absolute inset-x-0 bottom-0 opacity-25" style={{ height: `${v}%`, background: color }} />
      <div className="absolute inset-x-0 h-0.5" style={{ bottom: `${v}%`, background: color }} />
      <div className="relative grid h-full place-items-center text-center leading-none">
        <div>
          <div className="font-display text-3xl font-bold" style={{ color }}>
            {value ?? "–"}
          </div>
          <div className="mt-0.5 text-[10px] text-white/70">index</div>
        </div>
      </div>
    </div>
  );
}

export function ArchetypeBadges({ tags, max = 3 }: { tags: string[] | null | undefined; max?: number }) {
  if (!tags?.length) return <span className="text-muted-foreground">–</span>;
  const shown = tags.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((t) => (
        <Tip key={t} content={ARCHETYPE_HINT[t] ?? t}>
          <span
            className={cn(
              "inline-flex cursor-default items-center rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              ARCHETYPE_STYLE[t] ?? "bg-secondary text-muted-foreground ring-border",
            )}
          >
            {t}
          </span>
        </Tip>
      ))}
      {tags.length > max && <span className="text-[11px] text-muted-foreground">+{tags.length - max}</span>}
    </div>
  );
}

export function PositionBadge({ pos, secondary }: { pos: Position | null; secondary?: Position | null }) {
  if (!pos) return <span className="text-muted-foreground">–</span>;
  return (
    <Tip content={`${POSITION_LABEL[pos]}${secondary ? ` / ${POSITION_LABEL[secondary]}` : ""} (becsült)`}>
      <span className="inline-flex cursor-default items-center gap-0.5 font-mono text-xs">
        <span className="rounded bg-secondary px-1 py-0.5">{POSITION_SHORT[pos]}</span>
        {secondary && <span className="text-muted-foreground">/{POSITION_SHORT[secondary]}</span>}
      </span>
    </Tip>
  );
}

export function StatusBadge({ status }: { status: NoteStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function OnOff({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">–</span>;
  const tone = value > 0.15 ? "text-emerald-800" : value < -0.15 ? "text-rose-700" : "text-muted-foreground";
  const s = value.toFixed(2).replace(".", ",");
  return (
    <span className={cn("font-mono text-xs", tone)}>
      {value > 0 ? "+" : ""}
      {s}
    </span>
  );
}

export function Stars({ value }: { value: number | null }) {
  return (
    <span className="font-mono text-sm tracking-tight text-black" aria-label={`${value ?? 0} csillag`}>
      {"★".repeat(value ?? 0)}
      <span className="text-black/25">{"★".repeat(5 - (value ?? 0))}</span>
    </span>
  );
}
