import { randomUUID } from "node:crypto";
import { buildSeatLabels, buildTrips } from "@bus-ai/shared/seed";
import { createMemoryTTLStore } from "@bus-ai/shared/cache";

function normalizeSeatId(id) {
  return String(id ?? "").trim().toUpperCase();
}

function holdKey(tripId, seatId) {
  return `seat:hold:${tripId}:${seatId}`;
}

function stateKey(tripId, seatId) {
  return `${tripId}:${seatId}`;
}

export function createSeatInventory({
  cache = createMemoryTTLStore(),
  trips = buildTrips(),
  seatCatalog = new Map(),
  initialState = {},
  loadState = null,
  confirmAssignments = async () => ({ ok: true }),
  releaseAssignments = async () => ({ ok: true }),
  setAssignmentsBlocked = async () => ({ ok: true }),
  onSeatChanged = async () => {}
} = {}) {
  let booked = initialState.booked ?? new Map();
  let blocked = initialState.blocked ?? new Set();
  const expiryTimers = new Map();

  async function refreshState() {
    const state = loadState ? await loadState() : { booked, blocked };
    if (state?.booked) booked = state.booked;
    if (state?.blocked) blocked = state.blocked;
  }

  function seatsForTrip(tripId) {
    const persistedSeats = seatCatalog.get(tripId);
    if (persistedSeats?.length) return persistedSeats.map((seat) => ({ ...seat }));
    const trip = trips.find((item) => item.id === tripId) ?? { seatCount: 34 };
    return buildSeatLabels(trip.seatCount);
  }

  function clearSeatExpiryTimer(tripId, seatId) {
    const key = stateKey(tripId, seatId);
    const timer = expiryTimers.get(key);
    if (timer) clearTimeout(timer);
    expiryTimers.delete(key);
  }

  async function getSeatMap(tripId) {
    // The SQL assignment table is the durable authority. Refreshing it here
    // prevents an API replica from returning a stale BOOKED/BLOCKED snapshot.
    await refreshState();
    const seats = [];
    for (const seat of seatsForTrip(tripId)) {
      const key = stateKey(tripId, seat.id);
      const hold = await cache.get(holdKey(tripId, seat.id));
      const ttl = hold ? await cache.ttl(holdKey(tripId, seat.id)) : 0;
      let status = "AVAILABLE";
      if (blocked.has(key)) status = "BLOCKED";
      if (booked.has(key)) status = "BOOKED";
      if (hold && status === "AVAILABLE") status = "HELD";
      seats.push({
        ...seat,
        status,
        holdExpiresIn: status === "HELD" ? Math.max(0, ttl) : 0,
        holdToken: status === "HELD" ? hold.holdToken : ""
      });
    }
    return { tripId, seats };
  }

  async function emitSeatChanged(tripId, message, snapshot = null) {
    const seatMap = snapshot ?? await getSeatMap(tripId);
    try {
      await onSeatChanged({ ...seatMap, message });
    } catch (error) {
      // Publishing a UI update must not change seat ownership.
      console.warn(`[seat-service] could not publish seat change: ${error.message}`);
    }
    return seatMap;
  }

  function scheduleSeatExpiry(tripId, seatId, holdToken, ttlSeconds) {
    clearSeatExpiryTimer(tripId, seatId);
    const timer = setTimeout(async () => {
      expiryTimers.delete(stateKey(tripId, seatId));
      try {
        const hold = await cache.get(holdKey(tripId, seatId));
        if (hold?.holdToken && hold.holdToken !== holdToken) return;
        if (hold?.holdToken === holdToken) {
          const remaining = await cache.ttl(holdKey(tripId, seatId));
          scheduleSeatExpiry(tripId, seatId, holdToken, Math.max(1, remaining));
          return;
        }
        await emitSeatChanged(tripId, "Seat hold has expired.");
      } catch (error) {
        console.warn(`[seat-service] could not process hold expiry: ${error.message}`);
      }
    }, Math.max(50, Number(ttlSeconds) * 1000 + 100));
    timer.unref?.();
    expiryTimers.set(stateKey(tripId, seatId), timer);
  }

  async function holdSeats({ tripId, seatIds, customerEmail, idempotencyKey, ttlSeconds = 300 }) {
    const normalizedSeats = [...new Set(seatIds.map(normalizeSeatId).filter(Boolean))];
    const holdToken = idempotencyKey || randomUUID();
    if (!tripId || !normalizedSeats.length) {
      return { ok: false, message: "A trip and at least one seat are required.", holdToken: "", expiresIn: 0, seats: [] };
    }

    const map = await getSeatMap(tripId);
    const knownSeats = new Set(map.seats.map((seat) => seat.id));
    const unavailable = [];
    for (const seatId of normalizedSeats) {
      const key = stateKey(tripId, seatId);
      const existingHold = await cache.get(holdKey(tripId, seatId));
      if (!knownSeats.has(seatId)) unavailable.push(`${seatId} does not exist`);
      else if (blocked.has(key)) unavailable.push(`${seatId} is blocked`);
      else if (booked.has(key)) unavailable.push(`${seatId} is booked`);
      else if (existingHold && existingHold.holdToken !== holdToken) unavailable.push(`${seatId} is held`);
    }
    if (unavailable.length) {
      return { ok: false, message: unavailable.join(", "), holdToken: "", expiresIn: 0, seats: map.seats };
    }

    const acquired = [];
    for (const seatId of normalizedSeats) {
      const key = holdKey(tripId, seatId);
      const current = await cache.get(key);
      if (current?.holdToken === holdToken) {
        acquired.push(seatId);
        continue;
      }
      const acquiredNow = await cache.setNX(
        key,
        { tripId, seatId, customerEmail, holdToken, createdAt: new Date().toISOString() },
        ttlSeconds
      );
      if (!acquiredNow) {
        for (const rollbackSeatId of acquired) {
          const rollback = await cache.get(holdKey(tripId, rollbackSeatId));
          if (rollback?.holdToken === holdToken) await cache.del(holdKey(tripId, rollbackSeatId));
        }
        const latest = await getSeatMap(tripId);
        return { ok: false, message: `Seat ${seatId} was just held by another customer.`, holdToken: "", expiresIn: 0, seats: latest.seats };
      }
      acquired.push(seatId);
    }

    const latest = await getSeatMap(tripId);
    const expiresIn = Math.min(...normalizedSeats.map(
      (seatId) => latest.seats.find((seat) => seat.id === seatId)?.holdExpiresIn ?? ttlSeconds
    ));
    for (const seatId of normalizedSeats) scheduleSeatExpiry(tripId, seatId, holdToken, expiresIn);
    await emitSeatChanged(tripId, "Seats are temporarily held.", latest);
    return { ok: true, message: "Seats are temporarily held.", holdToken, expiresIn, seats: latest.seats };
  }

  async function confirmSeats({ tripId, seatIds, holdToken, bookingCode }) {
    const normalizedSeats = [...new Set(seatIds.map(normalizeSeatId).filter(Boolean))];
    await refreshState();
    for (const seatId of normalizedSeats) {
      const key = stateKey(tripId, seatId);
      const confirmed = booked.get(key);
      const hold = await cache.get(holdKey(tripId, seatId));
      if (blocked.has(key)) return { ok: false, message: `${seatId} is blocked`, seats: [] };
      if (confirmed && confirmed.bookingCode !== bookingCode) return { ok: false, message: `${seatId} is booked`, seats: [] };
      if (!confirmed && (!hold || hold.holdToken !== holdToken)) {
        return { ok: false, message: `The hold for ${seatId} is expired or invalid`, seats: [] };
      }
    }

    // The repository performs insert-or-conflict in one transaction; this is
    // the final concurrency boundary, rather than the process-local maps.
    const persisted = await confirmAssignments({ tripId, seatIds: normalizedSeats, bookingCode });
    if (!persisted?.ok) {
      await refreshState();
      return { ok: false, message: persisted?.message ?? "Seat is no longer available.", seats: [] };
    }
    for (const seatId of normalizedSeats) {
      booked.set(stateKey(tripId, seatId), { bookingCode, confirmedAt: new Date().toISOString() });
      await cache.del(holdKey(tripId, seatId));
      clearSeatExpiryTimer(tripId, seatId);
    }
    await refreshState();
    const latest = await getSeatMap(tripId);
    await emitSeatChanged(tripId, "Seats have been confirmed.", latest);
    return { ok: true, message: "Seats have been confirmed.", seats: latest.seats };
  }

  async function releaseSeats({ tripId, seatIds, holdToken }) {
    const normalizedSeats = [...new Set(seatIds.map(normalizeSeatId).filter(Boolean))];
    await refreshState();
    const persisted = await releaseAssignments({
      tripId,
      seatIds: normalizedSeats,
      bookingCode: holdToken,
      admin: holdToken === "ADMIN"
    });
    if (!persisted?.ok) return { ok: false, message: persisted?.message ?? "Could not release seats." };

    for (const seatId of normalizedSeats) {
      const key = stateKey(tripId, seatId);
      const hold = await cache.get(holdKey(tripId, seatId));
      if (!holdToken || hold?.holdToken === holdToken) {
        await cache.del(holdKey(tripId, seatId));
        clearSeatExpiryTimer(tripId, seatId);
      }
      const confirmed = booked.get(key);
      if (confirmed && (!holdToken || confirmed.bookingCode === holdToken || holdToken === "ADMIN")) booked.delete(key);
    }
    await refreshState();
    await emitSeatChanged(tripId, "Seats have been released.");
    return { ok: true, message: "Seats have been released." };
  }

  async function blockSeats({ tripId, seatIds, blocked: shouldBlock }) {
    const normalizedSeats = [...new Set(seatIds.map(normalizeSeatId).filter(Boolean))];
    await refreshState();
    const persisted = await setAssignmentsBlocked({ tripId, seatIds: normalizedSeats, blocked: shouldBlock });
    if (!persisted?.ok) {
      const latest = await getSeatMap(tripId);
      return { ok: false, message: persisted?.message ?? "Could not update seat state.", seats: latest.seats };
    }
    for (const seatId of normalizedSeats) {
      const key = stateKey(tripId, seatId);
      if (shouldBlock) {
        blocked.add(key);
        await cache.del(holdKey(tripId, seatId));
        clearSeatExpiryTimer(tripId, seatId);
      } else {
        blocked.delete(key);
      }
    }
    await refreshState();
    const latest = await getSeatMap(tripId);
    await emitSeatChanged(tripId, shouldBlock ? "Seats have been blocked." : "Seats have been unblocked.", latest);
    return { ok: true, message: shouldBlock ? "Seats have been blocked." : "Seats have been unblocked.", seats: latest.seats };
  }

  return {
    getSeatMap,
    holdSeats,
    confirmSeats,
    releaseSeats,
    blockSeats,
    _debug: {
      get booked() { return booked; },
      get blocked() { return blocked; }
    }
  };
}
