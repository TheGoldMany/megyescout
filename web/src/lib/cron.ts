import "server-only";
import { etlFetch, type EtlSyncResult, type EtlTarget } from "./etl";

/**
 * Shared logic of the schedule-triggered sync routes.
 *
 * Vercel Hobby caps every function at 300 s, and the caller (web) waits for the callee (etl),
 * so both must finish inside that window. Each schedule therefore syncs ONE competition
 * (`/api/cron/sync/<key>`), and every etl call gets an explicit time budget that leaves room
 * for the analytics refresh and network overhead.
 */
export const FUNCTION_LIMIT_SEC = 300; // keep in sync with `maxDuration` in the route files
const SAFETY_SEC = 40; // response serialisation, cold starts, analytics refresh
const MAX_ETL_BUDGET_SEC = 200;
const MIN_ETL_BUDGET_SEC = 30;

export function authorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

type Outcome = EtlSyncResult | { targets: string[]; error: string };

export async function listTargets(): Promise<string[]> {
  return (await etlFetch<EtlTarget[]>("targets")).map((t) => t.key);
}

/**
 * Sync `keys` one after another until the function's own time runs out.
 * With a single key (the scheduled case) analytics runs inside the same etl call.
 */
export async function syncTargets(
  keys: string[],
  opts: { mode?: "incremental" | "backfill"; startedAt?: number } = {},
) {
  const startedAt = opts.startedAt ?? Date.now();
  const deadline = startedAt + (FUNCTION_LIMIT_SEC - SAFETY_SEC) * 1000;
  const single = keys.length === 1;
  const results: Outcome[] = [];
  const skipped: string[] = [];

  for (const key of keys) {
    const remaining = (deadline - Date.now()) / 1000;
    if (remaining < MIN_ETL_BUDGET_SEC + 10) {
      skipped.push(key);
      continue;
    }
    const budget = Math.max(MIN_ETL_BUDGET_SEC, Math.min(MAX_ETL_BUDGET_SEC, remaining - 20));
    try {
      results.push(
        await etlFetch<EtlSyncResult>("sync", {
          method: "POST",
          json: { mode: opts.mode ?? "incremental", only: [key], profiles: true, analytics: single, budget_seconds: budget },
        }),
      );
    } catch (err) {
      // keep going: one unreachable league must not block the others
      results.push({ targets: [key], error: err instanceof Error ? err.message : String(err) });
    }
  }

  let analytics: unknown = single ? "included in the sync call" : null;
  if (!single) {
    if ((deadline - Date.now()) / 1000 > 15) {
      try {
        analytics = await etlFetch("analytics", { method: "POST" });
      } catch (err) {
        analytics = { error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      analytics = "skipped: out of time (the next scheduled run refreshes it)";
    }
  }

  const failed = results.filter((r) => "error" in r).length;
  return {
    body: {
      targets: keys.length,
      failed,
      skipped,
      seconds: Math.round((Date.now() - startedAt) / 1000),
      results,
      analytics,
    },
    status: keys.length > 0 && failed === results.length && results.length > 0 ? 502 : 200,
  };
}
