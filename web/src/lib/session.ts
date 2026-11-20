import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal staff session for the pilot: a signed cookie carrying workspace + display name.
 * When WORKSPACE_PASSCODE is unset (local dev) everyone is treated as the default scout.
 * Swap for Supabase Auth by putting `workspace_id` into the JWT claims (see migration 002).
 */
export const SESSION_COOKIE = "hunscout_session";
export const DEFAULT_WORKSPACE = process.env.WORKSPACE_ID ?? "lajosmizse_vlc";

export type Session = { workspaceId: string; name: string };

/** True on any Vercel deployment (production or preview). */
export function onVercel(): boolean {
  return process.env.VERCEL === "1";
}

const DEV_SECRET = "dev-only-secret-change-me";

/**
 * Signing key. Fail closed on Vercel: without a real AUTH_SECRET (≥ 16 chars) there is no key,
 * so no cookie verifies and nobody can log in — instead of signing with the public dev key.
 */
function secret(): string | null {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  return onVercel() ? null : (s || DEV_SECRET);
}

/** Missing settings that block logging in on this deployment (shown on the login page). */
export function authConfigProblems(): string[] {
  const problems: string[] = [];
  if (onVercel() && !process.env.WORKSPACE_PASSCODE) problems.push("WORKSPACE_PASSCODE");
  if (secret() === null) problems.push("AUTH_SECRET (legalább 16 karakter)");
  return problems;
}

export function sign(session: Session): string {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET is not configured");
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const mac = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verify(token: string | undefined): Session | null {
  if (!token) return null;
  const key = secret();
  if (!key) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    return s.workspaceId && s.name ? s : null;
  } catch {
    return null;
  }
}

/** Constant-time passcode check (hash both sides so lengths always match). */
export function passcodeMatches(candidate: string): boolean {
  const expected = process.env.WORKSPACE_PASSCODE;
  if (!expected) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Login required? Always on Vercel (the private club notes must never be public, even if
 * WORKSPACE_PASSCODE was forgotten); locally only when a passcode is set ("open dev mode" otherwise).
 */
export function authEnabled() {
  return onVercel() || Boolean(process.env.WORKSPACE_PASSCODE);
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const s = verify(store.get(SESSION_COOKIE)?.value);
  if (s) return s;
  if (!authEnabled()) return { workspaceId: DEFAULT_WORKSPACE, name: "Stáb (dev)" };
  return null;
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("Nincs bejelentkezve");
  return s;
}

/** Only same-site paths: "/x" yes; "//evil.example", "/\evil", "https://…" no (open-redirect guard). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/**
 * Server-side gate for pages: returns the session or redirects to /login?next=<path>.
 * (There is deliberately no middleware: Vercel services do not run Edge functions, and every
 * page, route handler and server action checks the session itself.)
 */
export async function sessionOrLogin(next: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(safeNextPath(next))}`);
  return s;
}
