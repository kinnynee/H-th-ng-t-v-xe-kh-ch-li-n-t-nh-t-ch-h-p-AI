export async function up(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      topic TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      payload JSONB NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS analytics_counters (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      event_count INTEGER NOT NULL,
      searches INTEGER NOT NULL,
      successful_bookings INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_revenue_by_day (
      date TEXT PRIMARY KEY,
      revenue BIGINT NOT NULL,
      tickets INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_popular_routes (
      route TEXT PRIMARY KEY,
      searches INTEGER NOT NULL,
      tickets INTEGER NOT NULL
    );
  `);
}
