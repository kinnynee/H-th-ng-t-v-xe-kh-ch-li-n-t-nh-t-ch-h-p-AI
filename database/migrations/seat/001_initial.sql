CREATE TABLE IF NOT EXISTS seat_assignments (
  trip_id TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('BOOKED', 'BLOCKED')),
  booking_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trip_id, seat_id)
);

CREATE INDEX IF NOT EXISTS seat_assignments_booking_idx ON seat_assignments (booking_code);
