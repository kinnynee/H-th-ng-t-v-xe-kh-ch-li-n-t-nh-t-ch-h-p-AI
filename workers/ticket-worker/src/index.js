import path from "node:path";
import { subscribeRabbit } from "@bus-ai/shared/broker";
import {
  BOOKING_PAID_ROUTING_KEY,
  createTicketEventProcessor,
  TICKET_QUEUE_NAME
} from "./processor.js";

const processEvent = createTicketEventProcessor({
  dataDir: path.resolve(process.env.DATA_DIR || "../../data")
});

await subscribeRabbit(TICKET_QUEUE_NAME, [BOOKING_PAID_ROUTING_KEY], processEvent, {
  maxRetries: Number(process.env.RABBITMQ_MAX_RETRIES || 3),
  retryDelayMs: Number(process.env.RABBITMQ_RETRY_DELAY_MS || 500)
});

console.log("[ticket-worker] started");
