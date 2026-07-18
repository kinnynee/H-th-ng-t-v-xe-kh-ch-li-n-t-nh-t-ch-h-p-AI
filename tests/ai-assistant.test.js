import assert from "node:assert/strict";
import test from "node:test";
import {
  cancellationPolicyResponse,
  checkinPolicyResponse,
  createKnownIntentHandler,
  createSecureBookingLookup,
  executeToolSafely,
  policySourcesForMessage
} from "../services/ai-service/src/assistant-domain.js";

test("policy answers are tailored to the specific question instead of one canned sentence", () => {
  const departed = cancellationPolicyResponse("Xe đã chạy rồi thì tôi được hoàn tiền không?");
  const checkedIn = cancellationPolicyResponse("Vé đã check-in thì có hủy được không?");
  const refund = cancellationPolicyResponse("Hủy vé thì được hoàn lại bao nhiêu phần trăm?");
  const arrival = checkinPolicyResponse("Tôi nên có mặt trước giờ xe chạy bao lâu?");
  const lostQr = checkinPolicyResponse("Tôi làm mất QR thì nhân viên tra cứu thế nào?");
  const state = checkinPolicyResponse("Sau check-in booking chuyển sang trạng thái nào?");

  assert.match(departed.answer, /không được hoàn tiền/i);
  assert.match(checkedIn.answer, /không được hủy/i);
  assert.match(refund.answer, /không có một mức hoàn cố định/i);
  assert.match(arrival.answer, /30 phút/i);
  assert.match(lostQr.answer, /mã booking, mã vé hoặc email/i);
  assert.match(state.answer, /CHECKED_IN/);
  assert.equal(new Set([departed.answer, checkedIn.answer, refund.answer, arrival.answer, lostQr.answer, state.answer]).size, 6);
});

test("booking lookup requires both booking code and a valid email before calling the tool", async () => {
  let calls = 0;
  const handle = createKnownIntentHandler({
    searchTrips: async () => ({ trips: [] }),
    getBookingStatus: async () => {
      calls += 1;
      return { booking: {} };
    }
  });

  const missingBoth = await handle({ message: "tra cứu booking" });
  const missingEmail = await handle({ message: "trạng thái vé", bookingCode: "BK-001" });
  const invalidEmail = await handle({ message: "kiểm tra booking", bookingCode: "BK-001", email: "sai-email" });

  assert.equal(missingBoth.dataOrigin, "VALIDATION");
  assert.match(missingBoth.answer, /mã booking và email/i);
  assert.match(missingEmail.answer, /email/i);
  assert.match(invalidEmail.answer, /đúng email/i);
  assert.equal(calls, 0);
});

test("booking context alone does not turn unrelated chat messages into a PII lookup", async () => {
  let calls = 0;
  const handle = createKnownIntentHandler({
    searchTrips: async () => ({ trips: [] }),
    getBookingStatus: async () => {
      calls += 1;
      return { booking: {} };
    }
  });

  const response = await handle({
    message: "Xin chào",
    bookingCode: "BK-PRIVATE",
    email: "guest@example.com"
  });

  assert.equal(response, null);
  assert.equal(calls, 0);
});

test("secure booking lookup exchanges code and email for a scoped capability before reading PII", async () => {
  const requests = [];
  const lookup = createSecureBookingLookup({
    bookingUrl: "http://booking.test",
    requestJSON: async (url, options = {}) => {
      requests.push({ url, options });
      if (requests.length === 1) return { guestAccessToken: "scoped-capability" };
      return { booking: { code: "BK/001", customerEmail: "guest@example.com" } };
    }
  });

  const result = await lookup({ bookingCode: " BK/001 ", email: "Guest@Example.com " });

  assert.equal(result.booking.code, "BK/001");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "http://booking.test/bookings/BK%2F001/guest-access");
  assert.deepEqual(JSON.parse(requests[0].options.body), { email: "guest@example.com" });
  assert.equal(requests[1].options.headers["x-booking-access-token"], "scoped-capability");
});

test("booking response contains only verified Booking Service data", async () => {
  let received;
  const handle = createKnownIntentHandler({
    searchTrips: async () => ({ trips: [] }),
    getBookingStatus: async (input) => {
      received = input;
      return {
        booking: {
          code: "BK-LIVE-7",
          status: "TICKET_ISSUED",
          routeName: "TP.HCM - Đà Lạt",
          totalAmount: 345000
        }
      };
    }
  });

  const response = await handle({
    message: "tra cứu booking",
    bookingCode: "BK-LIVE-7",
    email: "guest@example.com"
  });

  assert.deepEqual(received, { bookingCode: "BK-LIVE-7", email: "guest@example.com" });
  assert.equal(response.dataOrigin, "LIVE_BOOKING_DATA");
  assert.deepEqual(response.toolCalls, ["getBookingStatus"]);
  assert.match(response.answer, /BK-LIVE-7.*TICKET_ISSUED.*345\.000đ/);
});

test("trip answers use exact live Trip Service results", async () => {
  let received;
  const handle = createKnownIntentHandler({
    searchTrips: async (input) => {
      received = input;
      return {
        trips: [{
          departureTime: "2026-07-19T20:30:00.000Z",
          from: "TP.HCM",
          to: "Đà Lạt",
          operatorName: "Nhà xe kiểm thử",
          busType: "Limousine",
          price: 271234
        }]
      };
    },
    getBookingStatus: async () => ({})
  });

  const response = await handle({ message: "Tối mai có chuyến xe Sài Gòn đi Đà Lạt không?" });

  assert.equal(received.from, "TP.HCM");
  assert.equal(received.to, "Đà Lạt");
  assert.equal(received.timeFrom, "18:00");
  assert.equal(response.dataOrigin, "LIVE_TRIP_DATA");
  assert.deepEqual(response.toolCalls, ["searchTrips"]);
  assert.match(response.answer, /Nhà xe kiểm thử.*271\.234đ/);
});

test("tool failures return a safe response and never expose raw internal errors", async () => {
  const handle = createKnownIntentHandler({
    searchTrips: async () => {
      throw new Error("postgres password=top-secret at 10.0.0.8");
    },
    getBookingStatus: async () => ({})
  });

  const response = await handle({ message: "Tìm chuyến Sài Gòn đi Đà Lạt ngày mai" });
  const safeExecution = await executeToolSafely("getBookingStatus", async () => {
    throw new Error("guest@example.com token=secret");
  });

  assert.equal(response.dataOrigin, "TOOL_ERROR");
  assert.doesNotMatch(response.answer, /password|top-secret|10\.0\.0\.8/i);
  assert.deepEqual(safeExecution, {
    ok: false,
    error: "Booking lookup failed. Do not reveal or invent booking data."
  });
});

test("policy citations are intent-specific and absent from general guidance", () => {
  assert.deepEqual(policySourcesForMessage("Tôi muốn hủy vé"), ["bus://policy/cancellation"]);
  assert.deepEqual(policySourcesForMessage("Tôi cần check-in bằng QR"), ["bus://policy/checkin"]);
  assert.deepEqual(policySourcesForMessage("Tôi muốn hủy vé và cần hướng dẫn check-in"), [
    "bus://policy/cancellation",
    "bus://policy/checkin"
  ]);
  assert.deepEqual(policySourcesForMessage("Hướng dẫn tôi đặt vé"), []);
});

test("multiple policy questions are all answered in their original order", async () => {
  const handle = createKnownIntentHandler({
    searchTrips: async () => ({ trips: [] }),
    getBookingStatus: async () => ({})
  });

  const response = await handle({
    message: "Xe chạy rồi thì tôi hủy vé được không? Tôi cần check-in trước bao lâu?"
  });

  assert.equal(response.dataOrigin, "MIXED");
  assert.match(response.answer, /^1\. Theo chính sách hủy vé nội bộ:/);
  assert.match(response.answer, /2\. Theo hướng dẫn check-in:/);
  assert.deepEqual(response.sources, ["bus://policy/cancellation", "bus://policy/checkin"]);
});

test("a trip question and a policy question both survive one message", async () => {
  let searches = 0;
  const handle = createKnownIntentHandler({
    searchTrips: async () => {
      searches += 1;
      return {
        trips: [{
          departureTime: "2026-07-19T20:30:00.000Z",
          from: "TP.HCM",
          to: "Đà Lạt",
          operatorName: "Nhà xe thật",
          busType: "Limousine",
          price: 300000
        }]
      };
    },
    getBookingStatus: async () => ({})
  });

  const response = await handle({
    message: "Tìm chuyến TP.HCM đi Đà Lạt ngày mai. Nếu muốn hủy vé thì chính sách thế nào?"
  });

  assert.equal(searches, 1);
  assert.equal(response.dataOrigin, "MIXED");
  assert.match(response.answer, /1\. Dữ liệu trực tiếp từ Trip Service/);
  assert.match(response.answer, /2\. Theo chính sách hủy vé nội bộ/);
  assert.deepEqual(response.toolCalls, ["searchTrips"]);
  assert.deepEqual(response.sources, ["bus://policy/cancellation"]);
});

test("check-in used as a cancellation condition does not create an unrelated second answer", async () => {
  const handle = createKnownIntentHandler({
    searchTrips: async () => ({ trips: [] }),
    getBookingStatus: async () => ({})
  });

  const response = await handle({
    message: "Booking đã check-in thì tôi có hủy vé được không?"
  });

  assert.equal(response.dataOrigin, "INTERNAL_POLICY");
  assert.doesNotMatch(response.answer, /^1\./);
  assert.deepEqual(response.sources, ["bus://policy/cancellation"]);
});

test("two trip questions execute two independent searches and answer both", async () => {
  const requests = [];
  const handle = createKnownIntentHandler({
    searchTrips: async (input) => {
      requests.push(input);
      return { trips: [], suggestionDate: null };
    },
    getBookingStatus: async () => ({})
  });

  const response = await handle({
    message: "Tìm chuyến Sài Gòn đi Đà Lạt ngày mai? Tìm chuyến Sài Gòn đi Nha Trang ngày kia?"
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(({ from, to }) => ({ from, to })), [
    { from: "TP.HCM", to: "Đà Lạt" },
    { from: "TP.HCM", to: "Nha Trang" }
  ]);
  assert.equal(response.dataOrigin, "MIXED");
  assert.match(response.answer, /^1\./);
  assert.match(response.answer, /\n\n2\./);
});
