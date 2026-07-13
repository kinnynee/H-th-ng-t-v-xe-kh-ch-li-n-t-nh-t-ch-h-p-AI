import config from "../config/env.js";
import { aiSdkAssistant } from "../services/aiService.js";

/**
 * GET /health — Kiểm tra trạng thái hoạt động của ai-service.
 * Trả về mode đang chạy (ai-sdk hoặc rule-based).
 */
export function healthCheck(_req, res) {
  res.json({
    ok: true,
    service: "ai-service",
    mode: config.openaiApiKey ? "ai-sdk" : "rule-based"
  });
}

/**
 * POST /chat — Nhận tin nhắn từ người dùng, xử lý qua aiService,
 * trả về kết quả { answer, sources, toolCalls }.
 */
export async function chat(req, res) {
  try {
    res.json(await aiSdkAssistant(req.body));
  } catch (error) {
    res.status(500).json({ answer: error.message, sources: [], toolCalls: [] });
  }
}
