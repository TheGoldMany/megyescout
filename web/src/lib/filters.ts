import type { Filters, SortKey } from "./queries";
import { SORT_COLUMNS } from "./sort";
import type { Position } from "./labels";

export type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | string[] | undefined) => {
  const n = Number(one(v));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export const DEFAULT_MAX_KM = 70;

export function parseFilters(sp: RawParams): Filters {
  const pos = one(sp.pos);
  const sort = one(sp.sort);
  return {
    q: one(sp.q)?.slice(0, 80) || undefined,
    pos: pos && ["GK", "DEF", "MID", "FWD"].includes(pos) ? (pos as Position) : undefined,
    byMin: num(sp.byMin),
    byMax: num(sp.byMax),
    tier: num(sp.tier),
    minMinutes: num(sp.minMin),
    maxKm: one(sp.km) === undefined ? DEFAULT_MAX_KM : num(sp.km),
    archetype: one(sp.tag) || undefined,
    sort: sort && sort in SORT_COLUMNS ? (sort as SortKey) : "index",
    dir: one(sp.dir) === "asc" ? "asc" : "desc",
    page: num(sp.page) ?? 1,
  };
}
