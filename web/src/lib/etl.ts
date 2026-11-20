import "server-only";

/**
 * Client for the internal `etl` service.
 *
 * On Vercel, ETL_URL is injected by the service binding declared on `web` in vercel.json
 * (never set it by hand there). Bindings resolve at runtime in functions only — not during
 * the build and not in middleware — so call this from route handlers / server actions.
 * Locally, `vercel dev` injects it too; without it, point ETL_URL at `uvicorn api:app --port 8000`.
 */
function baseUrl(): string {
  const base = process.env.ETL_URL;
  if (!base) throw new Error("ETL_URL is not set (Vercel service binding to `etl`)");
  // new URL("sync", "https://host/prefix") would drop "prefix" without the trailing slash
  return base.endsWith("/") ? base : `${base}/`;
}

export async function etlFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const h = new Headers(headers);
  if (json !== undefined) h.set("Content-Type", "application/json");
  if (process.env.ETL_INTERNAL_TOKEN) h.set("X-Internal-Token", process.env.ETL_INTERNAL_TOKEN);
  const res = await fetch(new URL(path.replace(/^\//, ""), baseUrl()), {
    ...rest,
    headers: h,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ETL ${path} -> HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type EtlTarget = { key: string; name: string; short_name: string; tier: number; category: string };

export type EtlSyncResult = {
  targets: string[];
  season: string;
  mode: "incremental" | "backfill";
  matches: number;
  players: number;
  errors: string[];
  seconds: number;
  analytics?: Record<string, number>;
};
