import express from "express";
import cors from "cors";
import { subscribeKafka } from "@bus-ai/shared/broker";
import { isoDate } from "@bus-ai/shared/seed";

const app = express();
app.use(cors());

const state = {
  eventCount: 0,
  searches: 14,
  successfulBookings: 5,
  revenueByDay: new Map([[isoDate(0), { date: isoDate(0), revenue: 1640000, tickets: 5 }]]),
  popularRoutes: new Map([
    ["TP.HCM - Đà Lạt", { route: "TP.HCM - Đà Lạt", searches: 9, tickets: 3 }],
    ["TP.HCM - Cần Thơ", { route: "TP.HCM - Cần Thơ", searches: 5, tickets: 2 }]
  ])
};

function incRoute(route, field, amount = 1) {
  if (!route || route === " - ") return;
  const current = state.popularRoutes.get(route) ?? { route, searches: 0, tickets: 0 };
  current[field] += amount;
  state.popularRoutes.set(route, current);
}

async function handleEvent(event, topic) {
  state.eventCount += 1;
  const payload = event.payload ?? {};
  if (topic === "search-events" || event.eventType === "TripSearchPerformed") {
    state.searches += 1;
    incRoute(`${payload.from} - ${payload.to}`, "searches", 1);
  }
  if (event.eventType === "BookingCreated") {
    state.successfulBookings += 0;
  }
  if (event.eventType === "PaymentSucceeded") {
    state.successfulBookings += 1;
    const date = new Date(payload.paidAt ?? Date.now()).toISOString().slice(0, 10);
    const current = state.revenueByDay.get(date) ?? { date, revenue: 0, tickets: 0 };
    current.revenue += Number(payload.totalAmount ?? 0);
    current.tickets += payload.seatIds?.length ?? 0;
    state.revenueByDay.set(date, current);
    incRoute(payload.routeName, "tickets", payload.seatIds?.length ?? 0);
  }
}

subscribeKafka("analytics-worker", ["search-events", "booking-events", "payment-events"], handleEvent);

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

app.get("/summary", (_req, res) => {
  res.json(summary());
});

const port = Number(process.env.PORT || 4050);
app.listen(port, () => {
  console.log(`[analytics-worker] listening on http://localhost:${port}`);
});
