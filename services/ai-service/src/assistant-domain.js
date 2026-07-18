import {
  dateFromText,
  fold,
  isCancellationIntent,
  isTripSearchIntent,
  routeFromText
} from "./utils/textHelper.js";

export const POLICY_SOURCES = Object.freeze({
  cancellation: "bus://policy/cancellation",
  checkin: "bus://policy/checkin"
});

export function isCheckinIntent(message) {
  const text = fold(message);
  return text.includes("check in")
    || text.includes("check-in")
    || text.includes("len xe")
    || text.includes("qr")
    || text.includes("co mat truoc")
    || text.includes("xuat trinh")
    || text.includes("ma ve");
}

export function isBookingLookupIntent({ message } = {}) {
  const text = fold(message);
  return text.includes("tra cuu booking")
    || text.includes("kiem tra booking")
    || text.includes("trang thai booking")
    || text.includes("booking cua toi")
    || text.includes("tra cuu ve")
    || text.includes("trang thai ve")
    || text.includes("ve cua toi sao");
}

export function isBookingGuidanceIntent(message) {
  const text = fold(message);
  return text.includes("huong dan dat ve")
    || text.includes("cach dat ve")
    || text.includes("cac buoc dat ve")
    || text.includes("cach mua ve");
}

export function validateBookingLookup({ bookingCode, email } = {}) {
  const code = String(bookingCode ?? "").trim();
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!code && !normalizedEmail) return "Vui lòng cung cấp mã booking và email đặt vé để tra cứu.";
  if (!code) return "Vui lòng cung cấp mã booking để tra cứu.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return "Vui lòng cung cấp đúng email đã dùng khi đặt vé để tra cứu booking.";
  }
  return "";
}

export function createSecureBookingLookup({ requestJSON, bookingUrl }) {
  return async function getBookingStatus({ bookingCode, email } = {}) {
    const validationError = validateBookingLookup({ bookingCode, email });
    if (validationError) return { error: validationError };

    const code = String(bookingCode).trim();
    const normalizedEmail = String(email).trim().toLowerCase();
    try {
      const access = await requestJSON(`${bookingUrl}/bookings/${encodeURIComponent(code)}/guest-access`, {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail })
      });
      if (!access?.guestAccessToken) return { error: "Không thể xác minh quyền truy cập booking." };

      return await requestJSON(`${bookingUrl}/bookings/${encodeURIComponent(code)}`, {
        headers: { "x-booking-access-token": access.guestAccessToken }
      });
    } catch {
      return { error: "Không thể tra cứu booking. Hãy kiểm tra lại mã booking và email." };
    }
  };
}

export function policySourcesForMessage(message) {
  return [
    ...(isCancellationIntent(message) ? [POLICY_SOURCES.cancellation] : []),
    ...(isCheckinIntent(message) ? [POLICY_SOURCES.checkin] : [])
  ];
}

export function generalGuidanceResponse() {
  return {
    answer: "Để đặt vé: tìm chuyến theo điểm đi, điểm đến và ngày; mở chi tiết chuyến; chọn và giữ ghế; nhập hành khách; tạo booking; thanh toán rồi mở vé điện tử. Dữ liệu chuyến và booking chỉ được cung cấp sau khi tool nội bộ trả kết quả.",
    sources: [],
    toolCalls: [],
    dataOrigin: "GUIDANCE"
  };
}

export function cancellationPolicyResponse(message) {
  const text = fold(message);
  let answer;
  if ((text.includes("check in") || text.includes("check-in")) && /\bhuy\b/.test(text)) {
    answer = "Theo chính sách hủy vé nội bộ: booking có bất kỳ vé nào đã check-in thì không được hủy.";
  } else if (text.includes("da khoi hanh") || text.includes("xe da chay") || text.includes("xe chay roi") || text.includes("sau gio khoi hanh")) {
    answer = "Theo chính sách hủy vé nội bộ: sau khi xe đã khởi hành, booking không được hoàn tiền.";
  } else if (text.includes("bao nhieu") || text.includes("phan tram") || text.includes("phi") || text.includes("100%") || text.includes("50%") || text.includes("hoan lai")) {
    answer = "Theo chính sách hủy vé nội bộ: không có một mức hoàn cố định cho mọi vé. Mức hoàn và phí phụ thuộc chính sách đã chốt trên booking và số giờ còn lại trước khi khởi hành; hệ thống sẽ tự tính khi có booking cụ thể.";
  } else {
    answer = "Theo chính sách hủy vé nội bộ: mức hoàn phụ thuộc chính sách đã lưu trên booking và thời gian còn lại; không được hủy sau khi xe khởi hành hoặc khi booking có vé đã check-in.";
  }
  return {
    answer,
    sources: [POLICY_SOURCES.cancellation],
    toolCalls: [],
    dataOrigin: "INTERNAL_POLICY"
  };
}

export function checkinPolicyResponse(message) {
  const text = fold(message);
  let answer;
  if (text.includes("trang thai") || text.includes("chuyen sang")) {
    answer = "Theo hướng dẫn check-in: sau khi check-in thành công, trạng thái booking chuyển sang CHECKED_IN.";
  } else if (text.includes("bao lau") || text.includes("may phut") || text.includes("co mat truoc") || text.includes("truoc gio")) {
    answer = "Theo hướng dẫn check-in: hành khách cần có mặt trước giờ khởi hành tối thiểu 30 phút.";
  } else if (text.includes("mat qr") || text.includes("khong co qr") || text.includes("tra cuu")) {
    answer = "Theo hướng dẫn check-in: nếu không có QR, nhân viên vẫn có thể tra cứu bằng mã booking, mã vé hoặc email.";
  } else if (text.includes("can dua") || text.includes("xuat trinh") || text.includes("giay to") || text.includes("len xe")) {
    answer = "Theo hướng dẫn check-in: hành khách xuất trình mã booking hoặc QR trên vé điện tử khi lên xe.";
  } else {
    answer = "Theo hướng dẫn check-in: có mặt trước giờ khởi hành tối thiểu 30 phút; xuất trình mã booking hoặc QR; nhân viên cũng có thể tra cứu bằng mã vé hoặc email.";
  }
  return {
    answer,
    sources: [POLICY_SOURCES.checkin],
    toolCalls: [],
    dataOrigin: "INTERNAL_POLICY"
  };
}

export function toolErrorResponse(toolName) {
  const label = toolName === "searchTrips" ? "tìm chuyến" : "tra cứu booking";
  return {
    answer: `Hệ thống tạm thời không thể ${label}. Vui lòng thử lại sau; mình không tự tạo dữ liệu thay cho kết quả từ service.`,
    sources: [],
    toolCalls: [toolName],
    dataOrigin: "TOOL_ERROR"
  };
}

export function tripSearchResponse(result, date) {
  const trips = Array.isArray(result?.trips) ? result.trips : [];
  if (trips.length === 0) {
    return {
      answer: result?.suggestionDate
        ? `Chưa có chuyến phù hợp ngày ${date}. Ngày gần nhất có chuyến là ${result.suggestionDate}.`
        : "Chưa có chuyến phù hợp với yêu cầu này.",
      sources: [],
      toolCalls: ["searchTrips"],
      dataOrigin: "LIVE_TRIP_DATA"
    };
  }
  const lines = trips.slice(0, 3).map((trip) => {
    const departure = String(trip.departureTime ?? "");
    const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(departure) ? departure.slice(11, 16) : "chưa rõ giờ";
    const price = Number.isFinite(Number(trip.price)) ? `${Number(trip.price).toLocaleString("vi-VN")}đ` : "chưa có giá";
    return `${time} ${trip.from ?? ""} đi ${trip.to ?? ""}, ${trip.operatorName ?? "nhà xe chưa xác định"}, ${trip.busType ?? "loại xe chưa xác định"}, ${price}`;
  });
  return {
    answer: `Dữ liệu trực tiếp từ Trip Service: tìm thấy ${trips.length} chuyến. ${lines.join("; ")}.`,
    sources: [],
    toolCalls: ["searchTrips"],
    dataOrigin: "LIVE_TRIP_DATA"
  };
}

export function splitUserRequests(message) {
  const value = String(message ?? "").trim();
  if (!value) return [];
  return value
    .split(/[?!;\n]+|\.(?=\s|$)/u)
    .map((item) => item.replace(/^\s*\d+[.)-]?\s*/, "").trim())
    .filter(Boolean);
}

function intentPosition(message, keywords) {
  const text = fold(message);
  const indexes = keywords.map((keyword) => text.indexOf(keyword)).filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : Number.MAX_SAFE_INTEGER;
}

function segmentIntents(segment) {
  const text = fold(segment);
  const intents = [];
  if (isTripSearchIntent(segment)) {
    intents.push({ kind: "trip", position: intentPosition(segment, ["tim", "chuyen", "xe", "mai", "hom nay"]) });
  }
  if (isCancellationIntent(segment)) {
    intents.push({ kind: "cancellation", position: intentPosition(segment, ["huy", "doi ve", "hoan tien"]) });
  }
  if (isCheckinIntent(segment)) {
    intents.push({ kind: "checkin", position: intentPosition(segment, ["check in", "check-in", "len xe", "qr"]) });
  }
  if (isBookingLookupIntent({ message: segment })) {
    intents.push({ kind: "booking", position: intentPosition(segment, ["tra cuu", "kiem tra", "trang thai", "booking cua toi", "ve cua toi"]) });
  }
  if (isBookingGuidanceIntent(segment)) {
    intents.push({ kind: "guidance", position: intentPosition(segment, ["huong dan", "cach", "cac buoc"]) });
  }

  const hasCancellation = intents.some(({ kind }) => kind === "cancellation");
  const hasCheckin = intents.some(({ kind }) => kind === "checkin");
  if (hasCancellation && hasCheckin) {
    const explicitlyAsksBoth = /\bhuy\b.*\b(va|dong thoi|ngoai ra)\b.*(check in|check-in|len xe|qr)|(check in|check-in|len xe|qr).*\b(va|dong thoi|ngoai ra)\b.*\bhuy\b/.test(text);
    const checkinIsCondition = /(sau khi|neu|da|bat ky).{0,35}(check in|check-in)|(check in|check-in).{0,35}(thi|roi|co).*\bhuy\b/.test(text);
    if (checkinIsCondition && !explicitlyAsksBoth) {
      return intents.filter(({ kind }) => kind !== "checkin").sort((a, b) => a.position - b.position);
    }
  }

  return intents.sort((a, b) => a.position - b.position);
}

export function mergeAssistantResponses(responses) {
  const items = responses.filter(Boolean);
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return {
    answer: items.map((item, index) => `${index + 1}. ${item.answer}`).join("\n\n"),
    sources: [...new Set(items.flatMap((item) => item.sources ?? []))],
    toolCalls: [...new Set(items.flatMap((item) => item.toolCalls ?? []))],
    dataOrigin: "MIXED"
  };
}

export function createKnownIntentHandler({ searchTrips, getBookingStatus }) {
  return async function handleKnownIntent(input = {}) {
    const message = String(input.message ?? "");
    const requests = splitUserRequests(message);
    const tasks = requests.flatMap((segment, requestIndex) => (
      segmentIntents(segment).map((intent) => ({ ...intent, segment, requestIndex }))
    ));
    if (tasks.length === 0) return null;

    const responses = [];
    for (const task of tasks.sort((a, b) => a.requestIndex - b.requestIndex || a.position - b.position)) {
      if (task.kind === "trip") {
        const route = routeFromText(task.segment);
        const text = fold(task.segment);
        const date = dateFromText(task.segment);
        try {
          const result = await searchTrips({ ...route, date, timeFrom: text.includes("toi") ? "18:00" : "" });
          responses.push(tripSearchResponse(result, date));
        } catch {
          responses.push(toolErrorResponse("searchTrips"));
        }
      } else if (task.kind === "cancellation") {
        responses.push(cancellationPolicyResponse(task.segment));
      } else if (task.kind === "checkin") {
        responses.push(checkinPolicyResponse(task.segment));
      } else if (task.kind === "booking") {
        const validationError = validateBookingLookup(input);
        if (validationError) {
          responses.push({ answer: validationError, sources: [], toolCalls: [], dataOrigin: "VALIDATION" });
          continue;
        }
        try {
          const status = await getBookingStatus({ bookingCode: input.bookingCode, email: input.email });
          if (status?.error || !status?.booking) {
            responses.push(toolErrorResponse("getBookingStatus"));
            continue;
          }
          const booking = status.booking;
          const total = Number.isFinite(Number(booking.totalAmount)) ? `${Number(booking.totalAmount).toLocaleString("vi-VN")}đ` : "chưa có dữ liệu";
          responses.push({
            answer: `Dữ liệu trực tiếp từ Booking Service: booking ${booking.code} đang ở trạng thái ${booking.status}, tuyến ${booking.routeName}, tổng tiền ${total}.`,
            sources: [],
            toolCalls: ["getBookingStatus"],
            dataOrigin: "LIVE_BOOKING_DATA"
          });
        } catch {
          responses.push(toolErrorResponse("getBookingStatus"));
        }
      } else if (task.kind === "guidance") {
        responses.push(generalGuidanceResponse());
      }
    }
    return mergeAssistantResponses(responses);
  };
}

export async function executeToolSafely(toolName, execute) {
  try {
    return { ok: true, data: await execute() };
  } catch {
    return {
      ok: false,
      error: toolName === "searchTrips"
        ? "Trip Service is temporarily unavailable. Do not invent trip data."
        : "Booking lookup failed. Do not reveal or invent booking data."
    };
  }
}
