import { connectPostgres } from "@bus-ai/shared/postgres";
import { saveAnalyticsState } from "../src/repository.js";
import { createDemoAnalyticsState } from "../src/state.js";

const database = await connectPostgres(process.env.ANALYTICS_DATABASE_URL || process.env.DATABASE_URL, "analytics-seed");
if (!database) process.exitCode = 1;
else {
  try {
    const exists = await database.query("SELECT 1 FROM analytics_counters WHERE id = 1");
    if (!exists.rowCount) {
      await saveAnalyticsState(database, createDemoAnalyticsState());
      console.log("[analytics-seed] demo analytics are ready");
    } else {
      console.log("[analytics-seed] data already exists; skipped");
    }
  } finally {
    await database.end();
  }
}
