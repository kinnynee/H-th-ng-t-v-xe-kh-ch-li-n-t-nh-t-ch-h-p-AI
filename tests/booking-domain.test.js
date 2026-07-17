import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCheckInWindow,
  cancelTickets,
  cancellationQuote,
  checkInTickets,
  createBookingLock,
  transitionBooking
} from "../services/booking-service/src/booking-domain.js";

test("booking state machine rejects invalid transitions", () => {
  const booking = { status: "PENDING_PAYMENT" };
  transitionBooking(booking, "PAID", new Date("2026-07-17T00:00:00Z"));
  assert.equal(booking.status, "PAID");
  assert.throws(() => transitionBooking(booking, "CHECKED_IN"), /Cannot transition/);
});

test("cancellation policy calculates route refund and fee", () => {
  const departureTime = "2026-07-18T12:00:00Z";
  const early = cancellationQuote({
    status: "TICKET_ISSUED", totalAmount: 1_000_000, departureTime,
    cancellationPolicy: "Hủy trước 24 tiếng hoàn 90%, trước 6 tiếng hoàn 60%.",
    now: new Date("2026-07-17T10:00:00Z")
  });
  assert.deepEqual(early, { refundPercent: 90, refundAmount: 900_000, cancellationFee: 100_000 });
  const later = cancellationQuote({
    status: "TICKET_ISSUED", totalAmount: 1_000_000, departureTime,
    cancellationPolicy: "Hủy trước 24 tiếng hoàn 90%, trước 6 tiếng hoàn 60%.",
    now: new Date("2026-07-18T04:00:00Z")
  });
  assert.equal(later.refundPercent, 60);
});

test("one ticket can check in without checking in the whole booking", () => {
  const booking = {
    code: "BKTEST", status: "TICKET_ISSUED", updatedAt: "",
    tickets: [
      { id: "BKTEST-A01", qrPayload: "BKTEST-TICKET-A01", status: "ISSUED" },
      { id: "BKTEST-A02", status: "ISSUED" }
    ]
  };
  checkInTickets(booking, "BKTEST-TICKET-A01", new Date("2026-07-17T00:00:00Z"));
  assert.equal(booking.status, "PARTIALLY_CHECKED_IN");
  assert.equal(booking.tickets[0].status, "CHECKED_IN");
  assert.equal(booking.tickets[1].status, "ISSUED");
  checkInTickets(booking, "BKTEST-A02", new Date("2026-07-17T00:05:00Z"));
  assert.equal(booking.status, "CHECKED_IN");
});

test("cancelling a booking invalidates every issued ticket", () => {
  const booking = {
    code: "BKCANCEL",
    status: "TICKET_ISSUED",
    tickets: [
      { id: "BKCANCEL-A01", status: "ISSUED", checkedInAt: null },
      { id: "BKCANCEL-A02", status: "ISSUED", checkedInAt: null }
    ]
  };
  const at = new Date("2026-07-17T01:00:00Z");
  cancelTickets(booking, at);
  assert.deepEqual(booking.tickets.map((ticket) => ticket.status), ["CANCELLED", "CANCELLED"]);
  assert.equal(booking.tickets[0].cancelledAt, at.toISOString());
  assert.throws(() => checkInTickets(booking, "BKCANCEL-A01", at), /cannot be checked in/);
});

test("check-in window and booking lock serialize operations", async () => {
  assert.doesNotThrow(() => assertCheckInWindow("2026-07-17T12:00:00Z", {
    now: new Date("2026-07-17T10:00:00Z"), opensHoursBefore: 24
  }));
  assert.throws(() => assertCheckInWindow("2026-07-17T12:00:00Z", {
    now: new Date("2026-07-16T10:00:00Z"), opensHoursBefore: 24
  }), /opens/);

  const withLock = createBookingLock();
  const order = [];
  await Promise.all([
    withLock("BK", async () => { order.push("first-start"); await new Promise((resolve) => setTimeout(resolve, 10)); order.push("first-end"); }),
    withLock("BK", async () => { order.push("second"); })
  ]);
  assert.deepEqual(order, ["first-start", "first-end", "second"]);
});
