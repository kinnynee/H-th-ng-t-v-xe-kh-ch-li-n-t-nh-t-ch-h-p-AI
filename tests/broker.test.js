import assert from "node:assert/strict";
import test from "node:test";
import { seatChangedRoutingKey } from "@bus-ai/shared/broker";

test("seat change routing keys are topic-safe and unique per trip", () => {
  const first = seatChangedRoutingKey("trip.hcm/dalat");
  const second = seatChangedRoutingKey("trip.hcm/dalat-2");

  assert.match(first, /^seat\.changed\.[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
});
