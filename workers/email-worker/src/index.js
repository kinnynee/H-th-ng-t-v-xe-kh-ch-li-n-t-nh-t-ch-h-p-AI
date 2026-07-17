import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { subscribeRabbit } from "@bus-ai/shared/broker";

await subscribeRabbit("email-worker.booking-paid", ["booking.paid"], async (event) => {
  const booking = event.payload;
  // This is a desired-state artifact, not an append-only side effect. RabbitMQ
  // may redeliver an event, so writing by booking code keeps delivery idempotent.
  const email = {
    eventId: event.eventId,
    to: booking.customerEmail,
    subject: `E-ticket ${booking.code}`,
    bookingCode: booking.code,
    preparedAt: new Date().toISOString(),
    note: "Simulated email payload."
  };
  const outDir = path.resolve("data/emails");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${booking.code}.json`), `${JSON.stringify(email, null, 2)}\n`, "utf8");
  console.log(`[email-worker] prepared email for ${booking.code} to ${booking.customerEmail}`);
});

console.log("[email-worker] started");
