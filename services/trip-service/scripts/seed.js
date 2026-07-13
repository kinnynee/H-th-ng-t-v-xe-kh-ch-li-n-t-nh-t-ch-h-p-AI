import { buildTrips, locations, routes, vehicles } from "@bus-ai/shared/seed";
import { connectPostgres } from "@bus-ai/shared/postgres";
import { seedTripRepository } from "../src/repository.js";

const stops = locations.flatMap((location) =>
  location.stations.map((name, index) => ({ id: `stop-${location.id}-${index + 1}`, city: location.name, name }))
);

const database = await connectPostgres(process.env.TRIP_DATABASE_URL || process.env.DATABASE_URL, "trip-seed");
if (!database) process.exitCode = 1;
else {
  try {
    await seedTripRepository(database, { routes, vehicles, trips: buildTrips(), stops });
    console.log("[trip-seed] demo routes, vehicles, stops and trips are ready");
  } finally {
    await database.end();
  }
}
