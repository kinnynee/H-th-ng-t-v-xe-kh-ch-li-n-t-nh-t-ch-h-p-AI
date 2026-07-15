export async function up(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS saved_passengers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      document_id TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS saved_passengers_user_idx ON saved_passengers (user_id);

    CREATE TABLE IF NOT EXISTS bookings (
      code TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      route_name TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      pickup TEXT NOT NULL,
      dropoff TEXT NOT NULL,
      vehicle_plate TEXT NOT NULL,
      hold_token TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      user_id TEXT,
      seat_ids JSONB NOT NULL,
      passengers JSONB NOT NULL,
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      tickets JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      paid_at TEXT,
      checked_in_at TEXT,
      cancelled_at TEXT
    );

    CREATE INDEX IF NOT EXISTS bookings_lookup_idx ON bookings (customer_email, trip_id, user_id, status);
  `);
}
