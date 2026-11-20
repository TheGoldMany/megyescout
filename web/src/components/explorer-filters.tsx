"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapPin, RotateCcw, Search, Sparkles, Loader2, SlidersHorizontal } from "lucide-react";
import { Input, Label, NativeSelect } from "./ui/input";
import { Slider } from "./ui/slider";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { TIER_LABEL } from "@/lib/labels";

const POSITIONS = [
  { v: "", label: "Összes" },
  { v: "GK", label: "Kapus" },
  { v: "DEF", label: "Védő" },
  { v: "MID", label: "Középpályás" },
  { v: "FWD", label: "Támadó" },
];

const ARCHETYPES = ["Motor", "Szupercsere", "Gólfelelős", "Ütköző", "Fiatalszabály-opció", "Biztos kéz"];

export function ExplorerFilters({
  youthWindow,
  tiers,
  defaultKm,
  seasons,
  season,
}: {
  youthWindow: [number, number];
  tiers: { tier: number; n: number }[];
  defaultKm: number;
  seasons: string[];
  season: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [km, setKm] = useState<number>(Number(sp.get("km") ?? defaultKm));
  const [open, setOpen] = useState(false); // advanced filters collapsed on phones

  function push(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // debounce free-text search
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) push({ q });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const pos = sp.get("pos") ?? "";
  const byMin = sp.get("byMin") ?? "";
  const byMax = sp.get("byMax") ?? "";
  const youthOn = byMin === String(youthWindow[0]) && byMax === String(youthWindow[1]);

  return (
    <div className="rounded-lg border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        {seasons.length > 1 && (
          <div className="lg:w-36">
            <Label htmlFor="season">Szezon</Label>
            <NativeSelect
              id="season"
              value={season}
              onChange={(e) => push({ season: e.target.value === seasons[0] ? null : e.target.value, byMin: null, byMax: null })}
              className="mt-1"
            >
              {seasons.map((s, i) => (
                <option key={s} value={s}>
                  {s}
                  {i === 0 ? " (aktuális)" : ""}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="relative flex-1">
          <Label htmlFor="q">Keresés</Label>
          <Search className="pointer-events-none absolute bottom-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Játékos, klub vagy település…"
            className="mt-1 pl-8"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input text-xs font-medium text-muted-foreground md:hidden"
          aria-expanded={open}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> {open ? "Szűrők elrejtése" : "További szűrők"}
          {activeCount(sp) > 0 && <span className="rounded bg-primary/20 px-1 font-mono text-emerald-300">{activeCount(sp)}</span>}
        </button>
        <div className={cn(!open && "hidden md:block")}>
          <Label>Poszt</Label>
          <div className="mt-1 flex flex-wrap gap-1 rounded-md bg-secondary p-1">
            {POSITIONS.map((p) => (
              <button
                key={p.v}
                onClick={() => push({ pos: p.v || null })}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground",
                  pos === p.v && "bg-card text-foreground shadow",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={cn("mt-3 grid-cols-2 gap-3 md:grid md:grid-cols-3 xl:grid-cols-6", open ? "grid" : "hidden")}>
        <div className="col-span-2 md:col-span-1">
          <Label>Születési év</Label>
          <div className="mt-1 flex items-center gap-1.5">
            <Input
              inputMode="numeric"
              placeholder="tól"
              defaultValue={byMin}
              key={`min-${byMin}`}
              onBlur={(e) => push({ byMin: e.target.value || null })}
              className="px-2"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              inputMode="numeric"
              placeholder="ig"
              defaultValue={byMax}
              key={`max-${byMax}`}
              onBlur={(e) => push({ byMax: e.target.value || null })}
              className="px-2"
            />
          </div>
        </div>
        <div className="flex items-end">
          <button
            onClick={() =>
              youthOn
                ? push({ byMin: null, byMax: null })
                : push({ byMin: String(youthWindow[0]), byMax: String(youthWindow[1]) })
            }
            className={cn(
              "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium transition",
              youthOn ? "border-sky-500/50 bg-sky-500/15 text-sky-300" : "border-input text-muted-foreground hover:bg-secondary",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Fiatalszabály {youthWindow[0]}–{youthWindow[1]}
          </button>
        </div>
        <div>
          <Label htmlFor="tier">Osztály</Label>
          <NativeSelect id="tier" value={sp.get("tier") ?? ""} onChange={(e) => push({ tier: e.target.value })} className="mt-1">
            <option value="">Mind</option>
            {tiers.map((t) => (
              <option key={t.tier} value={t.tier}>
                {TIER_LABEL[t.tier] ?? `${t.tier}. szint`} ({t.n})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="minMin">Min. játékperc</Label>
          <NativeSelect id="minMin" value={sp.get("minMin") ?? ""} onChange={(e) => push({ minMin: e.target.value })} className="mt-1">
            <option value="">Bármennyi</option>
            <option value="270">270+ (3 meccs)</option>
            <option value="450">450+</option>
            <option value="720">720+</option>
            <option value="900">900+</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="tag">Szerepkör</Label>
          <NativeSelect id="tag" value={sp.get("tag") ?? ""} onChange={(e) => push({ tag: e.target.value })} className="mt-1">
            <option value="">Mind</option>
            {ARCHETYPES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="col-span-2 md:col-span-1">
          <Label className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Távolság Lajosmizsétől
            </span>
            <span className="font-mono normal-case text-foreground">{km >= 150 ? "bármennyi" : `${km} km`}</span>
          </Label>
          <Slider
            className="mt-1"
            min={10}
            max={150}
            step={5}
            value={[km]}
            onValueChange={(v) => setKm(v[0])}
            onValueCommit={(v) => push({ km: String(v[0]) })}
            aria-label="Maximális távolság km-ben"
          />
        </div>
      </div>

      <div className={cn("mt-3 items-center justify-between text-xs text-muted-foreground md:flex", open ? "flex" : "hidden")}>
        <span className="inline-flex items-center gap-1.5">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Szűrés…" : "A távolság a klub székhelyétől légvonalban (Haversine) értendő."}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            setKm(defaultKm);
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
        >
          <RotateCcw /> Alaphelyzet
        </Button>
      </div>
    </div>
  );
}

function activeCount(sp: URLSearchParams | ReturnType<typeof useSearchParams>) {
  return ["pos", "byMin", "byMax", "tier", "minMin", "tag", "km"].filter((k) => sp.get(k)).length;
}
