import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryTTLStore } from "@bus-ai/shared/cache";
import { createSeatInventory } from "../services/seat-service/src/core.js";

test("multi-seat hold race has exactly one winner across repeated rounds", async () => {
  const rounds = 50;

  for (let round = 1; round <= rounds; round += 1) {
    const inventory = createSeatInventory({ cache: createMemoryTTLStore() });
    const tripId = "trip-hcm-dalat-early";
    const requests = [
      {
        tripId,
        seatIds: ["A01", "A02"],
        customerEmail: `customer-a-${round}@example.com`,
        idempotencyKey: `race-${round}-a`,
        ttlSeconds: 300
      },
      {
        tripId,
        seatIds: ["A01", "A02"],
        customerEmail: `customer-b-${round}@example.com`,
        idempotencyKey: `race-${round}-b`,
        ttlSeconds: 300
      }
    ];

    const results = await Promise.all(requests.map((request) => inventory.holdSeats(request)));
    const winners = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.ok);

    assert.equal(winners.length, 1, `round ${round} must have exactly one winner`);
    const winner = winners[0];
    const map = await inventory.getSeatMap(tripId);
    for (const seatId of ["A01", "A02"]) {
      const seat = map.seats.find((candidate) => candidate.id === seatId);
      assert.equal(seat.status, "HELD", `round ${round}: ${seatId} must be held`);
      assert.equal(seat.holdToken, winner.result.holdToken, `round ${round}: ${seatId} must belong to the winner`);
    }

    const retry = await inventory.holdSeats(requests[winner.index]);
    assert.equal(retry.ok, true, `round ${round}: winner retry must succeed`);
    assert.equal(retry.holdToken, winner.result.holdToken, `round ${round}: retry must reuse the token`);
  }
});
