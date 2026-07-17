import { isoDate } from "@bus-ai/shared/seed";

export function createEmptyAnalyticsState() {
  return {
    eventCount: 0,
    searches: 0,
    successfulBookings: 0,
    revenueByDay: new Map(),
    popularRoutes: new Map(),
    recentEvents: []
  };
}

export function createDemoAnalyticsState() {
  const state = createEmptyAnalyticsState();
  state.searches = 14;
  state.successfulBookings = 5;
  state.revenueByDay.set(isoDate(0), { date: isoDate(0), revenue: 1640000, tickets: 5 });
  state.popularRoutes.set("TP.HCM - Đà Lạt", { route: "TP.HCM - Đà Lạt", searches: 9, tickets: 3 });
  state.popularRoutes.set("TP.HCM - Cần Thơ", { route: "TP.HCM - Cần Thơ", searches: 5, tickets: 2 });
  return state;
}
