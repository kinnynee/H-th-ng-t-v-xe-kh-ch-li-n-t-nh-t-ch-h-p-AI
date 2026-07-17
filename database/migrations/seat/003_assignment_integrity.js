export async function up(db) {
  await db.query(`
    CREATE INDEX IF NOT EXISTS seat_assignments_trip_state_idx
      ON seat_assignments (trip_id, state, seat_id);
  `);

  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seat_assignments_inventory_fk') THEN
        ALTER TABLE seat_assignments
          ADD CONSTRAINT seat_assignments_inventory_fk
          FOREIGN KEY (trip_id, seat_id)
          REFERENCES seat_inventory (trip_id, seat_id)
          ON DELETE RESTRICT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seat_assignments_booking_code_valid') THEN
        ALTER TABLE seat_assignments
          ADD CONSTRAINT seat_assignments_booking_code_valid CHECK (
            (state = 'BOOKED' AND booking_code IS NOT NULL)
            OR (state = 'BLOCKED' AND booking_code IS NULL)
          );
      END IF;
    END $$;
  `);
}
