import express from "express";
import cors from "cors";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assistantSystemPrompt, cancellationPolicy, checkinPolicy } from "@bus-ai/shared/policy";
import { isoDate } from "@bus-ai/shared/seed";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  let contents;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(resolve(__dirname, "../../../.env"));

const app = express();
app.use(cors());
app.use(express.json());

const tripUrl = process.env.TRIP_SERVICE_URL || "http://localhost:4010";
const bookingUrl = process.env.BOOKING_SERVICE_URL || "http://localhost:4020";

function fold(value) {
  return String(value ?? "")
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || response.statusText);
  return payload;
}

async function searchTrips({ from = "", to = "", date = "", timeFrom = "" }) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (date) params.set("date", date);
  if (timeFrom) params.set("timeFrom", timeFrom);
  params.set("sort", "DEPARTURE_ASC");
  return requestJSON(`${tripUrl}/trips?${params}`);
}

async function getBookingStatus({ bookingCode, email }) {
  if (!bookingCode || !email) {
    return { error: "Cần cả mã booking và email để tra cứu thông tin riêng tư." };
  }
  return requestJSON(`${bookingUrl}/bookings/${bookingCode}?email=${encodeURIComponent(email)}`);
}

function routeFromText(message) {
  const text = fold(message);
  const from = text.includes("sai gon") || text.includes("tp.hcm") || text.includes("hcm") ? "TP.HCM" : "";
  let to = "";
  if (text.includes("da lat")) to = "Đà Lạt";
  else if (text.includes("nha trang")) to = "Nha Trang";
  else if (text.includes("can tho")) to = "Cần Thơ";
  else if (text.includes("ha noi")) to = "Hà Nội";
  else if (text.includes("da nang")) to = "Đà Nẵng";
  return { from, to };
}

function dateFromText(message) {
  const text = fold(message);
  if (text.includes("ngay kia")) return isoDate(2);
  if (text.includes("mai")) return isoDate(1);
  if (text.includes("hom nay")) return isoDate(0);
  return isoDate(0);
}

function isTripSearchIntent(message) {
  const text = fold(message);
  const route = routeFromText(message);
  const hasTripKeyword =
    text.includes("chuyen") ||
    text.includes("xe") ||
    text.includes("khung gio") ||
    text.includes("gio nao") ||
    text.includes("may gio") ||
    text.includes("luc nao") ||
    text.includes("thoi gian");

  return Boolean(route.from || route.to) && (hasTripKeyword || text.includes("mai") || text.includes("hom nay") || text.includes("ngay kia"));
}

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

async function fallbackAssistant({ message, bookingCode, email }) {
  const text = fold(message);
  const sources = [];
  const toolCalls = [];

  if (text.includes("huy") || text.includes("doi ve") || text.includes("hoan tien")) {
    sources.push("bus://policy/cancellation");
    return {
      answer: `Theo chính sách hủy vé nội bộ: hủy trước 12 tiếng có thể được hoàn 100% tùy tuyến; sau khi xe khởi hành hoặc vé đã check-in thì không hoàn tiền.`,
      sources,
      toolCalls
    };
  }

  if (text.includes("check in") || text.includes("len xe")) {
    sources.push("bus://policy/checkin");
    return {
      answer: `Theo hướng dẫn check-in: hành khách nên có mặt trước giờ khởi hành 30 phút và xuất trình mã booking hoặc QR mô phỏng trên vé điện tử.`,
      sources,
      toolCalls
    };
  }

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

  return {
    answer: "Bạn có thể tìm chuyến, chọn ghế, nhập thông tin hành khách, thanh toán mô phỏng rồi nhận vé điện tử. Mình cũng có thể tra cứu booking nếu bạn cung cấp mã booking và email.",
    sources,
    toolCalls
  };
}

async function aiSdkAssistant(input) {
  if (!process.env.OPENAI_API_KEY) return fallbackAssistant(input);
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
      model: openai(process.env.OPENAI_MODEL || "gpt-4.1-mini"),
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

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ai-service", mode: process.env.OPENAI_API_KEY ? "ai-sdk" : "rule-based" });
});

app.post("/chat", async (req, res) => {
  try {
    res.json(await aiSdkAssistant(req.body));
  } catch (error) {
    res.status(500).json({ answer: error.message, sources: [], toolCalls: [] });
  }
});

const port = Number(process.env.PORT || 4100);
app.listen(port, () => {
  console.log(`[ai-service] listening on http://localhost:${port}`);
});
