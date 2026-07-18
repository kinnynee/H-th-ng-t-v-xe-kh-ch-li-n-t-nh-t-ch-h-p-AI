import pg from "pg";

const adminUrl = process.env.DATABASE_ADMIN_URL;
const databaseNames = String(process.env.DATABASE_NAMES || "trip_db,booking_db,seat_db,analytics_db")
  .split(",").map((name) => name.trim()).filter(Boolean);

if (!adminUrl) throw new Error("DATABASE_ADMIN_URL is required");
if (databaseNames.some((name) => !/^[a-z][a-z0-9_]{0,62}$/.test(name))) {
  throw new Error("DATABASE_NAMES contains an unsafe PostgreSQL identifier");
}

const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
try {
  for (const name of databaseNames) {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!existing.rowCount) {
      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`[db-setup] created ${name}`);
    }
  }
} finally {
  await client.end();
}
