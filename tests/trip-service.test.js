import test from "node:test";
import assert from "node:assert/strict";
import { buildTrips, locations, operators, routes, vehicles } from "@bus-ai/shared/seed";
import { createMemoryTTLStore } from "@bus-ai/shared/cache";
import { createTripService } from "../services/trip-service/src/services/trip-service.js";

function serviceFixture({ now = () => Date.parse("2026-07-17T10:00:00+07:00") } = {}) {
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
      publishEvent: async () => {},
      now
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

test("customer searches hide departed trips while admin searches retain them", async () => {
  const nowMs = Date.parse("2026-07-17T17:00:00+07:00");
  const { service } = serviceFixture({ now: () => nowMs });
  const query = { from: "TP.HCM", to: "Đà Lạt", date: "2026-07-17" };
  const customerSearch = await service.search(query);
  const adminSearch = await service.search({ ...query, includeInactive: "true" });
  assert.equal(customerSearch.trips.every((trip) => Date.parse(trip.departureTime) > nowMs), true);
  assert.equal(adminSearch.trips.some((trip) => Date.parse(trip.departureTime) <= nowMs), true);
});

test("suspended trips are hidden from customers but visible to admin searches", async () => {
  const { service } = serviceFixture();
  const initial = await service.search({ from: "TP.HCM", to: "Đà Lạt" });
  const trip = initial.trips[0];
  assert.ok(trip);

  await service.updateTripStatus(trip.id, "SUSPENDED");

  const customerSearch = await service.search({ from: "TP.HCM", to: "Đà Lạt" });
  const adminSearch = await service.search({ from: "TP.HCM", to: "Đà Lạt", includeInactive: "true" });
  assert.equal(customerSearch.trips.some((item) => item.id === trip.id), false);
  assert.equal(adminSearch.trips.some((item) => item.id === trip.id && item.status === "SUSPENDED"), true);
});

test("admin can configure vehicle seat positions and a trip's expected arrival", async () => {
  const { service } = serviceFixture();
  const vehicle = await service.createVehicle({
    plate: "51B-999.01",
    type: "Demo 2-2",
    seatCount: 4,
    layout: "2-2",
    seatLayout: [
      { id: "L01", floor: 1, row: 1, column: 1 },
      { id: "L02", floor: 1, row: 1, column: 2 },
      { id: "R01", floor: 1, row: 1, column: 4 },
      { id: "R02", floor: 1, row: 1, column: 5 }
    ]
  });
  assert.equal(vehicle.seatLayout[3].column, 5);

  const trip = await service.saveTrip(null, {
    routeId: routes[0].id,
    operatorId: operators[0].id,
    vehicleId: vehicle.id,
    departureTime: "2026-07-20T08:00:00+07:00",
    arrivalTime: "2026-07-20T12:45:00+07:00",
    price: 210000,
    status: "ACTIVE"
  });
  assert.equal(trip.arrivalTime, "2026-07-20T12:45:00+07:00");
  assert.equal(trip.durationMinutes, 285);
  assert.deepEqual(trip.seatLayout.map((seat) => seat.id), ["L01", "L02", "R01", "R02"]);
});
