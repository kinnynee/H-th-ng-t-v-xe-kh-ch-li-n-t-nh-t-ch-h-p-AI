import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderTicketPdf } from "@bus-ai/shared/ticket";
import { createKeyedSerialExecutor } from "../../consumer-lock.js";
import { buildTicketEmail, isGuestTicketEmailEligible, sendTicketEmail } from "./email.js";

export const EMAIL_QUEUE_NAME = "email-worker.booking-paid";
export const BOOKING_PAID_ROUTING_KEY = "booking.paid";

async function priorDelivery(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function createEmailEventProcessor({
  dataDir,
  smtpUrl,
  smtpFrom,
  publicWebUrl,
  renderPdf = renderTicketPdf,
  sendEmail = sendTicketEmail,
  now = () => new Date(),
  logger = console
}) {
  const runSerially = createKeyedSerialExecutor();
  return async function processEmailEvent(event) {
    const booking = event?.payload;
    if (!event?.eventId || !/^[A-Za-z0-9_-]{6,100}$/.test(String(booking?.code ?? ""))) {
      throw new Error("Malformed booking.paid event");
    }
    if (!isGuestTicketEmailEligible(booking)) return { status: "ignored", bookingCode: booking.code };

    return runSerially(booking.code, async () => {
      const outDir = path.join(dataDir, "emails");
      const deliveryFile = path.join(outDir, `${booking.code}.json`);
      await mkdir(outDir, { recursive: true });
      const previous = await priorDelivery(deliveryFile);
      if (["sent", "prepared"].includes(previous?.delivery?.status)) {
        return { status: "duplicate", bookingCode: booking.code };
      }

      const email = buildTicketEmail(booking, { publicWebUrl });
      const ticketPdf = await renderPdf(booking);
      const record = {
        eventId: event.eventId,
        ...email,
        attachment: { filename: `ve-${booking.code}.pdf`, contentType: "application/pdf" },
        preparedAt: now().toISOString(),
        delivery: { status: "prepared" }
      };
      try {
        record.delivery = await sendEmail(email, { smtpUrl, smtpFrom, ticketPdf });
      } catch (error) {
        record.delivery = { status: "failed", error: error.message };
        await writeFile(deliveryFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");
        logger.error(`[email-worker] delivery failed for ${booking.code}: ${error.message}`);
        throw error;
      }
      await writeFile(deliveryFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      logger.log(`[email-worker] ${record.delivery.status} email for ${booking.code} to ${booking.customerEmail}`);
      return { status: record.delivery.status, bookingCode: booking.code };
    });
  };
}
