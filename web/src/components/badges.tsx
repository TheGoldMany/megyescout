import { cn } from "@/lib/utils";
import { ARCHETYPE_HINT, ARCHETYPE_STYLE, POSITION_SHORT, POSITION_LABEL, STATUS_LABEL, STATUS_STYLE, type NoteStatus, type Position } from "@/lib/labels";
import { Tip } from "./ui/tooltip";

export function indexTone(v: number | null | undefined) {
  if (v === null || v === undefined) return "text-muted-foreground bg-secondary ring-border";
  if (v >= 75) return "text-emerald-200 bg-emerald-500/20 ring-emerald-400/50";
  if (v >= 60) return "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30";
  if (v >= 45) return "text-amber-300 bg-amber-500/10 ring-amber-500/30";
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

export function IndexRing({ value, size = 88 }: { value: number | null; size?: number }) {
  const v = value ?? 0;
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const color = v >= 60 ? "#10B981" : v >= 45 ? "#F59E0B" : "#6B7280";
  return (
    <div className="relative" style={{ width: size, height: size }} aria-label={`Scouting Index: ${value ?? "nincs"}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#1F2937" strokeWidth={7} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <div className="font-mono text-2xl font-bold">{value ?? "–"}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">Index</div>
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
  const tone = value > 0.15 ? "text-emerald-400" : value < -0.15 ? "text-rose-400" : "text-muted-foreground";
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
    <span className="font-mono text-xs tracking-tight text-accent" aria-label={`${value ?? 0} csillag`}>
      {"★".repeat(value ?? 0)}
      <span className="text-zinc-700">{"★".repeat(5 - (value ?? 0))}</span>
    </span>
  );
}
