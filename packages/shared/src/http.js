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
  res.status(404).json({ error: "Endpoint not found" });
}

export function errorHandler(error, _req, res, _next) {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error("[http]", error);
  res.status(status).json({ error: error.message || "Internal server error" });
}
