function clean(value) {
  return String(value ?? "").trim();
}

export function normalizeBookingPassengers(passengers = []) {
  if (!Array.isArray(passengers)) return [];
  return passengers.map((passenger) => ({
    seatId: clean(passenger?.seatId).toUpperCase(),
    fullName: clean(passenger?.fullName).replace(/\s+/g, " "),
    phone: clean(passenger?.phone).replace(/[.\s-]/g, ""),
    email: clean(passenger?.email).toLowerCase(),
    documentId: clean(passenger?.documentId)
  }));
}

export function createPassengerTickets(booking, issuedAt = new Date().toISOString()) {
  return normalizeBookingPassengers(booking?.passengers).map((passenger) => ({
    id: `${booking.code}-${passenger.seatId}`,
    passengerName: passenger.fullName,
    passengerPhone: passenger.phone,
    passengerEmail: passenger.email,
    seatId: passenger.seatId,
    qrPayload: `${booking.code}-${passenger.seatId}`,
    issuedAt,
    status: "ISSUED",
    checkedInAt: null
  }));
}
