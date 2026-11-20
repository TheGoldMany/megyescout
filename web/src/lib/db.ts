import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

declare global {
  var __hunscoutPool: Pool | undefined;
}

// numeric/bigint -> JS number (scores and per-90 values are small; precision loss is irrelevant here)
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

function createPool() {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://hunscout_web:hunscout_web@localhost:5432/hunscout";
  return new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
}

export const pool: Pool = globalThis.__hunscoutPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalThis.__hunscoutPool = pool;

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query<T>(sql, params);
  return res.rows;
}

/**
 * Run statements inside a transaction bound to a club workspace.
 * The RLS policy on scout_notes reads `app.workspace_id`, so private notes of
 * other clubs are invisible even if a query forgets a WHERE clause.
 */
export async function withWorkspace<T>(workspaceId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
