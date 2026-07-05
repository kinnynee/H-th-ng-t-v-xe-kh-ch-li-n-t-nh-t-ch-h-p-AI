import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { subscribeRabbit } from "@bus-ai/shared/broker";

await subscribeRabbit("email-worker.booking-paid", ["booking.paid"], async (event) => {
  const booking = event.payload;
  const line = {
    to: booking.customerEmail,
    subject: `Vé điện tử ${booking.code}`,
    bookingCode: booking.code,
    sentAt: new Date().toISOString(),
    note: "Email mô phỏng được ghi log thay vì gửi thật."
  };
  await mkdir("data", { recursive: true });
  await appendFile(path.resolve("data/email-log.jsonl"), `${JSON.stringify(line)}\n`, "utf8");
  console.log(`[email-worker] logged email for ${booking.code} to ${booking.customerEmail}`);
});

console.log("[email-worker] started");
