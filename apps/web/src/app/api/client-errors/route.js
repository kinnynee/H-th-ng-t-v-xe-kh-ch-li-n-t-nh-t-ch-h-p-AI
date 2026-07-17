import { NextResponse } from "next/server";
import { createLogger } from "@bus-ai/shared/logger";

const logger = createLogger("web");

export async function POST(request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 8_192) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const payload = await request.json().catch(() => ({}));
  logger.warn("client_error_reported", {
    category: payload.category ?? "ui",
    operation: payload.operation,
    path: payload.path,
    status: payload.status,
    name: payload.name,
    message: String(payload.message ?? "Unknown client error").slice(0, 500)
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}
