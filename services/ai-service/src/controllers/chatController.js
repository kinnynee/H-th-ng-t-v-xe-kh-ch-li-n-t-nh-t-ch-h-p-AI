import config from "../config/env.js";
import { aiSdkAssistant } from "../services/aiService.js";

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
