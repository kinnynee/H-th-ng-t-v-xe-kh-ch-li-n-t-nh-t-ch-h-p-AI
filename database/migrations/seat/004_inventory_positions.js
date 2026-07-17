export async function up(db) {
  await db.query(`
    ALTER TABLE seat_inventory
      ADD COLUMN IF NOT EXISTS seat_row SMALLINT NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS seat_column SMALLINT NOT NULL DEFAULT 1;

    WITH positions AS (
      SELECT ctid,
        row_number() OVER (PARTITION BY trip_id, floor ORDER BY seat_id) AS seat_number
      FROM seat_inventory
    )
    UPDATE seat_inventory AS inventory
    SET seat_row = ((positions.seat_number - 1) / 2)::SMALLINT + 1,
        seat_column = CASE WHEN positions.seat_number % 2 = 1 THEN 1 ELSE 3 END
    FROM positions
    WHERE inventory.ctid = positions.ctid;

    CREATE INDEX IF NOT EXISTS seat_inventory_position_idx
      ON seat_inventory (trip_id, floor, seat_row, seat_column);
  `);
}
