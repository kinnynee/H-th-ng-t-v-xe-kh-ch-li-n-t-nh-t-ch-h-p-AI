import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { cancellationPolicy, checkinPolicy } from "@bus-ai/shared/policy";

const tripUrl = process.env.TRIP_SERVICE_URL || "http://localhost:4010";
const bookingUrl = process.env.BOOKING_SERVICE_URL || "http://localhost:4020";
const analyticsUrl = process.env.ANALYTICS_SERVICE_URL || "http://localhost:4050";

async function requestJSON(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || response.statusText);
  return payload;
}

function textContent(data) {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }]
  };
}

const server = new McpServer({
  name: "bus-ai-ticketing-mcp",
  version: "1.0.0"
});

server.tool(
  "search_trips",
  {
    from: z.string().optional(),
    to: z.string().optional(),
    date: z.string().optional()
  },
  async ({ from = "", to = "", date = "" }) => {
    const params = new URLSearchParams({ from, to, date, sort: "DEPARTURE_ASC" });
    return textContent(await requestJSON(`${tripUrl}/trips?${params}`));
  }
);

server.tool("get_trip_detail", { tripId: z.string() }, async ({ tripId }) => {
  return textContent(await requestJSON(`${tripUrl}/trips/${tripId}`));
});

server.tool(
  "get_booking_status",
  { bookingCode: z.string(), email: z.string().email() },
  async ({ bookingCode, email }) => {
    return textContent(await requestJSON(`${bookingUrl}/bookings/${bookingCode}?email=${encodeURIComponent(email)}`));
  }
);

server.tool("get_revenue_summary", {}, async () => {
  return textContent(await requestJSON(`${analyticsUrl}/summary`));
});

server.tool("get_popular_routes", {}, async () => {
  const summary = await requestJSON(`${analyticsUrl}/summary`);
  return textContent(summary.popularRoutes);
});

server.resource("cancellation_policy", "bus://policy/cancellation", async (uri) => ({
  contents: [{ uri: uri.href, text: cancellationPolicy }]
}));

server.resource("checkin_policy", "bus://policy/checkin", async (uri) => ({
  contents: [{ uri: uri.href, text: checkinPolicy }]
}));

server.resource("system_health", "bus://system/health", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: JSON.stringify({
        tripService: `${tripUrl}/health`,
        bookingService: `${bookingUrl}/health`,
        analyticsService: `${analyticsUrl}/health`
      })
    }
  ]
}));

await server.connect(new StdioServerTransport());
