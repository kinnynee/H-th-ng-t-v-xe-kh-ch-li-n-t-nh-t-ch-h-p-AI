import { assistantSystemPrompt, cancellationPolicy, checkinPolicy } from "@bus-ai/shared/policy";
import config from "../config/env.js";
import { fold, routeFromText, dateFromText, isTripSearchIntent } from "../utils/textHelper.js";
import { searchTrips, getBookingStatus } from "./tripService.js";

/**
 * Xử lý riêng intent tìm chuyến xe — gọi tripService và format kết quả.
 */
async function answerTripSearch(message) {
  const route = routeFromText(message);
  const text = fold(message);
  const date = dateFromText(message);
  const timeFrom = text.includes("toi") ? "18:00" : "";
  const result = await searchTrips({ ...route, date, timeFrom });

  if (result.trips.length === 0) {
    return {
      answer: result.suggestionDate
        ? `Chưa có chuyến phù hợp ngày ${date}. Ngày gần nhất có chuyến là ${result.suggestionDate}.`
        : `Chưa có chuyến phù hợp với yêu cầu này.`,
      sources: [],
      toolCalls: ["searchTrips"]
    };
  }

  const lines = result.trips.slice(0, 3).map((trip) => {
    const time = trip.departureTime.slice(11, 16);
    return `${time} ${trip.from} đi ${trip.to}, ${trip.operatorName}, ${trip.busType}, ${trip.price.toLocaleString("vi-VN")}đ`;
  });

  return {
    answer: `Mình tìm thấy ${result.trips.length} chuyến. Gợi ý tốt nhất: ${lines.join("; ")}.`,
    sources: [],
    toolCalls: ["searchTrips"]
  };
}

/**
 * Fallback khi không có API key hoặc AI SDK lỗi.
 * Xử lý bằng rule-based: phát hiện keyword → trả lời cứng.
 */
async function fallbackAssistant({ message, bookingCode, email }) {
  const text = fold(message);
  const sources = [];
  const toolCalls = [];

  // Hỏi về chính sách hủy vé / đổi vé / hoàn tiền
  if (text.includes("huy") || text.includes("doi ve") || text.includes("hoan tien")) {
    sources.push("bus://policy/cancellation");
    return {
      answer: `Theo chính sách hủy vé nội bộ: hủy trước 12 tiếng có thể được hoàn 100% tùy tuyến; sau khi xe khởi hành hoặc vé đã check-in thì không hoàn tiền.`,
      sources,
      toolCalls
    };
  }

  // Hỏi về check-in / lên xe
  if (text.includes("check in") || text.includes("len xe")) {
    sources.push("bus://policy/checkin");
    return {
      answer: `Theo hướng dẫn check-in: hành khách nên có mặt trước giờ khởi hành 30 phút và xuất trình mã booking hoặc QR mô phỏng trên vé điện tử.`,
      sources,
      toolCalls
    };
  }

  // Tra cứu booking
  if (text.includes("booking") || bookingCode) {
    toolCalls.push("getBookingStatus");
    const status = await getBookingStatus({ bookingCode, email });
    if (status.error) return { answer: status.error, sources, toolCalls };
    const booking = status.booking;
    return {
      answer: `Booking ${booking.code} đang ở trạng thái ${booking.status}, tuyến ${booking.routeName}, tổng tiền ${booking.totalAmount.toLocaleString("vi-VN")}đ.`,
      sources,
      toolCalls
    };
  }

  // Tìm chuyến xe (fallback)
  const route = routeFromText(message);
  if (route.from || route.to || text.includes("xe") || text.includes("chuyen")) {
    toolCalls.push("searchTrips");
    const date = dateFromText(message);
    const timeFrom = text.includes("toi") ? "18:00" : "";
    const result = await searchTrips({ ...route, date, timeFrom });
    if (result.trips.length === 0) {
      return {
        answer: result.suggestionDate
          ? `Chưa có chuyến phù hợp ngày ${date}. Ngày gần nhất có chuyến là ${result.suggestionDate}.`
          : `Chưa có chuyến phù hợp với yêu cầu này.`,
        sources,
        toolCalls
      };
    }
    const lines = result.trips.slice(0, 3).map((trip) => {
      const time = trip.departureTime.slice(11, 16);
      return `${time} ${trip.from} đi ${trip.to}, ${trip.operatorName}, ${trip.busType}, ${trip.price.toLocaleString("vi-VN")}đ`;
    });
    return {
      answer: `Mình tìm thấy ${result.trips.length} chuyến. Gợi ý tốt nhất: ${lines.join("; ")}.`,
      sources,
      toolCalls
    };
  }

  // Không hiểu ý định — trả lời hướng dẫn chung
  return {
    answer: "Bạn có thể tìm chuyến, chọn ghế, nhập thông tin hành khách, thanh toán mô phỏng rồi nhận vé điện tử. Mình cũng có thể tra cứu booking nếu bạn cung cấp mã booking và email.",
    sources,
    toolCalls
  };
}

/**
 * Entry point chính của business logic.
 * Ưu tiên dùng AI SDK (OpenAI) nếu có API key, ngược lại fallback rule-based.
 */
export async function aiSdkAssistant(input) {
  if (!config.openaiApiKey) return fallbackAssistant(input);
  if (isTripSearchIntent(input.message)) {
    return answerTripSearch(input.message);
  }
  try {
    const [{ generateText, tool }, { openai }, { z }] = await Promise.all([
      import("ai"),
      import("@ai-sdk/openai"),
      import("zod")
    ]);
    const result = await generateText({
      model: openai(config.openaiModel),
      system: `${assistantSystemPrompt}\n${cancellationPolicy}\n${checkinPolicy}`,
      prompt: input.message,
      maxSteps: 3,
      tools: {
        searchTrips: tool({
          description: "Tìm chuyến xe theo điểm đi, điểm đến, ngày và giờ.",
          parameters: z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            date: z.string().optional(),
            timeFrom: z.string().optional()
          }),
          execute: searchTrips
        }),
        getBookingStatus: tool({
          description: "Tra cứu trạng thái booking khi có mã booking và email.",
          parameters: z.object({
            bookingCode: z.string(),
            email: z.string().email()
          }),
          execute: getBookingStatus
        })
      }
    });
    return {
      answer: result.text,
      sources: ["bus://policy/cancellation", "bus://policy/checkin"],
      toolCalls: result.toolCalls?.map((call) => call.toolName) ?? []
    };
  } catch (error) {
    console.warn(`[ai-service] AI SDK fallback: ${error.message}`);
    return fallbackAssistant(input);
  }
}
