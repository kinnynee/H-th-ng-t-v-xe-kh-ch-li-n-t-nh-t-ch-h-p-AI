import config from "../config/env.js";

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
