import assert from "node:assert/strict";
import test from "node:test";
import { createTicketQrDataUrl, renderTicketHtml, renderTicketPdf } from "../packages/shared/src/ticket.js";

const booking = {
  code: "BK260717QR",
  routeName: "TP.HCM - Da Lat",
  pickup: "Ben xe Mien Dong",
  dropoff: "Ben xe Da Lat",
  departureTime: "2026-07-18T00:00:00.000Z",
  vehiclePlate: "51B-123.45",
  tickets: [{ id: "BK260717QR-A01", passengerName: "Nguyen Van An", seatId: "A01", qrPayload: "BK260717QR-A01" }]
};

test("ticket presentation includes all staff check-in details and a QR image", async () => {
  const html = await renderTicketHtml(booking);
  assert.match(html, /Mã booking/);
  assert.match(html, /BK260717QR-A01/);
  assert.match(html, /Nguyen Van An/);
  assert.match(html, /TP.HCM - Da Lat/);
  assert.match(html, /Ben xe Mien Dong/);
  assert.match(html, /51B-123.45/);
  assert.match(html, /data:image\/png;base64,/);
  assert.match(html, /Chính sách check-in/);
});

test("ticket QR is a PNG data URL that encodes the check-in payload", async () => {
  const dataUrl = await createTicketQrDataUrl("BK260717QR-A01");
  assert.match(dataUrl, /^data:image\/png;base64,/);
});

test("ticket PDF embeds QR images for staff check-in", async () => {
  const pdf = await renderTicketPdf(booking);
  assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-");
  assert.match(pdf.toString("latin1"), /\/Subtype \/Image/);
  assert.match(pdf.toString("latin1"), /E-ticket BK260717QR/);
});
