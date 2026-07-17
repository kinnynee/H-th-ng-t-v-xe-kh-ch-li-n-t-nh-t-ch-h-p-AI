import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const contextStore = new AsyncLocalStorage();
const sensitiveKey = /password|authorization|cookie|token|secret|document.?id/i;
const maxDepth = 5;

function redactString(value) {
  return value
    .replace(/(\bBearer\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-jwt]")
    .replace(/([?&](?:access_?token|token|password|secret|authorization|cookie)=)[^&#\s]+/gi, "$1[redacted]");
}

function sanitize(value, depth = 0) {
  if (depth >= maxDepth) return "[truncated]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(process.env.NODE_ENV === "production" ? {} : { stack: value.stack })
    };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKey.test(key) ? "[redacted]" : sanitize(item, depth + 1)
    ]));
  }
  if (typeof value === "string") {
    const redacted = redactString(value);
    return redacted.length > 2_000 ? `${redacted.slice(0, 2_000)}...[truncated]` : redacted;
  }
  return value;
}

export function sanitizeLogData(value) {
  return sanitize(value);
}

export function getLogContext() {
  return contextStore.getStore() ?? {};
}

export function runWithLogContext(context, work) {
  return contextStore.run({ ...getLogContext(), ...sanitize(context) }, work);
}

export function requestIdFromHeaders(headers = {}) {
  const candidate = typeof headers.get === "function"
    ? headers.get("x-request-id")
    : headers["x-request-id"] ?? headers["X-Request-Id"];
  return /^[A-Za-z0-9._-]{8,128}$/.test(String(candidate ?? "")) ? String(candidate) : randomUUID();
}

export function createLogger(service, base = {}) {
  function write(level, event, details = {}) {
    const record = sanitize({
      timestamp: new Date().toISOString(),
      level,
      service,
      event,
      ...getLogContext(),
      ...base,
      ...details
    });
    const output = JSON.stringify(record);
    if (level === "error") console.error(output);
    else if (level === "warn") console.warn(output);
    else console.log(output);
  }
  return {
    debug: (event, details) => write("debug", event, details),
    info: (event, details) => write("info", event, details),
    warn: (event, details) => write("warn", event, details),
    error: (event, details) => write("error", event, details),
    child: (context) => createLogger(service, { ...base, ...sanitize(context) })
  };
}

export function requestLoggingMiddleware(logger) {
  return (req, res, next) => {
    const requestId = requestIdFromHeaders(req.headers);
    const startedAt = process.hrtime.bigint();
    req.requestId = requestId;
    req.log = logger.child({ requestId });
    res.setHeader("x-request-id", requestId);
    res.once("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      req.log.info("http_request_completed", {
        method: req.method,
        path: String(req.originalUrl ?? req.url ?? "/").split("?")[0],
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2))
      });
    });
    return runWithLogContext({ requestId }, next);
  };
}

export function observeNodeRequest(logger, req, res) {
  const requestId = requestIdFromHeaders(req.headers);
  const startedAt = process.hrtime.bigint();
  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);
  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info("http_request_completed", {
      requestId,
      method: req.method,
      path: new URL(req.url ?? "/", "http://localhost").pathname,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2))
    });
  });
  return requestId;
}

export function registerProcessErrorHandlers(logger) {
  process.on("unhandledRejection", (reason) => {
    logger.error("process_unhandled_rejection", { error: reason });
  });
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    logger.error("process_uncaught_exception", { origin, error });
  });
}
