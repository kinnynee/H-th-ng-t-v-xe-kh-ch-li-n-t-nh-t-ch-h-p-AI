export function getGraphQLEndpoint() {
  if (typeof window === "undefined") {
    return process.env.GRAPHQL_URL || process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:4000/graphql";
  }
  return process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:4000/graphql";
}

export async function gql(query, variables = {}) {
  const response = await fetch(getGraphQLEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store"
  });
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("\n"));
  }
  return payload.data;
}

export function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")}đ`;
}

export function shortDateTime(value) {
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function todayISO(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
