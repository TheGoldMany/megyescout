import { authorizedCron, syncTargets } from "@/lib/cron";

/**
 * Target of the Vercel schedules (vercel.json): one competition per run, e.g. /api/cron/sync/bk1.
 * Path schedules send POST with `Authorization: Bearer $CRON_SECRET`. The etl call scrapes the
 * league with a time budget and refreshes analytics, all inside the 300 s Hobby limit.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Hobby maximum (see FUNCTION_LIMIT_SEC in lib/cron.ts)

async function run(req: Request, ctx: { params: Promise<{ target: string }> }) {
  if (!authorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  const startedAt = Date.now();
  const { target } = await ctx.params;
  if (!/^[a-z0-9_]{2,16}$/.test(target)) return new Response("Unknown target", { status: 404 });
  const { body, status } = await syncTargets([target], { startedAt });
  return Response.json(body, { status });
}

export const POST = run;
export const GET = run;
