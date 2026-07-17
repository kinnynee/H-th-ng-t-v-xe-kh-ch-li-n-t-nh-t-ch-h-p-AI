import express from "express";
import cors from "cors";
import { subscribeKafka } from "@bus-ai/shared/broker";
import {
  loadState, recordEvent, recordSearch, recordBookingAttempt, recordPaymentSuccess,
  recordCancellation, getEvents, getSummary
} from "./store.js";

const app = express();
app.use(cors());

app.get("/health", (req, res) => res.json({ ok: true, service: "analytics-worker" }));
app.get("/summary", (req, res) => res.json(getSummary()));
app.get("/events", (req, res) => res.json({ events: getEvents(req.query.limit) }));

async function main() {
  console.log(`[analytics-worker] Starting analytics worker...`);
  await loadState();

  const TOPICS = ["search-events", "booking-events", "payment-events"];

  try {
    // Note: Kafka consumer needs group id and list of topics
    const subscribed = await subscribeKafka("analytics-worker-group", TOPICS, async (message, topic) => {
      console.log(`[analytics-worker] Received event on ${topic}:`, message);
      
      const { eventType, payload } = message;
      
      try {
        await recordEvent(message, topic);
        if (topic === "search-events" && eventType === "TripSearchPerformed") {
          const route = payload.from && payload.to ? `${payload.from} - ${payload.to}` : null;
          await recordSearch(route);
        } else if (topic === "booking-events" && eventType === "BookingCreated") {
          await recordBookingAttempt();
        } else if (topic === "payment-events" && eventType === "PaymentSucceeded") {
          await recordPaymentSuccess(payload);
        } else if (topic === "booking-events" && eventType === "BookingCancelled") {
          await recordCancellation(payload);
        }
      } catch (err) {
        console.error(`[analytics-worker] Error processing event:`, err);
      }
    });
    console.log(subscribed
      ? `[analytics-worker] Subscribed to topics: ${TOPICS.join(", ")}`
      : "[analytics-worker] Running without a Kafka subscription.");
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
