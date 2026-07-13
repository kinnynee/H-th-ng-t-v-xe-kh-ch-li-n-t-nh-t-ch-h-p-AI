import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "@bus-ai/shared/migrations";
import { connectPostgres } from "@bus-ai/shared/postgres";

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../database/migrations/trip");
const database = await connectPostgres(process.env.TRIP_DATABASE_URL || process.env.DATABASE_URL, "trip-migrate");
if (!database) process.exitCode = 1;
else {
  try {
    await runMigrations(database, directory, "trip-migrate");
  } finally {
    await database.end();
  }
}
