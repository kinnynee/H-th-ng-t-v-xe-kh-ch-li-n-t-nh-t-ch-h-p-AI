function operationName(query) {
  return String(query ?? "").match(/\b(?:query|mutation|subscription)\s+(\w+)/)?.[1] ?? "anonymous";
}

export function reportClientError(error, context = {}) {
  if (typeof window === "undefined") return;
  const payload = {
    message: String(error?.message ?? "Unknown client error").slice(0, 500),
    name: error?.name ?? "Error",
    path: window.location.pathname,
    ...context
  };
  void fetch("/api/client-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {});
}

export function reportGraphQLError(error, query, status) {
  reportClientError(error, { category: "graphql", operation: operationName(query), status });
}
