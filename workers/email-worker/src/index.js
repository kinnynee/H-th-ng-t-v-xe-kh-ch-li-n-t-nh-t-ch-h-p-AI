import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { subscribeRabbit } from "@bus-ai/shared/broker";

const dataDir = path.resolve(process.env.DATA_DIR || "../../data");

await subscribeRabbit("email-worker.booking-paid", ["booking.paid"], async (event) => {
  const booking = event.payload;
  const line = {
    to: booking.customerEmail,
    subject: `Vé điện tử ${booking.code}`,
    bookingCode: booking.code,
    sentAt: new Date().toISOString(),
    note: "Email mô phỏng được ghi log thay vì gửi thật."
  };
  await mkdir(dataDir, { recursive: true });
  await appendFile(path.join(dataDir, "email-log.jsonl"), `${JSON.stringify(line)}\n`, "utf8");
  console.log(`[email-worker] logged email for ${booking.code} to ${booking.customerEmail}`);
});

console.log("[email-worker] started");
