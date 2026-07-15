export function createHealthCheck({ database, bookings, users, seatGrpcTarget }) {
  return async () => ({
    ok: true,
    message: "Booking service is ready",
    details: {
      database: database ? "postgres" : "memory-fallback",
      seatGrpcTarget,
      bookings: bookings.size,
      users: users.size
    }
  });
}
