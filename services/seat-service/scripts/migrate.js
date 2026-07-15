import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "@bus-ai/shared/migrations";
import { connectPostgres } from "@bus-ai/shared/postgres";

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../database/migrations/seat");
const database = await connectPostgres(process.env.SEAT_DATABASE_URL || process.env.DATABASE_URL, "seat-migrate");
if (!database) process.exitCode = 1;
else {
  try {
    await runMigrations(database, directory, "seat-migrate");
  } finally {
    await database.end();
  }
}
