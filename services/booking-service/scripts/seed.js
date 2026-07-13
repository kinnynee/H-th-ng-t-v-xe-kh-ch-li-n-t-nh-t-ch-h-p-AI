import { connectPostgres } from "@bus-ai/shared/postgres";
import { demoUsers } from "../src/demo-users.js";
import { seedUsers } from "../src/repository.js";

const database = await connectPostgres(process.env.BOOKING_DATABASE_URL || process.env.DATABASE_URL, "booking-seed");
if (!database) process.exitCode = 1;
else {
  try {
    await seedUsers(database, demoUsers);
    console.log("[booking-seed] demo users and saved passengers are ready");
  } finally {
    await database.end();
  }
}
