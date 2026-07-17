import { randomUUID } from "node:crypto";
import { jsonValue, withTransaction } from "@bus-ai/shared/postgres";

function asArray(value) {
  const parsed = jsonValue(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function bookingFromRow(row) {
  return {
    code: row.code,
    tripId: row.trip_id,
    routeName: row.route_name,
    departureTime: row.departure_time,
    pickup: row.pickup,
    dropoff: row.dropoff,
    vehiclePlate: row.vehicle_plate,
    holdToken: row.hold_token,
    guestAccessTokenHash: row.guest_access_token_hash,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    userId: row.user_id,
    seatIds: asArray(row.seat_ids),
    passengers: asArray(row.passengers),
    totalAmount: Number(row.total_amount),
    status: row.status,
    tickets: asArray(row.tickets),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at,
    checkedInAt: row.checked_in_at,
    cancelledAt: row.cancelled_at,
    version: Number(row.version ?? 0)
  };
}

function bookingParams(booking) {
  return [
    booking.code, booking.tripId, booking.routeName, booking.departureTime, booking.pickup, booking.dropoff,
    booking.vehiclePlate, booking.holdToken, booking.guestAccessTokenHash ?? null,
    booking.customerEmail, booking.customerPhone, booking.userId || null,
    JSON.stringify(booking.seatIds), JSON.stringify(booking.passengers), booking.totalAmount, booking.status,
    JSON.stringify(booking.tickets), booking.createdAt, booking.updatedAt, booking.paidAt ?? null,
    booking.checkedInAt ?? null, booking.cancelledAt ?? null
  ];
}

async function enqueueOutboxEvents(db, bookingCode, events = []) {
  for (const event of events) {
    await db.query(
      `INSERT INTO booking_outbox (event_id, booking_code, destination, topic, routing_key, envelope)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        event.envelope.eventId,
        bookingCode,
        event.destination,
        event.topic,
        event.routingKey ?? null,
        JSON.stringify(event.envelope)
      ]
    );
  }
}

export async function seedUsers(pool, users) {
  if (!pool) return;
  for (const user of users) {
    await withTransaction(pool, async (db) => {
      await db.query(
        `INSERT INTO users (id, email, password, role, name) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.email, user.password, user.role, user.name]
      );
      for (const passenger of user.savedPassengers ?? []) {
        await db.query(
          `INSERT INTO saved_passengers (id, user_id, full_name, phone, email, document_id)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
          [passenger.id, user.id, passenger.fullName, passenger.phone, passenger.email, passenger.documentId ?? ""]
        );
      }
    });
  }
}

export async function loadBookingRepository(pool) {
  if (!pool) return null;
  const [userRows, passengerRows, bookingRows] = await Promise.all([
    pool.query("SELECT id, email, password, role, name FROM users ORDER BY id"),
    pool.query("SELECT id, user_id, full_name, phone, email, document_id FROM saved_passengers ORDER BY id"),
    pool.query("SELECT * FROM bookings ORDER BY created_at")
  ]);
  const users = new Map(userRows.rows.map((row) => [row.id, {
    id: row.id,
    email: row.email,
    password: row.password,
    role: row.role,
    name: row.name,
    savedPassengers: []
  }]));
  for (const row of passengerRows.rows) {
    users.get(row.user_id)?.savedPassengers.push({
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      documentId: row.document_id
    });
  }
  return {
    users,
    bookings: new Map(bookingRows.rows.map((row) => {
      const booking = bookingFromRow(row);
      return [booking.code, booking];
    }))
  };
}

export async function saveUser(pool, user) {
  if (!pool) return;
  await withTransaction(pool, async (db) => {
    await db.query(
      `INSERT INTO users (id, email, password, role, name) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password = EXCLUDED.password, role = EXCLUDED.role, name = EXCLUDED.name`,
      [user.id, user.email, user.password, user.role, user.name]
    );
    await db.query("DELETE FROM saved_passengers WHERE user_id = $1", [user.id]);
    for (const passenger of user.savedPassengers ?? []) {
      await db.query(
        `INSERT INTO saved_passengers (id, user_id, full_name, phone, email, document_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [passenger.id, user.id, passenger.fullName, passenger.phone, passenger.email, passenger.documentId ?? ""]
      );
    }
  });
}

/** Inserts the booking and all domain events in one database transaction. */
export async function createBookingWithOutbox(pool, booking, events = []) {
  if (!pool) return { created: true, booking: { ...booking, version: booking.version ?? 0 } };
  return withTransaction(pool, async (db) => {
    const result = await db.query(
      `INSERT INTO bookings (
        code, trip_id, route_name, departure_time, pickup, dropoff, vehicle_plate, hold_token, guest_access_token_hash,
        customer_email, customer_phone, user_id, seat_ids, passengers, total_amount, status,
        tickets, created_at, updated_at, paid_at, checked_in_at, cancelled_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16,
        $17::jsonb, $18, $19, $20, $21, $22
      ) RETURNING version`,
      bookingParams(booking)
    );
    await enqueueOutboxEvents(db, booking.code, events);
    return { created: true, booking: { ...booking, version: Number(result.rows[0].version) } };
  });
}

/**
 * Applies a state transition only when the persisted version and prior state
 * still match. This makes duplicate or concurrent requests deterministic.
 */
export async function transitionBookingWithOutbox(pool, booking, expectedStatuses, events = []) {
  if (!pool) {
    booking.version = Number(booking.version ?? 0) + 1;
    return { updated: true, booking };
  }
  return withTransaction(pool, async (db) => {
    const result = await db.query(
      `UPDATE bookings
       SET status = $1, tickets = $2::jsonb, updated_at = $3, paid_at = $4,
           checked_in_at = $5, cancelled_at = $6, version = version + 1
       WHERE code = $7 AND version = $8 AND status = ANY($9::text[])
       RETURNING version`,
      [
        booking.status,
        JSON.stringify(booking.tickets),
        booking.updatedAt,
        booking.paidAt ?? null,
        booking.checkedInAt ?? null,
        booking.cancelledAt ?? null,
        booking.code,
        Number(booking.version ?? 0),
        expectedStatuses
      ]
    );
    if (!result.rowCount) return { updated: false };
    await enqueueOutboxEvents(db, booking.code, events);
    return { updated: true, booking: { ...booking, version: Number(result.rows[0].version) } };
  });
}

export async function findBooking(pool, code) {
  if (!pool) return null;
  const result = await pool.query("SELECT * FROM bookings WHERE code = $1", [code]);
  return result.rowCount ? bookingFromRow(result.rows[0]) : null;
}

export async function claimOutboxEvents(pool, { limit = 20, leaseSeconds = 30 } = {}) {
  if (!pool) return [];
  const lockToken = randomUUID();
  return withTransaction(pool, async (db) => {
    const result = await db.query(
      `WITH due AS (
         SELECT event_id
         FROM booking_outbox
         WHERE published_at IS NULL
           AND available_at <= NOW()
           AND (locked_until IS NULL OR locked_until < NOW())
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE booking_outbox outbox
       SET lock_token = $2, locked_until = NOW() + ($3 * INTERVAL '1 second'), attempts = attempts + 1
       FROM due
       WHERE outbox.event_id = due.event_id
       RETURNING outbox.event_id, outbox.destination, outbox.topic, outbox.routing_key, outbox.envelope`,
      [Math.max(1, Math.min(Number(limit) || 20, 100)), lockToken, Math.max(5, Number(leaseSeconds) || 30)]
    );
    return result.rows.map((row) => ({
      eventId: row.event_id,
      destination: row.destination,
      topic: row.topic,
      routingKey: row.routing_key,
      envelope: jsonValue(row.envelope, {}),
      lockToken
    }));
  });
}

export async function markOutboxPublished(pool, eventId, lockToken) {
  if (!pool) return;
  await pool.query(
    `UPDATE booking_outbox
     SET published_at = NOW(), locked_until = NULL, lock_token = NULL, last_error = NULL
     WHERE event_id = $1 AND lock_token = $2`,
    [eventId, lockToken]
  );
}

export async function releaseOutboxEvent(pool, eventId, lockToken, error) {
  if (!pool) return;
  await pool.query(
    `UPDATE booking_outbox
     SET locked_until = NULL, lock_token = NULL, last_error = $3,
         available_at = NOW() + INTERVAL '5 seconds'
     WHERE event_id = $1 AND lock_token = $2`,
    [eventId, lockToken, String(error?.message ?? error ?? "Event publish failed").slice(0, 1000)]
  );
}
