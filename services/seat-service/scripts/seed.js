import { buildSeatLabels, buildTrips } from "@bus-ai/shared/seed";
import { connectPostgres } from "@bus-ai/shared/postgres";
import { seedSeatCatalog } from "../src/repository.js";

const database = await connectPostgres(process.env.SEAT_DATABASE_URL || process.env.DATABASE_URL, "seat-seed");
if (!database) process.exitCode = 1;
else {
  try {
    const trips = buildTrips().map((trip) => ({
      id: trip.id,
      seats: buildSeatLabels(trip.seatCount)
    }));
    await seedSeatCatalog(database, trips);
    console.log("[seat-seed] seat catalog for demo trips is ready");
  } finally {
    await database.end();
  }
}
