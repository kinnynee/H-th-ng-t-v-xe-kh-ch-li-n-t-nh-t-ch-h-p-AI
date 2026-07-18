import express from "express";
import cors from "cors";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assistantSystemPrompt, cancellationPolicy, checkinPolicy } from "@bus-ai/shared/policy";
import { errorHandler, notFoundHandler } from "@bus-ai/shared/http";
import { createLogger, registerProcessErrorHandlers, requestLoggingMiddleware } from "@bus-ai/shared/logger";
import {
  createKnownIntentHandler,
  createSecureBookingLookup,
  executeToolSafely,
  generalGuidanceResponse,
  policySourcesForMessage
} from "./assistant-domain.js";

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

const logger = createLogger("ai-service");
registerProcessErrorHandlers(logger);
const app = express();
app.use(requestLoggingMiddleware(logger));
app.use(cors());
app.use(express.json());

const tripUrl = process.env.TRIP_SERVICE_URL || "http://localhost:4010";
const bookingUrl = process.env.BOOKING_SERVICE_URL || "http://localhost:4020";

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

const getBookingStatus = createSecureBookingLookup({ requestJSON, bookingUrl });
const handleKnownIntent = createKnownIntentHandler({ searchTrips, getBookingStatus });

async function fallbackAssistant(input) {
  return (await handleKnownIntent(input)) ?? generalGuidanceResponse();
}

async function aiSdkAssistant(input = {}) {
  const knownResponse = await handleKnownIntent(input);
  if (knownResponse) return knownResponse;
  if (!process.env.OPENAI_API_KEY) return generalGuidanceResponse();
  try {
    const [{ generateText, tool }, { openai }, { z }] = await Promise.all([
      import("ai"), import("@ai-sdk/openai"), import("zod")
    ]);
    const result = await generateText({
      model: openai(process.env.OPENAI_MODEL || "gpt-4.1-mini"),
      system: `${assistantSystemPrompt}\n${cancellationPolicy}\n${checkinPolicy}`,
      prompt: String(input.message ?? ""),
      maxSteps: 3,
      tools: {
        searchTrips: tool({
          description: "Tìm chuyến xe bằng dữ liệu trực tiếp từ Trip Service. Chỉ sử dụng dữ liệu tool trả về, không tự tạo chuyến.",
          parameters: z.object({ from: z.string().optional(), to: z.string().optional(), date: z.string().optional(), timeFrom: z.string().optional() }),
          execute: (request) => executeToolSafely("searchTrips", () => searchTrips(request))
        }),
        getBookingStatus: tool({
          description: "Tra cứu booking chỉ sau khi xác minh cả mã booking và đúng email đặt vé. Không tiết lộ hoặc tự tạo dữ liệu booking.",
          parameters: z.object({ bookingCode: z.string(), email: z.string().email() }),
          execute: () => executeToolSafely("getBookingStatus", () => getBookingStatus({
            bookingCode: input.bookingCode,
            email: input.email
          }))
        })
      }
    });
    const toolCalls = result.toolCalls?.map((call) => call.toolName) ?? [];
    const sources = policySourcesForMessage(input.message);
    return {
      answer: result.text || generalGuidanceResponse().answer,
      sources,
      toolCalls,
      dataOrigin: toolCalls.length ? "LIVE_TOOL_DATA" : sources.length ? "INTERNAL_POLICY" : "AI_GUIDANCE"
    };
  } catch (error) {
    logger.warn("ai_sdk_fallback", { error });
    return fallbackAssistant(input);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ai-service", mode: process.env.OPENAI_API_KEY ? "ai-sdk" : "rule-based" });
});

app.post("/chat", async (req, res) => {
  try {
    res.json(await aiSdkAssistant(req.body ?? {}));
  } catch (error) {
    logger.error("assistant_request_failed", { error });
    res.json({
      ...generalGuidanceResponse(),
      answer: "Chatbot tạm thời không thể xử lý yêu cầu. Vui lòng thử lại sau.",
      dataOrigin: "TOOL_ERROR"
    });
  }
});

const port = Number(process.env.PORT || 4100);
app.use(notFoundHandler);
app.use(errorHandler);
app.listen(port, () => {
  logger.info("service_started", { port, mode: process.env.OPENAI_API_KEY ? "ai-sdk" : "rule-based" });
});
