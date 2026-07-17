import express from "express";
import cors from "cors";
import { subscribeKafka } from "@bus-ai/shared/broker";
import { connectPostgres } from "@bus-ai/shared/postgres";
import { assertAuthConfiguration, authenticate, authorize } from "@bus-ai/shared/auth";
import { applyAnalyticsEvent, listAnalyticsEvents, loadAnalyticsState } from "./repository.js";
import { createEmptyAnalyticsState } from "./state.js";

const app = express();
app.use(cors());
assertAuthConfiguration();

function requireRoles(...roles) {
  return (req, res, next) => {
    try {
      req.user = authorize(authenticate(req.headers), roles);
      next();
    } catch (error) {
      res.status(error.status ?? 401).json({ error: error.message });
    }
  };
}

let state = createEmptyAnalyticsState();
const database = await connectPostgres(process.env.DATABASE_URL, "analytics-worker");
if (database) state = await loadAnalyticsState(database, state);

function incrementRoute(route, field, amount = 1) {
  if (!route || route === " - ") return;
  const current = state.popularRoutes.get(route) ?? { route, searches: 0, tickets: 0 };
  current[field] += amount;
  state.popularRoutes.set(route, current);
}

function applyToMemory(event, topic) {
  const payload = event.payload ?? {};
  state.eventCount += 1;
  state.recentEvents.unshift({
    eventId: event.eventId,
    eventType: event.eventType,
    topic,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
    payload
  });
  state.recentEvents = state.recentEvents.slice(0, 100);

  const isSearch = topic === "search-events" || event.eventType === "TripSearchPerformed";
  if (isSearch) {
    state.searches += 1;
    incrementRoute(`${payload.from ?? ""} - ${payload.to ?? ""}`, "searches");
  }
  if (event.eventType === "PaymentSucceeded") {
    state.successfulBookings += 1;
    const parsedDate = new Date(payload.paidAt ?? Date.now());
    const date = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString().slice(0, 10) : parsedDate.toISOString().slice(0, 10);
    const current = state.revenueByDay.get(date) ?? { date, revenue: 0, tickets: 0 };
    current.revenue += Number.isFinite(Number(payload.totalAmount)) ? Number(payload.totalAmount) : 0;
    current.tickets += Array.isArray(payload.seatIds) ? payload.seatIds.length : 0;
    state.revenueByDay.set(date, current);
    incrementRoute(payload.routeName, "tickets", Array.isArray(payload.seatIds) ? payload.seatIds.length : 0);
  }
}

async function handleEvent(event, topic) {
  // The inbox row and aggregate mutations share one transaction. Only update
  // this process's read model after the durable transaction commits.
  const result = await applyAnalyticsEvent(database, event, topic);
  if (!result.applied) return;
  applyToMemory(event, topic);
}

subscribeKafka("analytics-worker", ["search-events", "booking-events", "payment-events", "operation-events"], handleEvent);

function summary() {
  return {
    revenueByDay: [...state.revenueByDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    popularRoutes: [...state.popularRoutes.values()].sort((a, b) => b.searches - a.searches),
    conversionRate: state.searches ? Number((state.successfulBookings / state.searches).toFixed(2)) : 0,
    eventCount: state.eventCount
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "analytics-worker" });
});

app.get("/summary", requireRoles("ADMIN", "STAFF"), (_req, res) => {
  res.json(summary());
});

app.get("/events", requireRoles("ADMIN", "STAFF"), async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const events = database ? await listAnalyticsEvents(database, limit) : state.recentEvents.slice(0, limit);
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const port = Number(process.env.PORT || 4050);
app.listen(port, () => {
  console.log(`[analytics-worker] listening on http://localhost:${port}`);
});
