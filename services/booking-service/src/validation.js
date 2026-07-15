export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

export function isValidPhone(value) {
  return /^(?:\+?84|0)\d{9,10}$/.test(String(value ?? "").replace(/[.\s-]/g, ""));
}

export function validateBookingInput({ holdToken, customerEmail, customerPhone, passengers }) {
  if (!String(holdToken ?? "").trim()) return "A valid seat hold is required before creating a booking";
  if (!isValidEmail(customerEmail)) return "A valid customer email is required";
  if (!isValidPhone(customerPhone)) return "A valid customer phone number is required";
  if (!Array.isArray(passengers) || passengers.length === 0) return "Booking requires at least one seat";

  const seatIds = new Set();
  for (const passenger of passengers) {
    const seatId = String(passenger?.seatId ?? "").trim().toUpperCase();
    if (!seatId) return "Every passenger must have a seat";
    if (seatIds.has(seatId)) return "Each passenger must have a different seat";
    seatIds.add(seatId);
    if (String(passenger?.fullName ?? "").trim().length < 2) return `Passenger ${seatId} must have a valid full name`;
    if (!isValidEmail(passenger?.email)) return `Passenger ${seatId} must have a valid email`;
    if (!isValidPhone(passenger?.phone)) return `Passenger ${seatId} must have a valid phone number`;
    if (!/^[A-Za-z0-9-]{6,20}$/.test(String(passenger?.documentId ?? "").trim())) {
      return `Passenger ${seatId} must have a valid document ID`;
    }
  }
  return null;
}
