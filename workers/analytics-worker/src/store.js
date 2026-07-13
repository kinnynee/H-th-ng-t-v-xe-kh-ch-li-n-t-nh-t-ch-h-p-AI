import { promises as fs } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isoDate } from "@bus-ai/shared/seed";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../analytics.json");

let state = {
  revenueByDay: {}, // e.g. "2024-05-18": { revenue: 100000, tickets: 2 }
  popularRoutes: {}, // e.g. "Sài Gòn - Đà Lạt": { searches: 10, tickets: 5 }
  searches: 0,
  bookings: 0,
  eventCount: 0
};

export async function loadState() {
  try {
    const data = await fs.readFile(DB_PATH, "utf8");
    state = JSON.parse(data);
    console.log("[analytics-store] Loaded state from disk.");
  } catch (err) {
    console.log("[analytics-store] No existing state found, starting fresh.");
  }
}

async function saveState() {
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("[analytics-store] Failed to save state:", err);
  }
}

export async function recordSearch(route) {
  state.searches++;
  state.eventCount++;
  
  if (route) {
    if (!state.popularRoutes[route]) {
      state.popularRoutes[route] = { searches: 0, tickets: 0 };
    }
    state.popularRoutes[route].searches++;
  }
  await saveState();
}

export async function recordBookingAttempt() {
  state.eventCount++;
  await saveState();
}

export async function recordPaymentSuccess(booking) {
  state.bookings++;
  state.eventCount++;
  
  const today = isoDate(0);
  if (!state.revenueByDay[today]) {
    state.revenueByDay[today] = { revenue: 0, tickets: 0 };
  }
  
  state.revenueByDay[today].revenue += booking.totalAmount || 0;
  state.revenueByDay[today].tickets += booking.passengers?.length || 1;
  
  const route = booking.routeName;
  if (route) {
    if (!state.popularRoutes[route]) {
      state.popularRoutes[route] = { searches: 0, tickets: 0 };
    }
    state.popularRoutes[route].tickets += booking.passengers?.length || 1;
  }
  
  await saveState();
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
