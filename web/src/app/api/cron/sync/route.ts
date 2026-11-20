import { authorizedCron, listTargets, syncTargets } from "@/lib/cron";

/**
 * Manual sync of several competitions: `?only=bk1,pest1` (default: all V1 targets).
 * Runs them one by one until the 300 s Hobby limit is near and reports the rest as `skipped`.
 * The Vercel schedules do NOT use this route; they call /api/cron/sync/<key>, one league each.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/sync?only=bk1
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Hobby maximum (see FUNCTION_LIMIT_SEC in lib/cron.ts)

async function run(req: Request) {
  if (!authorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  const startedAt = Date.now();
  const url = new URL(req.url);
  const only = url.searchParams.get("only");
  const keys = only ? only.split(",").map((k) => k.trim()).filter(Boolean) : await listTargets();
  const { body, status } = await syncTargets(keys, {
    mode: url.searchParams.get("mode") === "backfill" ? "backfill" : "incremental",
    startedAt,
  });
  return Response.json(body, { status });
}

export const POST = run;
export const GET = run;
