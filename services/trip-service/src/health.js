export function createHealthCheck({ database, redis, stores }) {
  return async () => ({
    ok: true,
    message: "Trip service is ready",
    details: {
      database: database ? "postgres" : "memory-fallback",
      cache: redis ? "redis" : "memory-fallback",
      routes: stores.routes.size,
      trips: stores.trips.size
    }
  });
}
