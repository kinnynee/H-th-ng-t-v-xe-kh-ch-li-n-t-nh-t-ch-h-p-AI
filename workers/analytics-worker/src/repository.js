import { jsonValue, withTransaction } from "@bus-ai/shared/postgres";

export async function recordEvent(pool, event, topic) {
  if (!pool) return true;
  const result = await pool.query(
    `INSERT INTO analytics_events (event_id, event_type, topic, occurred_at, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT (event_id) DO NOTHING`,
    [event.eventId, event.eventType, topic, event.occurredAt, JSON.stringify(event.payload ?? {})]
  );
  return result.rowCount === 1;
}

function safeDate(value) {
  const parsed = new Date(value ?? Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function safeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.trunc(amount) : 0;
}

/**
 * Commits the event inbox record and every affected aggregate together. If an
 * aggregate update fails, the inbox insert rolls back too, so Kafka can retry
 * safely instead of silently losing the event.
 */
export async function applyAnalyticsEvent(pool, event, topic) {
  if (!pool) return { applied: true };
  const payload = event.payload ?? {};
  const isSearch = topic === "search-events" || event.eventType === "TripSearchPerformed";
  const isPayment = event.eventType === "PaymentSucceeded";
  return withTransaction(pool, async (db) => {
    const inserted = await db.query(
      `INSERT INTO analytics_events (event_id, event_type, topic, occurred_at, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [event.eventId, event.eventType, topic, event.occurredAt, JSON.stringify(payload)]
    );
    if (!inserted.rowCount) return { applied: false };

    await db.query(
      `INSERT INTO analytics_counters (id, event_count, searches, successful_bookings)
       VALUES (1, 1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET
         event_count = analytics_counters.event_count + 1,
         searches = analytics_counters.searches + EXCLUDED.searches,
         successful_bookings = analytics_counters.successful_bookings + EXCLUDED.successful_bookings`,
      [isSearch ? 1 : 0, isPayment ? 1 : 0]
    );

    if (isSearch) {
      const route = `${payload.from ?? ""} - ${payload.to ?? ""}`;
      if (route !== " - ") {
        await db.query(
          `INSERT INTO analytics_popular_routes (route, searches, tickets)
           VALUES ($1, 1, 0)
           ON CONFLICT (route) DO UPDATE SET searches = analytics_popular_routes.searches + 1`,
          [route]
        );
      }
    }

    if (isPayment) {
      const date = safeDate(payload.paidAt);
      const tickets = Array.isArray(payload.seatIds) ? payload.seatIds.length : 0;
      await db.query(
        `INSERT INTO analytics_revenue_by_day (date, revenue, tickets)
         VALUES ($1, $2, $3)
         ON CONFLICT (date) DO UPDATE SET
           revenue = analytics_revenue_by_day.revenue + EXCLUDED.revenue,
           tickets = analytics_revenue_by_day.tickets + EXCLUDED.tickets`,
        [date, safeAmount(payload.totalAmount), tickets]
      );
      if (payload.routeName) {
        await db.query(
          `INSERT INTO analytics_popular_routes (route, searches, tickets)
           VALUES ($1, 0, $2)
           ON CONFLICT (route) DO UPDATE SET tickets = analytics_popular_routes.tickets + EXCLUDED.tickets`,
          [payload.routeName, tickets]
        );
      }
    }
    return { applied: true };
  });
}

export async function listAnalyticsEvents(pool, limit = 20) {
  if (!pool) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const { rows } = await pool.query(
    `SELECT event_id, event_type, topic, occurred_at, payload
     FROM analytics_events ORDER BY processed_at DESC LIMIT $1`,
    [safeLimit]
  );
  return rows.map((row) => ({
    eventId: row.event_id,
    eventType: row.event_type,
    topic: row.topic,
    occurredAt: row.occurred_at,
    payload: jsonValue(row.payload, {})
  }));
}

export async function loadAnalyticsState(pool, fallback) {
  if (!pool) return fallback;
  const [counterRows, revenueRows, routeRows] = await Promise.all([
    pool.query("SELECT event_count, searches, successful_bookings FROM analytics_counters WHERE id = 1"),
    pool.query("SELECT date, revenue, tickets FROM analytics_revenue_by_day ORDER BY date"),
    pool.query("SELECT route, searches, tickets FROM analytics_popular_routes ORDER BY route")
  ]);
  if (!counterRows.rowCount) return fallback;
  const counter = counterRows.rows[0];
  return {
    eventCount: Number(counter.event_count),
    searches: Number(counter.searches),
    successfulBookings: Number(counter.successful_bookings),
    revenueByDay: new Map(revenueRows.rows.map((row) => [row.date, {
      date: row.date,
      revenue: Number(row.revenue),
      tickets: Number(row.tickets)
    }])),
    popularRoutes: new Map(routeRows.rows.map((row) => [row.route, {
      route: row.route,
      searches: Number(row.searches),
      tickets: Number(row.tickets)
    }])),
    recentEvents: []
  };
}

export async function saveAnalyticsState(pool, state) {
  if (!pool) return;
  await withTransaction(pool, async (db) => {
    await db.query(
      `INSERT INTO analytics_counters (id, event_count, searches, successful_bookings)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET event_count = EXCLUDED.event_count, searches = EXCLUDED.searches, successful_bookings = EXCLUDED.successful_bookings`,
      [state.eventCount, state.searches, state.successfulBookings]
    );
    await db.query("DELETE FROM analytics_revenue_by_day");
    for (const item of state.revenueByDay.values()) {
      await db.query(
        "INSERT INTO analytics_revenue_by_day (date, revenue, tickets) VALUES ($1, $2, $3)",
        [item.date, item.revenue, item.tickets]
      );
    }
    await db.query("DELETE FROM analytics_popular_routes");
    for (const item of state.popularRoutes.values()) {
      await db.query(
        "INSERT INTO analytics_popular_routes (route, searches, tickets) VALUES ($1, $2, $3)",
        [item.route, item.searches, item.tickets]
      );
    }
  });
}
