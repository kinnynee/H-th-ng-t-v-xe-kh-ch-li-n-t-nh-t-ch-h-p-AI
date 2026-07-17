export async function up(db) {
  await db.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS payment_expires_at TEXT,
      ADD COLUMN IF NOT EXISTS guest_access_expires_at TEXT;
  `);
}
