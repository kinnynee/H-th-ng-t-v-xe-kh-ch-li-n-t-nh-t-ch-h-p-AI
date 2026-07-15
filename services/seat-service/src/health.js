export function createHealthCheck({ database, redis, inventory }) {
  return async () => {
    await inventory.getSeatMap("health-probe");
    return {
      ok: true,
      message: "Seat inventory is ready",
      details: {
        database: database ? "postgres" : "memory-fallback",
        cache: redis ? "redis" : "memory-fallback"
      }
    };
  };
}
