import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { withTransaction } from "./postgres.js";

/** Executes each numbered JavaScript migration once and records it in schema_migrations. */
export async function runMigrations(pool, directory, label) {
  if (!pool) throw new Error(`${label}: DATABASE_URL is required to run migrations.`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(directory))
    .filter((file) => /^\d+.*\.js$/i.test(file))
    .sort((left, right) => left.localeCompare(right));

  for (const name of files) {
    const migrationKey = `${label}:${name}`;
    // Existing databases may have been initialized by the former .sql migrations.
    const legacyName = `${label}:${name.replace(/\.js$/i, ".sql")}`;
    const applied = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE name = ANY($1::text[])",
      [[migrationKey, legacyName]]
    );
    if (applied.rowCount) continue;
    const migration = await import(pathToFileURL(path.join(directory, name)).href);
    if (typeof migration.up !== "function") {
      throw new Error(`${label}: migration ${name} must export an async up(db) function.`);
    }
    await withTransaction(pool, async (db) => {
      await migration.up(db);
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migrationKey]);
    });
    console.log(`[${label}] applied migration ${name}`);
  }
}
