export function normalizePaymentIdempotencyKey(value) {
  const key = String(value ?? "").trim();
  return /^[A-Za-z0-9:_-]{8,128}$/.test(key) ? key : "";
}

export function isPaymentReplay(booking, idempotencyKey) {
  return Boolean(
    booking
    && booking.paymentIdempotencyKey === idempotencyKey
    && ["PAYMENT_PROCESSING", "PAID", "PAYMENT_FAILED", "TICKET_ISSUED"].includes(booking.status)
  );
}

export function paymentRequestAction(booking, idempotencyKey) {
  if (!booking) return "NOT_FOUND";
  const replay = isPaymentReplay(booking, idempotencyKey);
  if (booking.status === "PENDING_PAYMENT") return "START";
  if (booking.status === "PAYMENT_PROCESSING") return replay ? "RESUME" : "CONFLICT";
  if (booking.status === "PAID") return replay ? "ISSUE_TICKETS" : "CONFLICT";
  if (["PAYMENT_FAILED", "TICKET_ISSUED"].includes(booking.status)) return replay ? "REPLAY" : "CONFLICT";
  return "CONFLICT";
}
