async function dependencyHealth(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
    return response.ok ? "SERVING" : "NOT_SERVING";
  } catch {
    return "NOT_SERVING";
  }
}

export function createHealthCheck({ tripUrl, bookingUrl, analyticsUrl }) {
  return async () => {
    const [trip, booking, analytics] = await Promise.all([
      dependencyHealth(`${tripUrl}/ready`),
      dependencyHealth(`${bookingUrl}/ready`),
      dependencyHealth(`${analyticsUrl}/health`)
    ]);
    const dependencies = { trip, booking, analytics };
    return {
      ok: Object.values(dependencies).every((status) => status === "SERVING"),
      message: "MCP dependency readiness check",
      details: dependencies
    };
  };
}
