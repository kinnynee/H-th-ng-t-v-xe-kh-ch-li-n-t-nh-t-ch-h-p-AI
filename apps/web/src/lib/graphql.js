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

/**
 * GraphQL-over-SSE subscription used by the seat map. Yoga emits a `next`
 * event whenever another booking action changes a trip's inventory.
 */
export function subscribeToSeatChanges(tripId, onChange, onError = () => {}) {
  const controller = new AbortController();
  const query = `subscription SeatChanged($tripId: ID!) {
    seatChanged(tripId: $tripId) {
      tripId message
      seats { id label floor status holdExpiresIn }
    }
  }`;

  (async () => {
    try {
      const response = await fetch(getGraphQLEndpoint(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream"
        },
        body: JSON.stringify({ query, variables: { tripId } }),
        signal: controller.signal,
        cache: "no-store"
      });
      if (!response.ok || !response.body) throw new Error("Seat subscription is unavailable");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
          if (!data) continue;
          const payload = JSON.parse(data);
          if (payload.errors?.length) throw new Error(payload.errors.map((item) => item.message).join("\n"));
          if (payload.data?.seatChanged) onChange(payload.data.seatChanged);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) onError(error);
    }
  })();

  return () => controller.abort();
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
