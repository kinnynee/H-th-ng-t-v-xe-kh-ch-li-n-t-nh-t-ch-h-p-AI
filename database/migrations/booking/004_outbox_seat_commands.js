export async function up(db) {
  await db.query(`
    ALTER TABLE booking_outbox
      DROP CONSTRAINT IF EXISTS booking_outbox_destination_check;

    ALTER TABLE booking_outbox
      ADD CONSTRAINT booking_outbox_destination_check
      CHECK (destination IN ('kafka', 'rabbit', 'seat'));
  `);
}
