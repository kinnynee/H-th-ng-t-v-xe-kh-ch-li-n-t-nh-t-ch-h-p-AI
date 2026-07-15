import { withTransaction } from "@bus-ai/shared/postgres";

/** Inserts the immutable seat catalog generated for each seeded trip. */
export async function seedSeatCatalog(pool, trips) {
  if (!pool) return;
  await withTransaction(pool, async (db) => {
    for (const trip of trips) {
      for (const seat of trip.seats) {
        await db.query(
          `INSERT INTO seat_inventory (trip_id, seat_id, label, floor)
           VALUES ($1, $2, $3, $4) ON CONFLICT (trip_id, seat_id) DO NOTHING`,
          [trip.id, seat.id, seat.label, seat.floor]
        );
      }
    }
  });
}

/** Loads the persisted seat catalog so runtime does not derive it from memory. */
export async function loadSeatCatalog(pool) {
  if (!pool) return new Map();
  const { rows } = await pool.query(
    "SELECT trip_id, seat_id, label, floor FROM seat_inventory ORDER BY trip_id, floor, seat_id"
  );
  const catalog = new Map();
  for (const row of rows) {
    const seats = catalog.get(row.trip_id) ?? [];
    seats.push({ id: row.seat_id, label: row.label, floor: Number(row.floor) });
    catalog.set(row.trip_id, seats);
  }
  return catalog;
}

export async function loadSeatState(pool) {
  if (!pool) return { booked: new Map(), blocked: new Set() };
  const { rows } = await pool.query("SELECT trip_id, seat_id, state, booking_code, updated_at FROM seat_assignments");
  const booked = new Map();
  const blocked = new Set();
  for (const row of rows) {
    const key = `${row.trip_id}:${row.seat_id}`;
    if (row.state === "BOOKED") {
      booked.set(key, { bookingCode: row.booking_code, confirmedAt: row.updated_at?.toISOString?.() ?? String(row.updated_at) });
    } else {
      blocked.add(key);
    }
  }
  return { booked, blocked };
}

/** Replaces durable assignment state in one transaction after an inventory mutation. */
export async function saveSeatState(pool, { booked, blocked }) {
  if (!pool) return;
  await withTransaction(pool, async (db) => {
    await db.query("DELETE FROM seat_assignments");
    for (const key of blocked) {
      const [tripId, seatId] = key.split(":");
      await db.query(
        "INSERT INTO seat_assignments (trip_id, seat_id, state) VALUES ($1, $2, 'BLOCKED')",
        [tripId, seatId]
      );
    }
    for (const [key, booking] of booked) {
      const [tripId, seatId] = key.split(":");
      await db.query(
        `INSERT INTO seat_assignments (trip_id, seat_id, state, booking_code, updated_at)
         VALUES ($1, $2, 'BOOKED', $3, NOW())
         ON CONFLICT (trip_id, seat_id) DO UPDATE SET state = 'BOOKED', booking_code = EXCLUDED.booking_code, updated_at = NOW()`,
        [tripId, seatId, booking.bookingCode]
      );
    }
  });
}
