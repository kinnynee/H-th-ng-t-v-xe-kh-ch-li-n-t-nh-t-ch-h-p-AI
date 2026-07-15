import assert from "node:assert/strict";
import test from "node:test";
import { validateBookingInput } from "../services/booking-service/src/validation.js";

const validBooking = {
  holdToken: "hold-123",
  customerEmail: "buyer@example.com",
  customerPhone: "0901234567",
  passengers: [{
    seatId: "A01",
    fullName: "Nguyen Van An",
    email: "passenger@example.com",
    phone: "0901234567",
    documentId: "001234567890"
  }]
};

test("accepts a complete booking request", () => {
  assert.equal(validateBookingInput(validBooking), null);
});

test("rejects incomplete passenger details and duplicate seats", () => {
  assert.match(validateBookingInput({ ...validBooking, passengers: [{ ...validBooking.passengers[0], documentId: "" }] }), /document ID/);
  assert.match(validateBookingInput({
    ...validBooking,
    passengers: [validBooking.passengers[0], { ...validBooking.passengers[0] }]
  }), /different seat/);
});
