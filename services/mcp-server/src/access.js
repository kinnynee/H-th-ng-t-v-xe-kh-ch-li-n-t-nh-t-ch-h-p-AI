export function protectedRequestHeaders({ userAccessToken = "", bookingAccessToken = "" } = {}) {
  return {
    ...(userAccessToken ? { authorization: `Bearer ${userAccessToken}` } : {}),
    ...(bookingAccessToken ? { "x-booking-access-token": bookingAccessToken } : {})
  };
}

export function requireBookingCredential(credentials = {}) {
  const headers = protectedRequestHeaders(credentials);
  if (!headers.authorization && !headers["x-booking-access-token"]) {
    throw new Error("A user access token or booking capability token is required.");
  }
  return headers;
}
