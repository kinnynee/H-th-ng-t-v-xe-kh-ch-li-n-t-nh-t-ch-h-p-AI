import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryTTLStore } from "@bus-ai/shared/cache";
import { createSeatInventory } from "../services/seat-service/src/core.js";

test("only one customer can hold the same seat concurrently", async () => {
  const inventory = createSeatInventory({ cache: createMemoryTTLStore() });
  const tripId = "trip-hcm-dalat-early";

  const [first, second] = await Promise.all([
    inventory.holdSeats({
      tripId,
      seatIds: ["A01"],
      customerEmail: "a@example.com",
      idempotencyKey: "customer-a",
      ttlSeconds: 300
    }),
    inventory.holdSeats({
      tripId,
      seatIds: ["A01"],
      customerEmail: "b@example.com",
      idempotencyKey: "customer-b",
      ttlSeconds: 300
    })
  ]);

  const successCount = [first, second].filter((result) => result.ok).length;
  assert.equal(successCount, 1);

  const map = await inventory.getSeatMap(tripId);
  const seat = map.seats.find((item) => item.id === "A01");
  assert.equal(seat.status, "HELD");
});

test("confirmed seats become booked and cannot be held again", async () => {
  const inventory = createSeatInventory({ cache: createMemoryTTLStore() });
  const tripId = "trip-hcm-dalat-early";
  const hold = await inventory.holdSeats({
    tripId,
    seatIds: ["A02"],
    customerEmail: "a@example.com",
    idempotencyKey: "hold-a02",
    ttlSeconds: 300
  });

  assert.equal(hold.ok, true);
  const confirm = await inventory.confirmSeats({
    tripId,
    seatIds: ["A02"],
    holdToken: hold.holdToken,
    bookingCode: "BKTEST"
  });

  assert.equal(confirm.ok, true);
  const secondHold = await inventory.holdSeats({
    tripId,
    seatIds: ["A02"],
    customerEmail: "b@example.com",
    idempotencyKey: "hold-b",
    ttlSeconds: 300
  });
  assert.equal(secondHold.ok, false);
});

test("releasing a hold makes its seat available again", async () => {
  const inventory = createSeatInventory({ cache: createMemoryTTLStore() });
  const tripId = "trip-hcm-dalat-early";
  const hold = await inventory.holdSeats({
    tripId,
    seatIds: ["A04"],
    customerEmail: "a@example.com",
    idempotencyKey: "release-a04",
    ttlSeconds: 300
  });

  assert.equal(hold.ok, true);
  await inventory.releaseSeats({ tripId, seatIds: ["A04"], holdToken: hold.holdToken });
  const map = await inventory.getSeatMap(tripId);
  assert.equal(map.seats.find((seat) => seat.id === "A04").status, "AVAILABLE");
});

test("an expired hold becomes available and emits a realtime seat update", async () => {
  const events = [];
  const inventory = createSeatInventory({
    cache: createMemoryTTLStore(),
    onSeatChanged: async (event) => events.push(event)
  });
  const tripId = "trip-hcm-dalat-early";

  const hold = await inventory.holdSeats({
    tripId,
    seatIds: ["A03"],
    customerEmail: "a@example.com",
    idempotencyKey: "short-hold",
    ttlSeconds: 1
  });
  assert.equal(hold.ok, true);

  await new Promise((resolve) => setTimeout(resolve, 1_250));
  const map = await inventory.getSeatMap(tripId);
  assert.equal(map.seats.find((seat) => seat.id === "A03").status, "AVAILABLE");
  assert.equal(events.at(-1).seats.find((seat) => seat.id === "A03").status, "AVAILABLE");
});

test("uses a persisted seat catalog when one is provided", async () => {
  const inventory = createSeatInventory({
    cache: createMemoryTTLStore(),
    trips: [],
    seatCatalog: new Map([["trip-from-db", [
      { id: "C01", label: "C01", floor: 3 },
      { id: "C02", label: "C02", floor: 3 }
    ]]])
  });

  const map = await inventory.getSeatMap("trip-from-db");
  assert.deepEqual(map.seats.map((seat) => seat.id), ["C01", "C02"]);
  assert.deepEqual(map.seats.map((seat) => seat.status), ["AVAILABLE", "AVAILABLE"]);
});

test("retries a confirmed booking idempotently after its hold was consumed", async () => {
  const inventory = createSeatInventory({ cache: createMemoryTTLStore() });
  const tripId = "trip-hcm-dalat-early";
  const hold = await inventory.holdSeats({
    tripId,
    seatIds: ["A05"],
    customerEmail: "buyer@example.com",
    idempotencyKey: "retryable-hold",
    ttlSeconds: 300
  });

  assert.equal((await inventory.confirmSeats({
    tripId,
    seatIds: ["A05"],
    holdToken: hold.holdToken,
    bookingCode: "BK-RETRY"
  })).ok, true);
  assert.equal((await inventory.confirmSeats({
    tripId,
    seatIds: ["A05"],
    holdToken: hold.holdToken,
    bookingCode: "BK-RETRY"
  })).ok, true);
});

test("does not alter local availability when durable confirmation rejects a race", async () => {
  const inventory = createSeatInventory({
    cache: createMemoryTTLStore(),
    confirmAssignments: async () => ({ ok: false, message: "Seat was sold by another replica." })
  });
  const tripId = "trip-hcm-dalat-early";
  const hold = await inventory.holdSeats({
    tripId,
    seatIds: ["A06"],
    customerEmail: "buyer@example.com",
    idempotencyKey: "rejected-confirmation",
    ttlSeconds: 300
  });

  const result = await inventory.confirmSeats({
    tripId,
    seatIds: ["A06"],
    holdToken: hold.holdToken,
    bookingCode: "BK-CONFLICT"
  });
  assert.equal(result.ok, false);
  assert.equal((await inventory.getSeatMap(tripId)).seats.find((seat) => seat.id === "A06").status, "HELD");
});
