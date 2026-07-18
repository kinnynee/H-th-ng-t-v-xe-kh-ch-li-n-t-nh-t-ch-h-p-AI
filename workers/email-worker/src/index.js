import path from "node:path";
import { subscribeRabbit } from "@bus-ai/shared/broker";
import {
  BOOKING_PAID_ROUTING_KEY,
  createEmailEventProcessor,
  EMAIL_QUEUE_NAME
} from "./processor.js";

const processEvent = createEmailEventProcessor({
  dataDir: path.resolve(process.env.DATA_DIR || "../../data"),
  smtpUrl: process.env.SMTP_URL,
  smtpFrom: process.env.SMTP_FROM,
  publicWebUrl: process.env.PUBLIC_WEB_URL
});

await subscribeRabbit(EMAIL_QUEUE_NAME, [BOOKING_PAID_ROUTING_KEY], processEvent, {
  maxRetries: Number(process.env.RABBITMQ_MAX_RETRIES || 3),
  retryDelayMs: Number(process.env.RABBITMQ_RETRY_DELAY_MS || 500)
});

console.log("[email-worker] started");
