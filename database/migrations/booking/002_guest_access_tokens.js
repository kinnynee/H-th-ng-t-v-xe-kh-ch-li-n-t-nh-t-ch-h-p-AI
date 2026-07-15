export async function up(db) {
  await db.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS guest_access_token_hash TEXT;
  `);
}
