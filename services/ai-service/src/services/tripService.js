import config from "../config/env.js";

/**
 * Helper gọi HTTP JSON chung — tự động set Content-Type
 * và throw Error nếu response không ok.
 */
async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || response.statusText);
  return payload;
}

/**
 * Gọi trip-service để tìm chuyến xe theo điều kiện.
 * @param {{ from?: string, to?: string, date?: string, timeFrom?: string }} params
 */
export async function searchTrips({ from = "", to = "", date = "", timeFrom = "" }) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (date) params.set("date", date);
  if (timeFrom) params.set("timeFrom", timeFrom);
  params.set("sort", "DEPARTURE_ASC");
  return requestJSON(`${config.tripServiceUrl}/trips?${params}`);
}

/**
 * Gọi booking-service để tra cứu trạng thái đặt vé.
 * Yêu cầu cả bookingCode và email để bảo mật.
 */
export async function getBookingStatus({ bookingCode, email }) {
  if (!bookingCode || !email) {
    return { error: "Cần cả mã booking và email để tra cứu thông tin riêng tư." };
  }
  return requestJSON(`${config.bookingServiceUrl}/bookings/${bookingCode}?email=${encodeURIComponent(email)}`);
}
