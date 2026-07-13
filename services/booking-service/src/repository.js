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
    cancelledAt: row.cancelled_at
  };
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

export async function saveBooking(pool, booking) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO bookings (
      code, trip_id, route_name, departure_time, pickup, dropoff, vehicle_plate, hold_token,
      customer_email, customer_phone, user_id, seat_ids, passengers, total_amount, status,
      tickets, created_at, updated_at, paid_at, checked_in_at, cancelled_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15,
      $16::jsonb, $17, $18, $19, $20, $21
    ) ON CONFLICT (code) DO UPDATE SET
      seat_ids = EXCLUDED.seat_ids, passengers = EXCLUDED.passengers, total_amount = EXCLUDED.total_amount,
      status = EXCLUDED.status, tickets = EXCLUDED.tickets, updated_at = EXCLUDED.updated_at,
      paid_at = EXCLUDED.paid_at, checked_in_at = EXCLUDED.checked_in_at, cancelled_at = EXCLUDED.cancelled_at`,
    [
      booking.code, booking.tripId, booking.routeName, booking.departureTime, booking.pickup, booking.dropoff,
      booking.vehiclePlate, booking.holdToken, booking.customerEmail, booking.customerPhone, booking.userId || null,
      JSON.stringify(booking.seatIds), JSON.stringify(booking.passengers), booking.totalAmount, booking.status,
      JSON.stringify(booking.tickets), booking.createdAt, booking.updatedAt, booking.paidAt ?? null,
      booking.checkedInAt ?? null, booking.cancelledAt ?? null
    ]
  );
}
