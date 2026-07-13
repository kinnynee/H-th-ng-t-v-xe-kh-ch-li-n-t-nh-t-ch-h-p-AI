import express from "express";
import cors from "cors";
import { subscribeKafka } from "@bus-ai/shared/broker";
import { loadState, recordSearch, recordBookingAttempt, recordPaymentSuccess, getSummary } from "./store.js";

const app = express();
app.use(cors());

app.get("/health", (req, res) => res.json({ ok: true, service: "analytics-worker" }));
app.get("/summary", (req, res) => res.json(getSummary()));

async function main() {
  console.log(`[analytics-worker] Starting analytics worker...`);
  await loadState();

  const TOPICS = ["search-events", "booking-events", "payment-events"];

  try {
    // Note: Kafka consumer needs group id and list of topics
    await subscribeKafka("analytics-worker-group", TOPICS, async (message, topic) => {
      console.log(`[analytics-worker] Received event on ${topic}:`, message);
      
      const { eventType, payload } = message;
      
      try {
        if (topic === "search-events" && eventType === "TripSearchPerformed") {
          const route = payload.from && payload.to ? `${payload.from} - ${payload.to}` : null;
          await recordSearch(route);
        } else if (topic === "booking-events" && eventType === "BookingCreated") {
          await recordBookingAttempt();
        } else if (topic === "payment-events" && eventType === "PaymentSucceeded") {
          await recordPaymentSuccess(payload);
        }
      } catch (err) {
        console.error(`[analytics-worker] Error processing event:`, err);
      }
    });
    console.log(`[analytics-worker] Subscribed to topics: ${TOPICS.join(", ")}`);
  } catch (err) {
    console.error(`[analytics-worker] Failed to connect broker:`, err);
    // fallback logic or simply keep alive
    setInterval(() => {
      console.log("[analytics-worker] Running in fallback mode without broker.");
    }, 60000);
  }

  const port = process.env.PORT || 4050;
  app.listen(port, () => {
    console.log(`[analytics-worker] HTTP server listening on port ${port}`);
  });
}

main().catch(console.error);