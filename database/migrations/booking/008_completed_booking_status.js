export async function up(db) {
  await db.query(`
    ALTER TABLE bookings
      DROP CONSTRAINT IF EXISTS bookings_status_valid;

    ALTER TABLE bookings
      ADD CONSTRAINT bookings_status_valid CHECK (
        status IN (
          'PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAYMENT_FAILED',
          'PAID', 'TICKET_ISSUED', 'PARTIALLY_CHECKED_IN', 'CHECKED_IN',
          'COMPLETED', 'CANCELLED', 'EXPIRED'
        )
      );
  `);
}
