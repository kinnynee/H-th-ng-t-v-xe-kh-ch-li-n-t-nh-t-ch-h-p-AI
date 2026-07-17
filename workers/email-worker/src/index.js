import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { subscribeRabbit } from "@bus-ai/shared/broker";
import { buildTicketEmail, sendTicketEmail } from "./email.js";

const dataDir = path.resolve(process.env.DATA_DIR || "../../data");
const outDir = path.join(dataDir, "emails");

async function priorDelivery(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

await subscribeRabbit("email-worker.booking-paid", ["booking.paid"], async (event) => {
  const booking = event.payload;
  // RabbitMQ may redeliver an event. A completed delivery is stored by booking
  // code so a duplicate event does not send another e-ticket.
  await mkdir(outDir, { recursive: true });
  const deliveryFile = path.join(outDir, `${booking.code}.json`);
  const previous = await priorDelivery(deliveryFile);
  if (previous?.eventId === event.eventId && previous?.delivery?.status === "sent") return;

  const email = buildTicketEmail(booking, { publicWebUrl: process.env.PUBLIC_WEB_URL });
  const record = {
    eventId: event.eventId,
    ...email,
    preparedAt: new Date().toISOString(),
    delivery: { status: "prepared" }
  };
  try {
    record.delivery = await sendTicketEmail(email, {
      smtpUrl: process.env.SMTP_URL,
      smtpFrom: process.env.SMTP_FROM
    });
  } catch (error) {
    record.delivery = { status: "failed", error: error.message };
    await writeFile(deliveryFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    throw error;
  }
  await writeFile(deliveryFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  console.log(`[email-worker] ${record.delivery.status} email for ${booking.code} to ${booking.customerEmail}`);
});

console.log("[email-worker] started");
