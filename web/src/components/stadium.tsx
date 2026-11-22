import Link from "next/link";
import type { ReactNode } from "react";
import { cn, clubCase, fmtDeltaPct, fmtValue, titleCase } from "@/lib/utils";
import { POSITION_LABEL, type Position } from "@/lib/labels";

/* --------------------------------------------------------------------------------------------
 * Section heading: a yellow marker, the title in plain sentence case and a black rule to the right edge.
 * `sector` only names the in-page anchor (#szektor-a); it is not shown (single letters confused readers).
 * ------------------------------------------------------------------------------------------ */
export function SectorHeading({
  sector,
  title,
  sub,
  action,
}: {
  sector: string;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div id={`szektor-${sector.toLowerCase()}`} className="mb-3 flex scroll-mt-28 items-end gap-3">
      <span aria-hidden className="mb-1 h-5 w-5 shrink-0 border-[3px] border-black bg-accent" />
      <div className="min-w-0">
        <h2 className="font-display text-3xl font-extrabold leading-none tracking-tight">{title}</h2>
        {sub && <p className="mt-1 text-xs font-medium text-muted-foreground">{sub}</p>}
      </div>
      <div className="mb-2 h-[3px] flex-1 bg-black" />
      {action && <div className="mb-0.5 shrink-0 text-sm">{action}</div>}
    </div>
  );
}

/* Scoreboard figure: floodlight-amber condensed digits on a black panel. */
export function ValueTag({
  value,
  prev,
  size = "md",
  className,
  title = "Becsült piaci érték: a Megyescout számítása az MLSZ-jegyzőkönyvekből, nem hivatalos ár",
}: {
  value: number | null | undefined;
  prev?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  title?: string;
}) {
  const delta = fmtDeltaPct(value ?? null, prev ?? null);
  const up = value && prev ? value >= prev : null;
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", className)} title={title}>
      <span
        className={cn(
          "border-2 border-black bg-black px-1.5 font-display font-bold text-accent",
          size === "lg" ? "text-3xl leading-tight" : size === "md" ? "text-lg leading-snug" : "text-sm",
        )}
      >
        {fmtValue(value)}
      </span>
      {delta && (
        <span className={cn("border-2 border-black px-1 font-display text-xs font-bold text-black", up ? "bg-primary" : "bg-seat")}>
          {up ? "▲" : "▼"} {delta}
        </span>
      )}
    </span>
  );
}

/* Club crest: an angular shield (no curves) in deterministic "club colours", or the MLSZ logo. */
const CREST_COLOURS: [string, string][] = [
  ["#1f4e8c", "#ededE6"],
  ["#b3261e", "#ededE6"],
  ["#0f6b3e", "#f5d90a"],
  ["#5b2a86", "#ededE6"],
  ["#1b1f27", "#f59e0b"],
  ["#c2410c", "#111827"],
  ["#0e7490", "#ededE6"],
  ["#7a5b0b", "#111827"],
];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function initials(name: string) {
  const words = name
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(se|fc|lc|sc|te|kse|vse|tk)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || name.slice(0, 2)).toUpperCase();
}

export function ClubCrest({ name, logoUrl, size = 36 }: { name: string; logoUrl?: string | null; size?: number }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" width={size} height={size} className="shrink-0 border-2 border-black bg-white object-contain p-0.5" style={{ width: size, height: size }} />;
  }
  const [bg, fg] = CREST_COLOURS[hash(name) % CREST_COLOURS.length];
  return (
    <span
      aria-hidden
      className="relative grid shrink-0 place-items-center font-display font-bold"
      style={{
        width: size,
        height: size * 1.12,
        background: `linear-gradient(90deg, ${bg} 0 38%, ${fg} 38% 62%, ${bg} 62%)`,
        clipPath: "polygon(0 0, 100% 0, 100% 64%, 50% 100%, 0 64%)",
        color: fg,
        fontSize: size * 0.34,
      }}
    >
      <span className="mt-[-22%] bg-black/70 px-0.5 leading-none text-white">{initials(name)}</span>
    </span>
  );
}

export function ClubLink({ id, name, className }: { id: string | null; name: string | null; className?: string }) {
  const label = name ? clubCase(name) : "–";
  if (!id) return <span className={className}>{label}</span>;
  return (
    <Link href={`/clubs/${id}`} className={cn("hover:bg-accent hover:text-black hover:underline", className)}>
      {label}
    </Link>
  );
}

/* --------------------------------------------------------------------------------------------
 * Top players: a plain ranking by estimated market value. The three highest get large cards, the
 * rest a numbered list. Positions are written out in full; no metaphors that need explaining.
 * ------------------------------------------------------------------------------------------ */
type Ranked = {
  player_id: string;
  full_name: string;
  birth_year: number | null;
  primary_position: Position | null;
  club_name: string | null;
  competition_short: string | null;
  market_value_huf: number | null;
  prev_market_value_huf: number | null;
};

function playerLine(p: Ranked, seasonStart: number) {
  return [
    p.club_name ? clubCase(p.club_name) : null,
    p.primary_position ? POSITION_LABEL[p.primary_position] : null,
    p.birth_year ? `${seasonStart - p.birth_year} éves` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export function TopPlayers({ players, seasonStart, season }: { players: Ranked[]; seasonStart: number; season: string }) {
  const podium = players.slice(0, 3);
  const rest = players.slice(3, 15);
  return (
    <section aria-labelledby="top-players" className="border-[3px] border-black bg-white shadow-[8px_8px_0_#000]">
      <div className="truss relative h-6 border-t-0" aria-hidden>
        <div className="lamps floodlight-on absolute -bottom-3 left-3 h-6 w-14" />
        <div className="lamps floodlight-on absolute -bottom-3 right-3 h-6 w-14" />
      </div>
      <div className="px-3 pb-4 pt-6 sm:px-5">
        <h2 id="top-players" className="font-display text-3xl font-extrabold leading-none sm:text-4xl">
          A 15 legértékesebb játékos
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Becsült piaci érték szerint, a {season} szezon jegyzőkönyvei alapján.{" "}
          <Link href="/modszertan" className="nb-mark font-semibold underline decoration-2 underline-offset-4">
            Hogyan számoljuk?
          </Link>
        </p>
        <ol aria-label="A legértékesebb játékosok" className="mt-4 space-y-4">
          <li className="list-none">
            <ol className="grid gap-3 sm:grid-cols-3">
              {podium.map((p, i) => (
                <li key={p.player_id}>
                  <Link
                    href={`/players/${p.player_id}`}
                    className={cn(
                      "nb-press flex h-full flex-col gap-1 border-[3px] border-black p-3",
                      i === 0 ? "bg-accent" : "bg-white",
                    )}
                  >
                    <span className="font-display text-4xl font-extrabold leading-none">{i + 1}.</span>
                    <span className="text-xl font-bold leading-tight">{titleCase(p.full_name)}</span>
                    <span className="text-sm">{playerLine(p, seasonStart)}</span>
                    <ValueTag value={p.market_value_huf} prev={p.prev_market_value_huf} size="md" className="mt-1" />
                  </Link>
                </li>
              ))}
            </ol>
          </li>
          {rest.length > 0 && (
            <li className="list-none">
              <ol start={4} className="divide-y-2 divide-black border-[3px] border-black">
                {rest.map((p, i) => (
                  <li key={p.player_id}>
                    <Link
                      href={`/players/${p.player_id}`}
                      className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 px-3 py-2 hover:bg-[#fff6cc]"
                    >
                      <span className="font-display text-2xl font-extrabold">{i + 4}.</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{titleCase(p.full_name)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{playerLine(p, seasonStart)}</span>
                      </span>
                      <ValueTag value={p.market_value_huf} prev={p.prev_market_value_huf} size="sm" />
                    </Link>
                  </li>
                ))}
              </ol>
            </li>
          )}
        </ol>
      </div>
      <div className="pitch h-4 border-t-[3px] border-black" aria-hidden />
    </section>
  );
}

/* --------------------------------------------------------------------------------------------
 * Pitch: the squad lined up by position on chalk-lined grass (rectangles only, no centre circle).
 * ------------------------------------------------------------------------------------------ */
type PitchPlayer = { player_id: string; full_name: string; primary_position: Position | null; market_value_huf: number | null };

export function Pitch({ players }: { players: PitchPlayer[] }) {
  const lines: Position[] = ["FWD", "MID", "DEF", "GK"];
  return (
    <div className="pitch relative border-[3px] border-black p-3 shadow-[6px_6px_0_#000]">
      {/* chalk: halfway line and the two penalty boxes */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 bg-white/80" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[16%] w-[44%] -translate-x-1/2 border-[3px] border-t-0 border-white/80" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 h-[16%] w-[44%] -translate-x-1/2 border-[3px] border-b-0 border-white/80" />
      <div className="relative grid gap-4 py-2">
        {lines.map((pos) => {
          const row = players.filter((p) => p.primary_position === pos).slice(0, pos === "GK" ? 2 : 6);
          return (
            <div key={pos} className="flex flex-wrap items-stretch justify-center gap-1.5">
              {row.length === 0 && <span className="bg-white/80 px-1 text-xs font-semibold text-black">nincs {POSITION_LABEL[pos].toLowerCase()}</span>}
              {row.map((p) => (
                <Link
                  key={p.player_id}
                  href={`/players/${p.player_id}`}
                  className="nb-press min-w-[104px] border-[3px] border-black bg-white px-2 py-1 text-center"
                >
                  <div className="truncate text-xs font-semibold">{titleCase(p.full_name)}</div>
                  <div className="font-display text-sm font-bold">{fmtValue(p.market_value_huf)}</div>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------------------------
 * Standings: a scoreboard table. Form letters are the scoreboard's lamps.
 * ------------------------------------------------------------------------------------------ */
type Standing = {
  club_id: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  form: string[];
  squad_value_huf: number;
};

const FORM_TONE: Record<string, string> = {
  GY: "bg-primary text-primary-foreground",
  D: "bg-accent text-accent-foreground",
  V: "bg-seat text-black",
};

export function StandingsTable({ rows, highlight, compact = false }: { rows: Standing[]; highlight?: string; compact?: boolean }) {
  return (
    <div className="overflow-x-auto border-[3px] border-black bg-white shadow-[4px_4px_0_#000]">
      <table className="w-full text-sm">
        <thead className="bg-black text-left text-xs text-white">
          <tr>
            <th className="w-8 px-2 py-2 text-right font-medium">#</th>
            <th className="px-2 py-2 font-medium">Klub</th>
            <th className="px-1.5 py-2 text-right font-medium" title="Lejátszott mérkőzés">M</th>
            {!compact && (
              <>
                <th className="px-1.5 py-2 text-right font-medium" title="Győzelem">Gy</th>
                <th className="px-1.5 py-2 text-right font-medium" title="Döntetlen">D</th>
                <th className="px-1.5 py-2 text-right font-medium" title="Vereség">V</th>
                <th className="px-1.5 py-2 text-right font-medium">Gólok</th>
              </>
            )}
            <th className="px-1.5 py-2 text-right font-medium" title="Gólkülönbség">Gk</th>
            <th className="px-2 py-2 text-right font-medium">Pont</th>
            {!compact && <th className="hidden px-2 py-2 font-medium md:table-cell">Forma</th>}
            {!compact && <th className="hidden px-2 py-2 text-right font-medium lg:table-cell">Keretérték</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.club_id}
              aria-current={r.club_id === highlight ? "true" : undefined}
              className={cn(
                "border-t-2 border-black",
                r.club_id === highlight ? "bg-accent font-semibold" : "hover:bg-[#fff6cc]",
              )}
            >
              <td className="px-2 py-1.5 text-right font-display text-base">{i + 1}.</td>
              <td className="px-2 py-1.5">
                <span className="flex items-center gap-2">
                  <ClubCrest name={r.name} size={18} />
                  <ClubLink id={r.club_id} name={r.name} className="truncate" />
                </span>
              </td>
              <td className="px-1.5 text-right font-display text-base">{r.played}</td>
              {!compact && (
                <>
                  <td className="px-1.5 text-right font-display text-base">{r.won}</td>
                  <td className="px-1.5 text-right font-display text-base">{r.drawn}</td>
                  <td className="px-1.5 text-right font-display text-base">{r.lost}</td>
                  <td className="px-1.5 text-right font-display text-base">
                    {r.gf}:{r.ga}
                  </td>
                </>
              )}
              <td className="px-1.5 text-right font-display text-base">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              <td className="px-2 text-right">
                <span className="border-2 border-black bg-black px-1.5 font-display text-base font-bold text-accent">{r.pts}</span>
              </td>
              {!compact && (
                <td className="hidden px-2 md:table-cell">
                  <span className="flex gap-0.5">
                    {r.form.map((f, k) => (
                      <span key={k} className={cn("grid h-5 w-6 place-items-center border-2 border-black font-display text-[11px] font-bold", FORM_TONE[f])}>
                        {f}
                      </span>
                    ))}
                  </span>
                </td>
              )}
              {!compact && <td className="hidden px-2 text-right font-display text-base lg:table-cell">{fmtValue(r.squad_value_huf)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* A transfer line: from-club ▸ to-club with the value on the scoreboard. */
type Transfer = {
  id: string;
  season: string;
  player_id: string;
  full_name: string;
  birth_year: number | null;
  primary_position: Position | null;
  from_club: string;
  to_club: string;
  from_club_id: string | null;
  to_club_id: string | null;
  value_huf: number | null;
};

/** perspective "in"/"out": on a club page the club itself is implied, so only the other club is shown. */
export function TransferList({
  rows,
  showSeason = false,
  perspective,
}: {
  rows: Transfer[];
  showSeason?: boolean;
  perspective?: "in" | "out";
}) {
  if (!rows.length) return <p className="nb-box p-4 text-sm text-muted-foreground">Nincs rögzített átigazolás.</p>;
  return (
    <ul className="divide-y-2 divide-black border-[3px] border-black bg-white shadow-[4px_4px_0_#000]">
      {!perspective && (
        <li
          aria-hidden
          className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] gap-x-3 bg-black px-3 py-1.5 text-xs font-semibold text-white sm:grid"
        >
          <span>Játékos</span>
          <span>Honnan ▶ hová</span>
          <span>Becsült érték (nem díj)</span>
        </li>
      )}
      {rows.map((t) => (
        <li
          key={t.id}
          className={cn(
            "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2",
            !perspective && "sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto]",
          )}
        >
          <div className="min-w-0">
            <Link href={`/players/${t.player_id}`} className="font-semibold hover:bg-accent hover:text-black">
              {titleCase(t.full_name)}
            </Link>
            <div className="text-[11px] text-muted-foreground">
              {t.primary_position ? POSITION_LABEL[t.primary_position] : "Poszt ismeretlen"}
              {showSeason ? `, ${t.season}` : ""}
            </div>
          </div>
          {perspective ? (
            <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 text-sm">
              <span className="shrink-0 text-xs text-muted-foreground">{perspective === "in" ? "innen:" : "ide:"}</span>
              <ClubCrest name={perspective === "in" ? t.from_club : t.to_club} size={18} />
              <ClubLink
                id={perspective === "in" ? t.from_club_id : t.to_club_id}
                name={perspective === "in" ? t.from_club : t.to_club}
                className="truncate"
              />
            </div>
          ) : (
            <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 text-sm sm:col-span-1 sm:row-start-auto">
              <ClubCrest name={t.from_club} size={18} />
              <ClubLink id={t.from_club_id} name={t.from_club} className="truncate text-muted-foreground" />
              <span aria-label="ide igazolt" className="shrink-0 font-display text-black">
                ▶
              </span>
              <ClubCrest name={t.to_club} size={18} />
              <ClubLink id={t.to_club_id} name={t.to_club} className="truncate" />
            </div>
          )}
          <ValueTag
            value={t.value_huf}
            size="sm"
            className="justify-self-end"
            title="A játékos becsült piaci értéke az érkezés szezonjában. Átigazolási díjat nem mutatunk: ezek nem nyilvánosak."
          />
        </li>
      ))}
    </ul>
  );
}
