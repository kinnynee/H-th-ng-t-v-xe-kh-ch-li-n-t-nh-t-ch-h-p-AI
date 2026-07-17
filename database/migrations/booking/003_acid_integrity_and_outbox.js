export async function up(db) {
  await db.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE bookings
      ALTER COLUMN version SET DEFAULT 0;

    UPDATE bookings
      SET version = 0
      WHERE version IS NULL;

    CREATE INDEX IF NOT EXISTS bookings_status_updated_idx
      ON bookings (status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS booking_outbox (
      event_id TEXT PRIMARY KEY,
      booking_code TEXT NOT NULL REFERENCES bookings(code) ON DELETE CASCADE,
      destination TEXT NOT NULL CHECK (destination IN ('kafka', 'rabbit', 'seat')),
      topic TEXT NOT NULL,
      routing_key TEXT,
      envelope JSONB NOT NULL,
      available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_until TIMESTAMPTZ,
      lock_token TEXT,
      published_at TIMESTAMPTZ,
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS booking_outbox_ready_idx
      ON booking_outbox (available_at, created_at)
      WHERE published_at IS NULL;

    CREATE INDEX IF NOT EXISTS booking_outbox_booking_idx
      ON booking_outbox (booking_code, created_at);
  `);

  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_status_valid') THEN
        ALTER TABLE bookings ADD CONSTRAINT bookings_status_valid CHECK (
          status IN (
            'PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAYMENT_FAILED',
            'TICKET_ISSUED', 'PAID', 'CHECKED_IN', 'CANCELLED', 'EXPIRED'
          )
        );
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_total_amount_nonnegative') THEN
        ALTER TABLE bookings ADD CONSTRAINT bookings_total_amount_nonnegative CHECK (total_amount >= 0);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_json_shape_valid') THEN
        ALTER TABLE bookings ADD CONSTRAINT bookings_json_shape_valid CHECK (
          jsonb_typeof(seat_ids) = 'array'
          AND jsonb_array_length(seat_ids) > 0
          AND jsonb_typeof(passengers) = 'array'
          AND jsonb_array_length(passengers) = jsonb_array_length(seat_ids)
          AND jsonb_typeof(tickets) = 'array'
        );
      END IF;
    END $$;
  `);
}
