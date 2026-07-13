import { promises as fs } from "node:fs";
import path from "node:path";
import { withTransaction } from "./postgres.js";

/** Executes each numbered SQL migration once and records it in schema_migrations. */
export async function runMigrations(pool, directory, label) {
  if (!pool) throw new Error(`${label}: DATABASE_URL is required to run migrations.`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(directory))
    .filter((file) => /^\d+.*\.sql$/i.test(file))
    .sort((left, right) => left.localeCompare(right));

  for (const name of files) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
    if (applied.rowCount) continue;
    const sql = await fs.readFile(path.join(directory, name), "utf8");
    await withTransaction(pool, async (db) => {
      await db.query(sql);
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    console.log(`[${label}] applied migration ${name}`);
  }
}
