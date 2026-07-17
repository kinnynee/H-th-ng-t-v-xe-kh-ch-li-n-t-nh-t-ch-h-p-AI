export async function up(db) {
  await db.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS cancellation_policy TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS refund_amount INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cancellation_fee INTEGER NOT NULL DEFAULT 0;
  `);
}
