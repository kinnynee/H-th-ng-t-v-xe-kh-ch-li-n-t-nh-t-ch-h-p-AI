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
