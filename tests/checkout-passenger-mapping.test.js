import assert from "node:assert/strict";
import test from "node:test";
import { renderTicketHtml } from "../packages/shared/src/ticket.js";
import { createBookingWithOutbox } from "../services/booking-service/src/repository.js";
import { validateBookingInput } from "../services/booking-service/src/validation.js";
import { createPassengerTickets, normalizeBookingPassengers } from "../services/booking-service/src/passenger-mapping.js";
import { guestBookingEmailMatches, resolveCheckoutCustomer } from "../services/booking-service/src/checkout-policy.js";
import { createGuestAccessToken, hashGuestAccessToken, verifiesGuestAccessToken } from "../services/booking-service/src/guest-access.js";

const inputPassengers = [
  {
    seatId: " a01 ",
    fullName: "  Nguyễn   Văn An ",
    phone: "090-123-4567",
    email: "AN@Example.com ",
    documentId: "001234567890"
  },
  {
    seatId: "a02",
    fullName: "Trần Thị Bình",
    phone: "091 234 5678",
    email: "binh@example.com",
    documentId: ""
  }
];

test("multiple passengers keep a one-to-one seat mapping through booking persistence and ticket rendering", async () => {
  const passengers = normalizeBookingPassengers(inputPassengers);
  const booking = {
    code: "BK-PASSENGERS",
    tripId: "trip-hcm-dalat-early",
    routeName: "TP.HCM - Đà Lạt",
    departureTime: "2026-07-18T00:00:00.000Z",
    pickup: "Bến xe Miền Đông",
    dropoff: "Bến xe Đà Lạt",
    vehiclePlate: "51B-123.45",
    holdToken: "hold-passengers",
    customerEmail: "buyer@example.com",
    customerPhone: "0909000000",
    userId: "",
    seatIds: passengers.map((passenger) => passenger.seatId),
    passengers,
    totalAmount: 600000,
    status: "PENDING_PAYMENT",
    tickets: [],
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z"
  };

  assert.equal(validateBookingInput(booking), null);
  assert.deepEqual(booking.seatIds, ["A01", "A02"]);
  const persisted = (await createBookingWithOutbox(null, booking)).booking;
  assert.deepEqual(persisted.passengers, passengers);

  const tickets = createPassengerTickets(persisted, "2026-07-18T00:01:00.000Z");
  assert.deepEqual(tickets.map(({ passengerName, seatId }) => ({ passengerName, seatId })), [
    { passengerName: "Nguyễn Văn An", seatId: "A01" },
    { passengerName: "Trần Thị Bình", seatId: "A02" }
  ]);

  const html = await renderTicketHtml({ ...persisted, tickets });
  for (const ticket of tickets) {
    assert.ok(html.includes(ticket.passengerName));
    assert.ok(html.includes(ticket.seatId));
    assert.ok(html.includes(ticket.passengerPhone));
    assert.ok(html.includes(ticket.passengerEmail));
  }
});

test("guest and registered checkout identities follow separate secure rules", () => {
  assert.deepEqual(resolveCheckoutCustomer({ requestedUserId: "", user: null }), {
    ok: true,
    userId: "",
    message: ""
  });
  assert.deepEqual(resolveCheckoutCustomer({
    requestedUserId: "customer-1",
    user: { id: "customer-1", role: "CUSTOMER" }
  }), { ok: true, userId: "customer-1", message: "" });
  assert.deepEqual(resolveCheckoutCustomer({
    requestedUserId: "",
    user: { id: "customer-1", role: "CUSTOMER" }
  }), { ok: true, userId: "customer-1", message: "" });
  assert.equal(resolveCheckoutCustomer({
    requestedUserId: "customer-2",
    user: { id: "customer-1", role: "CUSTOMER" }
  }).ok, false);

  const guestBooking = { code: "BK-GUEST", customerEmail: "guest@example.com" };
  assert.equal(guestBookingEmailMatches(guestBooking, " GUEST@example.com "), true);
  assert.equal(guestBookingEmailMatches(guestBooking, "attacker@example.com"), false);
  const accessToken = createGuestAccessToken();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  assert.equal(verifiesGuestAccessToken(accessToken, hashGuestAccessToken(accessToken), expiresAt), true);
});
