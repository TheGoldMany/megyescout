import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const huNumber = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 });

export function fmtNum(v: number | string | null | undefined, digits = 2): string {
  if (v === null || v === undefined || v === "") return "–";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "–";
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function fmtSigned(v: number | string | null | undefined, digits = 2): string {
  if (v === null || v === undefined || v === "") return "–";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "–";
  const s = n.toFixed(digits).replace(".", ",");
  return n > 0 ? `+${s}` : s;
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  return huNumber.format(Math.round(v));
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "még nincs";
  const d = typeof v === "string" ? new Date(v) : v;
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Budapest",
  }).format(d);
}

const ROMAN = /^(I|II|III|IV|V|VI)[.,]*$/;

/** Person names: "NAGY DÁVID" -> "Nagy Dávid". Mixed-case input is returned unchanged. */
export function titleCase(name: string): string {
  if (/[a-záéíóöőúüű]/.test(name)) return name;
  return name
    .toLocaleLowerCase("hu-HU")
    .split(/(\s|-)/)
    .map((p) => (p.length > 1 ? p[0].toLocaleUpperCase("hu-HU") + p.slice(1) : p.toLocaleUpperCase("hu-HU")))
    .join("");
}

/** Club names: "KECSKEMÉTI TE II." -> "Kecskeméti TE II." (keeps abbreviations and roman numerals). */
export function clubCase(name: string): string {
  if (/[a-záéíóöőúüű]/.test(name)) return name;
  return name
    .split(/(\s|-)/)
    .map((w) => (w.length <= 3 || ROMAN.test(w) ? w : w[0] + w.slice(1).toLocaleLowerCase("hu-HU")))
    .join("");
}
