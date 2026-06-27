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

export function createSeatInventory({ cache = createMemoryTTLStore(), trips = buildTrips() } = {}) {
  const booked = new Map();
  const blocked = new Set();

  function getTrip(tripId) {
    return trips.find((trip) => trip.id === tripId) ?? { id: tripId, seatCount: 34 };
  }

  async function getSeatMap(tripId) {
    const trip = getTrip(tripId);
    const labels = buildSeatLabels(trip.seatCount);
    const seats = [];

    for (const seat of labels) {
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

  async function holdSeats({ tripId, seatIds, customerEmail, idempotencyKey, ttlSeconds = 300 }) {
    const normalizedSeats = [...new Set(seatIds.map(normalizeSeatId).filter(Boolean))];
    const holdToken = idempotencyKey || randomUUID();
    if (!tripId || normalizedSeats.length === 0) {
      return { ok: false, message: "Thiếu tripId hoặc danh sách ghế.", holdToken: "", expiresIn: 0, seats: [] };
    }

    const map = await getSeatMap(tripId);
    const knownSeats = new Set(map.seats.map((seat) => seat.id));
    const unavailable = [];
    for (const seatId of normalizedSeats) {
      const key = stateKey(tripId, seatId);
      const existingHold = await cache.get(holdKey(tripId, seatId));
      if (!knownSeats.has(seatId)) unavailable.push(`${seatId} không tồn tại`);
      else if (blocked.has(key)) unavailable.push(`${seatId} đang bị khóa`);
      else if (booked.has(key)) unavailable.push(`${seatId} đã được đặt`);
      else if (existingHold && existingHold.holdToken !== holdToken) unavailable.push(`${seatId} đang được giữ`);
    }
    if (unavailable.length > 0) {
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
      const ok = await cache.setNX(
        key,
        { tripId, seatId, customerEmail, holdToken, createdAt: new Date().toISOString() },
        ttlSeconds
      );
      if (!ok) {
        for (const rollbackSeatId of acquired) {
          const rollback = await cache.get(holdKey(tripId, rollbackSeatId));
          if (rollback?.holdToken === holdToken) await cache.del(holdKey(tripId, rollbackSeatId));
        }
        const latest = await getSeatMap(tripId);
        return {
          ok: false,
          message: `Ghế ${seatId} vừa được người khác giữ. Vui lòng chọn ghế khác.`,
          holdToken: "",
          expiresIn: 0,
          seats: latest.seats
        };
      }
      acquired.push(seatId);
    }

    const latest = await getSeatMap(tripId);
    return {
      ok: true,
      message: "Đã giữ ghế tạm thời.",
      holdToken,
      expiresIn: ttlSeconds,
      seats: latest.seats
    };
  }

  async function confirmSeats({ tripId, seatIds, holdToken, bookingCode }) {
    const normalizedSeats = [...new Set(seatIds.map(normalizeSeatId).filter(Boolean))];
    for (const seatId of normalizedSeats) {
      const key = stateKey(tripId, seatId);
      const hold = await cache.get(holdKey(tripId, seatId));
      if (blocked.has(key)) return { ok: false, message: `${seatId} đang bị khóa`, seats: [] };
      if (booked.has(key)) return { ok: false, message: `${seatId} đã được đặt`, seats: [] };
      if (!hold || hold.holdToken !== holdToken) {
        return { ok: false, message: `Phiên giữ ghế ${seatId} đã hết hạn hoặc không hợp lệ`, seats: [] };
      }
    }

    for (const seatId of normalizedSeats) {
      booked.set(stateKey(tripId, seatId), { bookingCode, confirmedAt: new Date().toISOString() });
      await cache.del(holdKey(tripId, seatId));
    }
    const latest = await getSeatMap(tripId);
    return { ok: true, message: "Đã xác nhận ghế.", seats: latest.seats };
  }

  async function releaseSeats({ tripId, seatIds, holdToken }) {
    const normalizedSeats = [...new Set(seatIds.map(normalizeSeatId).filter(Boolean))];
    for (const seatId of normalizedSeats) {
      const key = stateKey(tripId, seatId);
      const hold = await cache.get(holdKey(tripId, seatId));
      if (!holdToken || hold?.holdToken === holdToken) await cache.del(holdKey(tripId, seatId));
      const booking = booked.get(key);
      if (booking && (!holdToken || booking.bookingCode === holdToken || holdToken === "ADMIN")) {
        booked.delete(key);
      }
    }
    return { ok: true, message: "Đã giải phóng ghế." };
  }

  async function blockSeats({ tripId, seatIds, blocked: shouldBlock }) {
    const normalizedSeats = [...new Set(seatIds.map(normalizeSeatId).filter(Boolean))];
    for (const seatId of normalizedSeats) {
      const key = stateKey(tripId, seatId);
      if (shouldBlock) {
        blocked.add(key);
        await cache.del(holdKey(tripId, seatId));
      } else {
        blocked.delete(key);
      }
    }
    const latest = await getSeatMap(tripId);
    return { ok: true, message: shouldBlock ? "Đã khóa ghế." : "Đã mở khóa ghế.", seats: latest.seats };
  }

  return {
    getSeatMap,
    holdSeats,
    confirmSeats,
    releaseSeats,
    blockSeats,
    _debug: { booked, blocked }
  };
}
