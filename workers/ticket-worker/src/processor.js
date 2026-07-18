import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderTicketHtml, renderTicketPdf } from "@bus-ai/shared/ticket";
import { createKeyedSerialExecutor } from "../../consumer-lock.js";

export const TICKET_QUEUE_NAME = "ticket-worker.booking-paid";
export const BOOKING_PAID_ROUTING_KEY = "booking.paid";

function validBooking(event) {
  const booking = event?.payload;
  if (!event?.eventId || !/^[A-Za-z0-9_-]{6,100}$/.test(String(booking?.code ?? ""))) {
    throw new Error("Malformed booking.paid event");
  }
  if (booking.status !== "TICKET_ISSUED" || !Array.isArray(booking.tickets) || booking.tickets.length === 0) {
    throw new Error("booking.paid must contain issued tickets");
  }
  return booking;
}

async function completedMarker(file) {
  try {
    return Boolean(JSON.parse(await readFile(file, "utf8")).completedAt);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function createTicketEventProcessor({
  dataDir,
  renderHtml = renderTicketHtml,
  renderPdf = renderTicketPdf,
  now = () => new Date(),
  logger = console
}) {
  const runSerially = createKeyedSerialExecutor();
  return async function processTicketEvent(event) {
    const booking = validBooking(event);
    return runSerially(booking.code, async () => {
      const outDir = path.join(dataDir, "generated-tickets");
      const markerDir = path.join(dataDir, "processed-events", "ticket-worker");
      const markerFile = path.join(markerDir, `${booking.code}.json`);
      await mkdir(outDir, { recursive: true });
      await mkdir(markerDir, { recursive: true });
      if (await completedMarker(markerFile)) return { status: "duplicate", bookingCode: booking.code };

      await writeFile(path.join(outDir, `${booking.code}.html`), await renderHtml(booking), "utf8");
      await writeFile(path.join(outDir, `${booking.code}.pdf`), await renderPdf(booking));
      await writeFile(markerFile, `${JSON.stringify({
        eventId: event.eventId,
        bookingCode: booking.code,
        completedAt: now().toISOString()
      })}\n`, "utf8");
      logger.log(`[ticket-worker] generated ticket HTML/PDF for ${booking.code}`);
      return { status: "generated", bookingCode: booking.code };
    });
  };
}
