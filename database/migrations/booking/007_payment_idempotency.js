export async function up(db) {
  await db.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS payment_idempotency_key TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS bookings_payment_idempotency_key_unique
      ON bookings (payment_idempotency_key)
      WHERE payment_idempotency_key IS NOT NULL;
  `);
}
