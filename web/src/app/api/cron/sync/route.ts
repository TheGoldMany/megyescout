import { etlFetch, type EtlSyncResult, type EtlTarget } from "@/lib/etl";

/**
 * Scheduled MLSZ sync (Vercel schedules in vercel.json: Monday 06:00 and Wednesday 21:00,
 * Europe/Budapest). Path schedules POST here with `Authorization: Bearer $CRON_SECRET`.
 *
 * The scrape itself runs in the internal `etl` service, reached through the ETL_URL binding.
 * One ETL call per competition keeps each invocation short and isolates failures; the
 * analytics recompute (which refreshes mv_player_explorer) runs once at the end.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 800; // seconds; Vercel caps this at the plan maximum

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "backfill" ? "backfill" : "incremental";
  const onlyParam = url.searchParams.get("only");

  const started = Date.now();
  const targets = onlyParam
    ? onlyParam.split(",").filter(Boolean)
    : (await etlFetch<EtlTarget[]>("targets")).map((t) => t.key);

  const results: (EtlSyncResult | { targets: string[]; error: string })[] = [];
  for (const key of targets) {
    try {
      results.push(
        await etlFetch<EtlSyncResult>("sync", {
          method: "POST",
          json: { mode, only: [key], profiles: true, analytics: false },
        }),
      );
    } catch (err) {
      // keep going: one unreachable league must not block the others
      results.push({ targets: [key], error: err instanceof Error ? err.message : String(err) });
    }
  }

  let analytics: unknown = null;
  try {
    analytics = await etlFetch("analytics", { method: "POST" });
  } catch (err) {
    analytics = { error: err instanceof Error ? err.message : String(err) };
  }

  const failed = results.filter((r) => "error" in r).length;
  return Response.json(
    { mode, targets: targets.length, failed, seconds: Math.round((Date.now() - started) / 1000), results, analytics },
    { status: failed === targets.length && targets.length > 0 ? 502 : 200 },
  );
}

export const POST = run; // schedules default to POST
export const GET = run; // manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/sync?only=bk1
