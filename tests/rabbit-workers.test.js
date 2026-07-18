import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { eventEnvelope } from "../packages/shared/src/broker.js";
import {
  BOOKING_PAID_ROUTING_KEY as TICKET_ROUTING_KEY,
  createTicketEventProcessor,
  TICKET_QUEUE_NAME
} from "../workers/ticket-worker/src/processor.js";
import {
  BOOKING_PAID_ROUTING_KEY as EMAIL_ROUTING_KEY,
  createEmailEventProcessor,
  EMAIL_QUEUE_NAME
} from "../workers/email-worker/src/processor.js";

const silentLogger = { log() {}, error() {} };
const booking = {
  code: "BK-RABBIT-100",
  customerEmail: "guest@example.com",
  userId: "",
  status: "TICKET_ISSUED",
  routeName: "TP.HCM - Đà Lạt",
  departureTime: "2026-07-18T07:00:00.000Z",
  pickup: "Bến xe Miền Đông",
  dropoff: "Bến xe Đà Lạt",
  totalAmount: 250000,
  tickets: [{ id: "BK-RABBIT-100-A01", passengerName: "Nguyễn Văn An", seatId: "A01" }]
};

test("booking.paid is handled once by each dedicated ticket and email queue", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "bus-rabbit-workers-"));
  context.after(() => rm(dataDir, { recursive: true, force: true }));
  assert.notEqual(TICKET_QUEUE_NAME, EMAIL_QUEUE_NAME);
  assert.equal(TICKET_ROUTING_KEY, "booking.paid");
  assert.equal(EMAIL_ROUTING_KEY, "booking.paid");

  let htmlRenders = 0;
  let pdfRenders = 0;
  let emailPdfRenders = 0;
  let deliveries = 0;
  const ticketProcessor = createTicketEventProcessor({
    dataDir,
    renderHtml: async () => { htmlRenders += 1; return "<html>ticket</html>"; },
    renderPdf: async () => { pdfRenders += 1; return Buffer.from("ticket-pdf"); },
    logger: silentLogger
  });
  const emailProcessor = createEmailEventProcessor({
    dataDir,
    renderPdf: async () => { emailPdfRenders += 1; return Buffer.from("email-pdf"); },
    sendEmail: async () => { deliveries += 1; return { status: "sent", messageId: "smtp-id" }; },
    logger: silentLogger
  });
  const event = eventEnvelope("booking.paid", booking, booking.code);

  const ticketResults = await Promise.all([ticketProcessor(event), ticketProcessor(event)]);
  const emailResults = await Promise.all([emailProcessor(event), emailProcessor(event)]);
  assert.deepEqual(ticketResults.map((result) => result.status).sort(), ["duplicate", "generated"]);
  assert.deepEqual(emailResults.map((result) => result.status).sort(), ["duplicate", "sent"]);
  assert.equal(htmlRenders, 1);
  assert.equal(pdfRenders, 1);
  assert.equal(emailPdfRenders, 1);
  assert.equal(deliveries, 1);

  const ticketMarker = JSON.parse(await readFile(
    path.join(dataDir, "processed-events", "ticket-worker", `${booking.code}.json`),
    "utf8"
  ));
  const emailRecord = JSON.parse(await readFile(path.join(dataDir, "emails", `${booking.code}.json`), "utf8"));
  assert.equal(ticketMarker.eventId, event.eventId);
  assert.equal(emailRecord.eventId, event.eventId);
  assert.equal(emailRecord.delivery.status, "sent");
});

test("email failures are logged durably and a Rabbit retry can complete delivery", async (context) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "bus-rabbit-retry-"));
  context.after(() => rm(dataDir, { recursive: true, force: true }));
  const errors = [];
  let attempts = 0;
  const processor = createEmailEventProcessor({
    dataDir,
    renderPdf: async () => Buffer.from("email-pdf"),
    sendEmail: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("SMTP unavailable");
      return { status: "sent", messageId: "smtp-recovered" };
    },
    logger: { log() {}, error(message) { errors.push(message); } }
  });
  const event = eventEnvelope("booking.paid", { ...booking, code: "BK-RABBIT-RETRY" });

  await assert.rejects(() => processor(event), /SMTP unavailable/);
  const failed = JSON.parse(await readFile(path.join(dataDir, "emails", "BK-RABBIT-RETRY.json"), "utf8"));
  assert.equal(failed.delivery.status, "failed");
  assert.match(errors[0], /delivery failed/);

  const retried = await processor(event);
  assert.equal(retried.status, "sent");
  assert.equal(attempts, 2);
});
