const transitions = new Map([
  ["PENDING_PAYMENT", new Set(["PAYMENT_PROCESSING", "CANCELLED", "EXPIRED"])],
  ["PAYMENT_PROCESSING", new Set(["PENDING_PAYMENT", "PAID", "PAYMENT_FAILED"])],
  ["PAID", new Set(["TICKET_ISSUED", "CANCELLED"])],
  ["TICKET_ISSUED", new Set(["PARTIALLY_CHECKED_IN", "CHECKED_IN", "CANCELLED"])],
  ["PARTIALLY_CHECKED_IN", new Set(["CHECKED_IN"])],
  ["CHECKED_IN", new Set(["COMPLETED"])]
]);

export function assertBookingStatusTransition(currentStatus, nextStatus, { allowSame = false } = {}) {
  if (allowSame && currentStatus === nextStatus) return true;
  if (!transitions.get(currentStatus)?.has(nextStatus)) {
    throw new Error(`Cannot transition booking from ${currentStatus} to ${nextStatus}`);
  }
  return true;
}

export function transitionBooking(booking, nextStatus, at = new Date()) {
  assertBookingStatusTransition(booking.status, nextStatus);
  booking.status = nextStatus;
  booking.updatedAt = at.toISOString();
  return booking;
}

function fold(value) {
  return String(value ?? "").toLocaleLowerCase("vi-VN").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function cancellationQuote({ status, totalAmount, departureTime, cancellationPolicy, now = new Date() }) {
  const hoursBeforeDeparture = (Date.parse(departureTime) - now.getTime()) / 3_600_000;
  if (!Number.isFinite(hoursBeforeDeparture) || hoursBeforeDeparture <= 0) {
    throw new Error("Cannot cancel a booking after the trip has departed");
  }
  if (status === "PENDING_PAYMENT") return { refundPercent: 0, refundAmount: 0, cancellationFee: 0 };

  const policy = fold(cancellationPolicy);
  const rules = [];
  const freeMatch = policy.match(/mien phi truoc gio khoi hanh\s+(\d+)\s+tieng/);
  if (freeMatch) rules.push({ hours: Number(freeMatch[1]), percent: 100 });
  for (const match of policy.matchAll(/truoc\s+(\d+)\s+tieng\s+hoan\s+(\d+)%/g)) {
    rules.push({ hours: Number(match[1]), percent: Number(match[2]) });
  }
  rules.sort((left, right) => right.hours - left.hours);

  let refundPercent = rules.find((rule) => hoursBeforeDeparture >= rule.hours)?.percent ?? 0;
  if (refundPercent === 0 && freeMatch) {
    const feeMatch = policy.match(/phi huy(?: la)?\s+(\d+)%/);
    if (feeMatch) refundPercent = Math.max(0, 100 - Number(feeMatch[1]));
  }
  const refundAmount = Math.round(Number(totalAmount) * refundPercent / 100);
  return {
    refundPercent,
    refundAmount,
    cancellationFee: Math.max(0, Number(totalAmount) - refundAmount)
  };
}

export function seatReleaseCommand(booking) {
  const confirmed = ["PAID", "TICKET_ISSUED", "PARTIALLY_CHECKED_IN", "CHECKED_IN", "COMPLETED"].includes(booking.status);
  return {
    tripId: booking.tripId,
    seatIds: [...(booking.seatIds ?? [])],
    holdToken: confirmed ? booking.code : booking.holdToken
  };
}

export function assertCheckInWindow(departureTime, {
  now = new Date(),
  opensHoursBefore = Number(process.env.CHECKIN_OPENS_HOURS_BEFORE || 24)
} = {}) {
  const departure = Date.parse(departureTime);
  if (!Number.isFinite(departure)) throw new Error("Trip departure time is invalid");
  if (now.getTime() < departure - opensHoursBefore * 3_600_000) {
    throw new Error(`Check-in opens ${opensHoursBefore} hours before departure`);
  }
  if (now.getTime() >= departure) throw new Error("Check-in is closed because the trip has departed");
}

export function checkInTickets(booking, codeOrTicket, at = new Date()) {
  const target = booking.tickets.find((ticket) => ticket.id === codeOrTicket || ticket.qrPayload === codeOrTicket);
  const selected = target ? [target] : booking.code === codeOrTicket ? booking.tickets : [];
  if (selected.length === 0) throw new Error("Booking or ticket not found");
  for (const ticket of selected) {
    if (ticket.status === "CHECKED_IN") throw new Error(`Ticket ${ticket.id} is already checked in`);
    if (ticket.status !== "ISSUED") throw new Error(`Ticket ${ticket.id} cannot be checked in from ${ticket.status}`);
    ticket.status = "CHECKED_IN";
    ticket.checkedInAt = at.toISOString();
  }
  const checkedCount = booking.tickets.filter((ticket) => ticket.status === "CHECKED_IN").length;
  transitionBooking(booking, checkedCount === booking.tickets.length ? "CHECKED_IN" : "PARTIALLY_CHECKED_IN", at);
  booking.checkedInAt = checkedCount === booking.tickets.length ? at.toISOString() : null;
  return selected.map((ticket) => ticket.id);
}

export function cancelTickets(booking, at = new Date()) {
  const cancelledAt = at.toISOString();
  for (const ticket of booking.tickets ?? []) {
    if (ticket.status === "CHECKED_IN") {
      throw new Error(`Ticket ${ticket.id} is already checked in`);
    }
    ticket.status = "CANCELLED";
    ticket.checkedInAt = null;
    ticket.cancelledAt = cancelledAt;
  }
  return booking.tickets ?? [];
}

export function createBookingLock() {
  const tails = new Map();
  return async function withBookingLock(code, work) {
    const previous = tails.get(code) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    tails.set(code, current);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (tails.get(code) === current) tails.delete(code);
    }
  };
}
