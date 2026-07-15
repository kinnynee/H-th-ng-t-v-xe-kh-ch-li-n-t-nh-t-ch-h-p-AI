export async function up(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS seat_inventory (
      trip_id TEXT NOT NULL,
      seat_id TEXT NOT NULL,
      label TEXT NOT NULL,
      floor SMALLINT NOT NULL CHECK (floor > 0),
      PRIMARY KEY (trip_id, seat_id)
    );

    CREATE INDEX IF NOT EXISTS seat_inventory_trip_idx ON seat_inventory (trip_id, floor, seat_id);
  `);
}
