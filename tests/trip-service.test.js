import test from "node:test";
import assert from "node:assert/strict";
import { buildTrips, locations, operators, routes, vehicles } from "@bus-ai/shared/seed";
import { createMemoryTTLStore } from "@bus-ai/shared/cache";
import { createTripService } from "../services/trip-service/src/services/trip-service.js";

function serviceFixture() {
  const writes = [];
  const stores = {
    routes: new Map(routes.map((route) => [route.id, { ...route }])),
    vehicles: new Map(vehicles.map((vehicle) => [vehicle.id, { ...vehicle }])),
    trips: new Map(buildTrips().map((trip) => [trip.id, { ...trip }])),
    stops: new Map()
  };
  const repository = Object.fromEntries(
    ["saveRoute", "deleteRoute", "saveVehicle", "deleteVehicle", "saveTrip", "deleteTrip", "saveStop", "deleteStop"]
      .map((name) => [name, async (...args) => writes.push({ name, args })])
  );
  return {
    service: createTripService({
      stores,
      locations,
      operators,
      cache: createMemoryTTLStore(),
      repository,
      publishEvent: async () => {}
    }),
    writes
  };
}

test("trip application service owns validation, persistence and search caching", async () => {
  const { service, writes } = serviceFixture();
  const stop = await service.createStop({ city: "TP.HCM", name: "Bến test" });
  assert.equal(stop.name, "Bến test");
  assert.equal(service.catalog().locations.find((item) => item.name === "TP.HCM").stations.includes("Bến test"), true);

  const first = await service.search({ from: "TP.HCM", to: "Đà Lạt", sort: "PRICE_ASC" });
  const second = await service.search({ from: "TP.HCM", to: "Đà Lạt", sort: "PRICE_ASC" });
  assert.equal(first.cache, "MISS");
  assert.equal(second.cache, "HIT");
  assert.ok(first.trips.length > 0);
  assert.equal(writes.some((item) => item.name === "saveStop"), true);
});
