import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTicketEmail,
  isGuestTicketEmailEligible,
  sendTicketEmail
} from "../workers/email-worker/src/email.js";

const booking = {
  code: "BK260717MAIL",
  customerEmail: "guest@example.com",
  userId: "",
  status: "TICKET_ISSUED",
  routeName: "TP.HCM - Da Lat",
  departureTime: "2026-07-18T07:00:00.000Z",
  pickup: "Ben xe Mien Dong",
  dropoff: "Ben xe Da Lat",
  totalAmount: 250000,
  tickets: [{ id: "BK260717MAIL-A01", passengerName: "Nguyen Van An", seatId: "A01" }]
};

test("only issued guest bookings are eligible for the guest ticket email", () => {
  assert.equal(isGuestTicketEmailEligible(booking), true);
  assert.equal(isGuestTicketEmailEligible({ ...booking, userId: "customer-1" }), false);
  assert.equal(isGuestTicketEmailEligible({ ...booking, status: "PENDING_PAYMENT" }), false);
  assert.equal(isGuestTicketEmailEligible({ ...booking, tickets: [] }), false);
});

test("guest e-ticket email contains a safe lookup link and ticket details", () => {
  const email = buildTicketEmail(booking, { publicWebUrl: "https://tickets.example.com/" });
  assert.equal(email.to, "guest@example.com");
  assert.match(email.text, /https:\/\/tickets\.example\.com\/booking\/BK260717MAIL/);
  assert.match(email.html, /BK260717MAIL-A01/);
  assert.match(email.subject, /Vé điện tử BK260717MAIL đã được xuất/);
  assert.doesNotMatch(email.html, /guestAccessToken/);
});

test("guest e-ticket email is retained as a local artifact without SMTP", async () => {
  const delivery = await sendTicketEmail(buildTicketEmail(booking));
  assert.deepEqual(delivery, { status: "prepared" });
});

test("guest e-ticket email uses configured SMTP transport", async () => {
  const sent = [];
  const transports = [];
  const delivery = await sendTicketEmail(buildTicketEmail(booking), {
    smtpUrl: "smtp://mail.example.com",
    smtpFrom: "tickets@example.com",
    ticketPdf: Buffer.from("ticket-pdf"),
    createTransport: (options) => {
      transports.push(options);
      return { sendMail: async (message) => { sent.push(message); return { messageId: "smtp-123" }; } };
    }
  });
  assert.deepEqual(delivery, { status: "sent", messageId: "smtp-123" });
  assert.equal(sent[0].to, booking.customerEmail);
  assert.equal(sent[0].from, "tickets@example.com");
  assert.equal(sent[0].attachments[0].filename, "ve-BK260717MAIL.pdf");
  assert.equal(sent[0].attachments[0].contentType, "application/pdf");
  assert.equal(transports[0].host, "mail.example.com");
  assert.equal(transports[0].port, 587);
  assert.equal(transports[0].family, 4);
});
