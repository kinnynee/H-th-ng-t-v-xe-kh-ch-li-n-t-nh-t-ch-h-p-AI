export async function up(db) {
  await db.query(`
    UPDATE bookings AS booking
    SET tickets = COALESCE((
      SELECT jsonb_agg(
        ticket || jsonb_build_object(
          'status', 'CANCELLED',
          'checkedInAt', NULL,
          'cancelledAt', COALESCE(booking.cancelled_at, booking.updated_at)
        )
      )
      FROM jsonb_array_elements(booking.tickets) AS ticket
    ), '[]'::jsonb)
    WHERE booking.status = 'CANCELLED'
      AND jsonb_array_length(booking.tickets) > 0
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(booking.tickets) AS ticket
        WHERE ticket->>'status' IS DISTINCT FROM 'CANCELLED'
      );
  `);
}
