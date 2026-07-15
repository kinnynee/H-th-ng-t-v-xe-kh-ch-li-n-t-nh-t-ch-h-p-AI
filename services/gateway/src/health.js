export function createHealthCheck({ tripUrl, bookingUrl, analyticsUrl }) {
  return async () => ({
    ok: true,
    message: "GraphQL gateway is ready",
    details: {
      graphqlEndpoint: "/graphql",
      tripService: tripUrl,
      bookingService: bookingUrl,
      analyticsService: analyticsUrl
    }
  });
}
