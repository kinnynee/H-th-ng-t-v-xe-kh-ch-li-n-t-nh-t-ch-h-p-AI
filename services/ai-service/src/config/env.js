import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Đọc file .env và gán các biến môi trường chưa tồn tại vào process.env.
 * Không ghi đè biến đã có sẵn (ưu tiên biến từ Docker/system).
 */
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

// Load .env từ thư mục gốc dự án
loadEnvFile(resolve(__dirname, "../../../../.env"));

/** Cấu hình tập trung cho ai-service */
const config = {
  port: Number(process.env.PORT || 4100),
  tripServiceUrl: process.env.TRIP_SERVICE_URL || "http://localhost:4010",
  bookingServiceUrl: process.env.BOOKING_SERVICE_URL || "http://localhost:4020",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  githubModelsToken: process.env.GITHUB_MODELS_TOKEN || "",
  githubModelsChatModel: process.env.GITHUB_MODELS_CHAT_MODEL || "openai/gpt-4o-mini",
  githubModelsEmbeddingModel: process.env.GITHUB_MODELS_EMBEDDING_MODEL || "openai/text-embedding-3-small",
};

export default config;
