import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal staff session for the pilot: a signed cookie carrying workspace + display name.
 * When WORKSPACE_PASSCODE is unset (local dev) everyone is treated as the default scout.
 * Swap for Supabase Auth by putting `workspace_id` into the JWT claims (see migration 002).
 */
export const SESSION_COOKIE = "hunscout_session";
export const DEFAULT_WORKSPACE = process.env.WORKSPACE_ID ?? "lajosmizse_vlc";

export type Session = { workspaceId: string; name: string };

function secret() {
  return process.env.AUTH_SECRET ?? "dev-only-secret-change-me";
}

export function sign(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verify(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
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

export function authEnabled() {
  return Boolean(process.env.WORKSPACE_PASSCODE);
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
