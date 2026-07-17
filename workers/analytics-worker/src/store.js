import { promises as fs } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isoDate } from "@bus-ai/shared/seed";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR, "analytics.json")
  : resolve(__dirname, "../analytics.json");

let state = {
  revenueByDay: {}, // e.g. "2024-05-18": { revenue: 100000, tickets: 2 }
  popularRoutes: {}, // e.g. "Sài Gòn - Đà Lạt": { searches: 10, tickets: 5 }
  searches: 0,
  bookings: 0,
  eventCount: 0,
  events: []
};

export async function loadState() {
  try {
    const data = await fs.readFile(DB_PATH, "utf8");
    state = { ...state, ...JSON.parse(data) };
    if (!Array.isArray(state.events)) state.events = [];
    console.log("[analytics-store] Loaded state from disk.");
  } catch (err) {
    console.log("[analytics-store] No existing state found, starting fresh.");
  }
}

async function saveState() {
  try {
    await fs.mkdir(dirname(DB_PATH), { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("[analytics-store] Failed to save state:", err);
  }
}

export async function recordSearch(route) {
  state.searches++;

  if (route) {
    if (!state.popularRoutes[route]) {
      state.popularRoutes[route] = { searches: 0, tickets: 0 };
    }
    state.popularRoutes[route].searches++;
  }
  await saveState();
}

export async function recordBookingAttempt() {
  await saveState();
}

export async function recordPaymentSuccess(booking) {
  state.bookings++;

  const paymentDate = String(booking.paidAt ?? "").slice(0, 10) || isoDate(0);
  if (!state.revenueByDay[paymentDate]) {
    state.revenueByDay[paymentDate] = { revenue: 0, tickets: 0 };
  }

  state.revenueByDay[paymentDate].revenue += booking.totalAmount || 0;
  state.revenueByDay[paymentDate].tickets += booking.passengers?.length || 1;

  const route = booking.routeName;
  if (route) {
    if (!state.popularRoutes[route]) {
      state.popularRoutes[route] = { searches: 0, tickets: 0 };
    }
    state.popularRoutes[route].tickets += booking.passengers?.length || 1;
  }

  await saveState();
}

export async function recordCancellation(booking) {
  if (!booking.paidAt) return;
  const paymentDate = String(booking.paidAt).slice(0, 10) || isoDate(0);
  const tickets = booking.passengers?.length || 1;
  if (!state.revenueByDay[paymentDate]) state.revenueByDay[paymentDate] = { revenue: 0, tickets: 0 };
  state.revenueByDay[paymentDate].revenue = Math.max(
    0,
    state.revenueByDay[paymentDate].revenue - Number(booking.refundAmount || 0)
  );
  state.revenueByDay[paymentDate].tickets = Math.max(0, state.revenueByDay[paymentDate].tickets - tickets);
  state.bookings = Math.max(0, state.bookings - 1);
  if (booking.routeName && state.popularRoutes[booking.routeName]) {
    state.popularRoutes[booking.routeName].tickets = Math.max(
      0,
      state.popularRoutes[booking.routeName].tickets - tickets
    );
  }
  await saveState();
}

export async function recordEvent(event, topic) {
  state.eventCount++;
  state.events.unshift({
    eventId: event.eventId,
    eventType: event.eventType,
    topic,
    occurredAt: event.occurredAt,
    payload: event.payload ?? {}
  });
  state.events = state.events.slice(0, 200);
  await saveState();
}

export function getEvents(limit = 30) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  return state.events.slice(0, safeLimit);
}

export function getSummary() {
  const revenueByDay = Object.entries(state.revenueByDay).map(([date, data]) => ({
    date,
    revenue: data.revenue,
    tickets: data.tickets
  }));

  const popularRoutes = Object.entries(state.popularRoutes)
    .map(([route, data]) => ({
      route,
      searches: data.searches,
      tickets: data.tickets
    }))
    .sort((a, b) => b.searches - a.searches)
    .slice(0, 10);

  const conversionRate = state.searches > 0 ? (state.bookings / state.searches) : 0;

  return {
    revenueByDay,
    popularRoutes,
    conversionRate,
    eventCount: state.eventCount
  };
}
