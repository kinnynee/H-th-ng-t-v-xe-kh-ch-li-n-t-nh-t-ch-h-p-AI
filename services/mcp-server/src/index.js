import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { cancellationPolicy, checkinPolicy } from "@bus-ai/shared/policy";
import { startGrpcServer } from "@bus-ai/shared/grpc";
import { createHealthCheck } from "./health.js";
import { protectedRequestHeaders, requireBookingCredential } from "./access.js";

const tripUrl = process.env.TRIP_SERVICE_URL || "http://localhost:4010";
const bookingUrl = process.env.BOOKING_SERVICE_URL || "http://localhost:4020";
const analyticsUrl = process.env.ANALYTICS_SERVICE_URL || "http://localhost:4050";

async function requestJSON(url, { userAccessToken = "", bookingAccessToken = "" } = {}) {
  const response = await fetch(url, {
    headers: {
      ...protectedRequestHeaders({ userAccessToken, bookingAccessToken })
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || response.statusText);
  return payload;
}

const operationalHealth = createHealthCheck({ tripUrl, bookingUrl, analyticsUrl });

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
  {
    bookingCode: z.string(),
    userAccessToken: z.string().min(20).optional(),
    bookingAccessToken: z.string().min(20).optional()
  },
  async ({ bookingCode, userAccessToken = "", bookingAccessToken = "" }) => {
    requireBookingCredential({ userAccessToken, bookingAccessToken });
    return textContent(await requestJSON(`${bookingUrl}/bookings/${encodeURIComponent(bookingCode)}`, {
      userAccessToken,
      bookingAccessToken
    }));
  }
);

server.tool("get_revenue_summary", { userAccessToken: z.string().min(20) }, async ({ userAccessToken }) => {
  return textContent(await requestJSON(`${analyticsUrl}/summary`, { userAccessToken }));
});

server.tool("get_popular_routes", { userAccessToken: z.string().min(20) }, async ({ userAccessToken }) => {
  const summary = await requestJSON(`${analyticsUrl}/summary`, { userAccessToken });
  return textContent(summary.popularRoutes);
});

server.resource("cancellation_policy", "bus://policy/cancellation", async (uri) => ({
  contents: [{ uri: uri.href, text: cancellationPolicy }]
}));

server.resource("checkin_policy", "bus://policy/checkin", async (uri) => ({
  contents: [{ uri: uri.href, text: checkinPolicy }]
}));

server.resource("system_health", "bus://system/health", async (uri) => {
  const check = async (url) => {
    try {
      return await requestJSON(url);
    } catch (error) {
      return { ok: false, error: error.message };
    }
  };
  return {
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify({
          tripService: await check(`${tripUrl}/health`),
          bookingService: await check(`${bookingUrl}/health`),
          analyticsService: await check(`${analyticsUrl}/health`)
        }, null, 2)
      }
    ]
  };
});

const grpcServer = await startGrpcServer({
  serviceName: "mcp-server",
  bindAddress: process.env.MCP_GRPC_BIND || "0.0.0.0:50055",
  check: operationalHealth
});

await server.connect(new StdioServerTransport());

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const force = setTimeout(() => {
    grpcServer.forceShutdown();
    process.exit(1);
  }, 10_000);
  force.unref();
  grpcServer.tryShutdown(() => process.exit(0));
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
