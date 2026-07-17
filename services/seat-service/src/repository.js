import { withTransaction } from "@bus-ai/shared/postgres";

/** Inserts the immutable seat catalog generated for each seeded trip. */
export async function seedSeatCatalog(pool, trips) {
  if (!pool) return;
  await withTransaction(pool, async (db) => {
    for (const trip of trips) {
      for (const seat of trip.seats) {
        await db.query(
          `INSERT INTO seat_inventory (trip_id, seat_id, label, floor, seat_row, seat_column)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (trip_id, seat_id) DO NOTHING`,
          [trip.id, seat.id, seat.label, seat.floor, seat.row ?? 1, seat.column ?? 1]
        );
      }
    }
  });
}

export async function ensureSeatCatalog(pool, tripId, seats) {
  if (!pool) return;
  await withTransaction(pool, async (db) => {
    for (const seat of seats) {
      await db.query(
        `INSERT INTO seat_inventory (trip_id, seat_id, label, floor, seat_row, seat_column)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (trip_id, seat_id) DO NOTHING`,
        [tripId, seat.id, seat.label, seat.floor, seat.row ?? 1, seat.column ?? 1]
      );
    }
  });
}

/** Loads the persisted seat catalog so runtime does not derive it from memory. */
export async function loadSeatCatalog(pool) {
  if (!pool) return new Map();
  const { rows } = await pool.query(
    "SELECT trip_id, seat_id, label, floor, seat_row, seat_column FROM seat_inventory ORDER BY trip_id, floor, seat_row, seat_column, seat_id"
  );
  const catalog = new Map();
  for (const row of rows) {
    const seats = catalog.get(row.trip_id) ?? [];
    seats.push({
      id: row.seat_id,
      label: row.label,
      floor: Number(row.floor),
      row: Number(row.seat_row),
      column: Number(row.seat_column)
    });
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

function orderedSeatIds(seatIds) {
  return [...new Set(seatIds)].sort((left, right) => left.localeCompare(right));
}

class SeatAssignmentConflict extends Error {}

/**
 * Atomically persists a confirmed sale. The primary key serializes competing
 * inserts from different seat-service replicas; a partial insert is rolled
 * back instead of leaving a half-confirmed booking behind.
 */
export async function confirmSeatAssignments(pool, { tripId, seatIds, bookingCode }) {
  if (!pool) return { ok: true };
  const ordered = orderedSeatIds(seatIds);
  try {
    return await withTransaction(pool, async (db) => {
      const existing = await db.query(
        `SELECT seat_id, state, booking_code
         FROM seat_assignments
         WHERE trip_id = $1 AND seat_id = ANY($2::text[])
         FOR UPDATE`,
        [tripId, ordered]
      );
      if (existing.rowCount === ordered.length
        && existing.rows.every((row) => row.state === "BOOKED" && row.booking_code === bookingCode)) {
        return { ok: true, idempotent: true };
      }
      if (existing.rowCount) throw new SeatAssignmentConflict("One or more seats are no longer available.");

      for (const seatId of ordered) {
        const inserted = await db.query(
          `INSERT INTO seat_assignments (trip_id, seat_id, state, booking_code)
           VALUES ($1, $2, 'BOOKED', $3)
           ON CONFLICT (trip_id, seat_id) DO NOTHING
           RETURNING seat_id`,
          [tripId, seatId, bookingCode]
        );
        if (!inserted.rowCount) throw new SeatAssignmentConflict("One or more seats are no longer available.");
      }
      return { ok: true, idempotent: false };
    });
  } catch (error) {
    if (error instanceof SeatAssignmentConflict) return { ok: false, message: error.message };
    throw error;
  }
}

/** Releases only the booking that owns the confirmed seats; BLOCKED rows stay intact. */
export async function releaseSeatAssignments(pool, { tripId, seatIds, bookingCode, admin = false }) {
  if (!pool) return { ok: true };
  const ordered = orderedSeatIds(seatIds);
  await withTransaction(pool, async (db) => {
    if (admin) {
      await db.query(
        "DELETE FROM seat_assignments WHERE trip_id = $1 AND seat_id = ANY($2::text[]) AND state = 'BOOKED'",
        [tripId, ordered]
      );
    } else {
      await db.query(
        `DELETE FROM seat_assignments
         WHERE trip_id = $1 AND seat_id = ANY($2::text[])
           AND state = 'BOOKED' AND booking_code = $3`,
        [tripId, ordered, bookingCode]
      );
    }
  });
  return { ok: true };
}

/** Blocks or unblocks seats without ever overwriting a confirmed assignment. */
export async function setSeatAssignmentsBlocked(pool, { tripId, seatIds, blocked }) {
  if (!pool) return { ok: true };
  const ordered = orderedSeatIds(seatIds);
  try {
    return await withTransaction(pool, async (db) => {
      if (!blocked) {
        await db.query(
          "DELETE FROM seat_assignments WHERE trip_id = $1 AND seat_id = ANY($2::text[]) AND state = 'BLOCKED'",
          [tripId, ordered]
        );
        return { ok: true };
      }

      for (const seatId of ordered) {
        const result = await db.query(
          `INSERT INTO seat_assignments (trip_id, seat_id, state)
           VALUES ($1, $2, 'BLOCKED')
           ON CONFLICT (trip_id, seat_id) DO UPDATE
             SET updated_at = NOW()
             WHERE seat_assignments.state = 'BLOCKED'
           RETURNING seat_id`,
          [tripId, seatId]
        );
        if (!result.rowCount) throw new SeatAssignmentConflict("A confirmed seat cannot be blocked.");
      }
      return { ok: true };
    });
  } catch (error) {
    if (error instanceof SeatAssignmentConflict) return { ok: false, message: error.message };
    throw error;
  }
}
