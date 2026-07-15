import { connectPostgres } from "@bus-ai/shared/postgres";
import { hashPassword } from "@bus-ai/shared/auth";
import { demoUsers } from "../src/demo-users.js";
import { seedUsers } from "../src/repository.js";

if (process.env.NODE_ENV === "production") {
  console.log("[booking-seed] skipped demo accounts in production");
  process.exit(0);
}

const database = await connectPostgres(process.env.BOOKING_DATABASE_URL || process.env.DATABASE_URL, "booking-seed");
if (!database) process.exitCode = 1;
else {
  try {
    const users = await Promise.all(demoUsers.map(async (user) => ({
      ...user,
      password: await hashPassword(user.password)
    })));
    await seedUsers(database, users);
    console.log("[booking-seed] demo users and saved passengers are ready");
  } finally {
    await database.end();
  }
}
