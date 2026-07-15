/**
 * Small PostgreSQL boundary shared by the microservices.
 *
 * A service receives `null` only when DATABASE_URL is deliberately absent or
 * PostgreSQL cannot be reached. This keeps the local demo usable, while Docker
 * deployments use PostgreSQL as the durable source of truth.
 */
export async function connectPostgres(url = process.env.DATABASE_URL, label = "service") {
  if (!url) {
    console.warn(`[${label}] DATABASE_URL is not configured; using the in-memory development fallback.`);
    return null;
  }

  try {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 10_000
    });
    await pool.query("SELECT 1");
    console.log(`[${label}] PostgreSQL connected`);
    return pool;
  } catch (error) {
    console.warn(`[${label}] PostgreSQL unavailable; using the in-memory development fallback: ${error.message}`);
    return null;
  }
}

export async function withTransaction(pool, work) {
  if (!pool) return work(null);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

export function jsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}
