/** Express transport helpers. Controllers own HTTP concerns; services throw domain errors. */
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Endpoint not found", requestId: _req.requestId });
}

export function errorHandler(error, req, res, _next) {
  const status = Number(error.status) || 500;
  const safeMessage = status >= 500 ? "Internal server error" : error.message || "Request failed";
  const log = req.log;
  if (status >= 500) log?.error("http_request_failed", { statusCode: status, error });
  else log?.warn("http_request_rejected", { statusCode: status, error: error.message });
  res.status(status).json({ error: safeMessage, requestId: req.requestId });
}
