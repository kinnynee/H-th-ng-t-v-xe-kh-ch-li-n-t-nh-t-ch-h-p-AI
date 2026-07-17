import { createServer } from "node:http";
import { createSchema, createYoga } from "graphql-yoga";
import { seatChangedRoutingKey, subscribeRabbitEphemeral } from "@bus-ai/shared/broker";
import { startGrpcServer } from "@bus-ai/shared/grpc";
import { assertAuthConfiguration, authenticate, authorize } from "@bus-ai/shared/auth";
import { createHealthCheck } from "./health.js";

const tripUrl = process.env.TRIP_SERVICE_URL || "http://localhost:4010";
const bookingUrl = process.env.BOOKING_SERVICE_URL || "http://localhost:4020";
const aiUrl = process.env.AI_SERVICE_URL || "http://localhost:4100";
const analyticsUrl = process.env.ANALYTICS_SERVICE_URL || "http://localhost:4050";

const operationalHealth = createHealthCheck({ tripUrl, bookingUrl, analyticsUrl });
assertAuthConfiguration();

class FallbackPubSub {
  constructor() {
    this.listeners = new Map();
  }

  publish(topic, payload) {
    for (const listener of this.listeners.get(topic) ?? []) listener(payload);
  }

  subscribe(topic) {
    const listeners = this.listeners;
    const queue = [];
    const waiters = [];
    const push = (payload) => {
      if (waiters.length) waiters.shift()({ value: payload, done: false });
      else queue.push(payload);
    };
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic).add(push);
    return {
      [Symbol.asyncIterator]() {
        return this;
      },
      next() {
        if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
        return new Promise((resolve) => waiters.push(resolve));
      },
      return: () => {
        listeners.get(topic)?.delete(push);
        return Promise.resolve({ value: undefined, done: true });
      }
    };
  }
}

const fallbackPubSub = new FallbackPubSub();

function publishFallbackSeatChange(payload) {
  // RabbitMQ events are produced by Seat Inventory, which is the owner of the
  // state. This relay only preserves GraphQL subscriptions in no-infra dev mode.
  fallbackPubSub.publish(`seat:${payload.tripId}`, payload);
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || response.statusText);
  return payload;
}

function qs(input = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, value);
  }
  return params.toString();
}

function graphQLAuth(request) {
  const authorization = request.headers.get("authorization") ?? "";
  const bookingAccessToken = request.headers.get("x-booking-access-token") ?? "";
  if (!authorization) return { user: null, authorization: "", bookingAccessToken };
  try {
    return { user: authenticate(request.headers), authorization, bookingAccessToken };
  } catch {
    return { user: null, authorization: "", bookingAccessToken };
  }
}

function bookingAccessHeaders(context) {
  return {
    ...(context.authorization ? { authorization: context.authorization } : {}),
    ...(context.bookingAccessToken ? { "x-booking-access-token": context.bookingAccessToken } : {})
  };
}

function authenticatedHeaders(context, roles = []) {
  const user = roles.length ? authorize(context.user, roles) : authorize(context.user, ["CUSTOMER", "STAFF", "ADMIN"]);
  return { authorization: context.authorization, user };
}

function requireAccountOwner(context, userId) {
  const { user, authorization } = authenticatedHeaders(context);
  if (user.id !== userId && user.role !== "ADMIN") {
    throw new Error("You do not have permission for this account.");
  }
  return { authorization, user };
}

const typeDefs = /* GraphQL */ `
  enum SortMode {
    PRICE_ASC
    DEPARTURE_ASC
    DURATION_ASC
  }

  type Location {
    id: ID!
    name: String!
    stations: [String!]!
  }

  type Stop {
    id: ID!
    city: String!
    name: String!
  }

  type Operator {
    id: ID!
    name: String!
    hotline: String!
  }

  type Vehicle {
    id: ID!
    plate: String!
    type: String!
    seatCount: Int!
    layout: String!
  }

  type Route {
    id: ID!
    from: String!
    to: String!
    distanceKm: Int!
    durationMinutes: Int!
    pickup: String!
    dropoff: String!
    cancellationPolicy: String!
  }

  type Trip {
    id: ID!
    routeId: ID!
    from: String!
    to: String!
    pickup: String!
    dropoff: String!
    operatorId: ID!
    operatorName: String!
    vehicleId: ID!
    vehiclePlate: String!
    busType: String!
    seatCount: Int!
    availableSeats: Int!
    date: String!
    departureTime: String!
    arrivalTime: String!
    durationMinutes: Int!
    price: Int!
    status: String!
    cancellationPolicy: String!
    seats: [Seat!]!
    route: Route
  }

  type Seat {
    id: ID!
    label: String!
    floor: Int!
    status: String!
    holdExpiresIn: Int!
    holdToken: String
  }

  type SearchTripsPayload {
    trips: [Trip!]!
    suggestionDate: String
    cache: String
  }

  input SearchTripsInput {
    from: String
    to: String
    date: String
    timeFrom: String
    timeTo: String
    minPrice: Int
    maxPrice: Int
    minSeats: Int
    operator: String
    busType: String
    sort: SortMode
    includeInactive: Boolean
  }

  input PassengerInput {
    seatId: String!
    fullName: String!
    phone: String!
    email: String!
    documentId: String
  }

  input SavedPassengerInput {
    fullName: String!
    phone: String!
    email: String!
    documentId: String
  }

  input CreateBookingInput {
    tripId: ID!
    holdToken: String!
    customerEmail: String!
    customerPhone: String!
    passengers: [PassengerInput!]!
    userId: String
  }

  input RouteInput {
    from: String!
    to: String!
    distanceKm: Int!
    durationMinutes: Int!
    pickup: String!
    dropoff: String!
    cancellationPolicy: String!
  }

  input TripInput {
    routeId: ID!
    operatorId: ID!
    vehicleId: ID!
    departureTime: String!
    price: Int!
    status: String
  }

  input VehicleInput {
    plate: String!
    type: String!
    seatCount: Int!
    layout: String!
  }

  input StopInput {
    city: String!
    name: String!
  }

  input RegisterCustomerInput {
    name: String!
    email: String!
    password: String!
  }

  type Passenger {
    seatId: String!
    fullName: String!
    phone: String!
    email: String!
    documentId: String
  }

  type SavedPassenger {
    id: ID!
    fullName: String!
    phone: String!
    email: String!
    documentId: String
  }

  type Ticket {
    id: ID!
    passengerName: String!
    seatId: String!
    qrPayload: String!
    issuedAt: String!
    status: String!
    checkedInAt: String
  }

  type Booking {
    code: ID!
    tripId: ID!
    trip: Trip
    routeName: String!
    departureTime: String!
    pickup: String!
    dropoff: String!
    vehiclePlate: String!
    cancellationPolicy: String!
    customerEmail: String!
    customerPhone: String
    seatIds: [String!]!
    passengers: [Passenger!]!
    totalAmount: Int!
    refundAmount: Int!
    cancellationFee: Int!
    status: String!
    tickets: [Ticket!]!
    ticketHtmlUrl: String!
    ticketPdfUrl: String!
    guestAccessToken: String
    guestAccessExpiresAt: String
    createdAt: String!
    paymentExpiresAt: String
    updatedAt: String!
    paidAt: String
    checkedInAt: String
    cancelledAt: String
  }

  type GuestBookingAccess {
    guestAccessToken: String!
    expiresAt: String!
  }

  type HoldResult {
    ok: Boolean!
    message: String!
    holdToken: String
    expiresIn: Int!
    seats: [Seat!]!
  }

  type User {
    id: ID!
    email: String!
    role: String!
    name: String!
    savedPassengers: [SavedPassenger!]!
  }

  type AuthPayload {
    user: User!
    accessToken: String!
  }

  type RevenuePoint {
    date: String!
    revenue: Int!
    tickets: Int!
  }

  type PopularRoute {
    route: String!
    searches: Int!
    tickets: Int!
  }

  type AnalyticsSummary {
    revenueByDay: [RevenuePoint!]!
    popularRoutes: [PopularRoute!]!
    conversionRate: Float!
    eventCount: Int!
  }

  type EventLog {
    eventId: ID!
    eventType: String!
    topic: String!
    occurredAt: String!
    payload: String!
  }

  type ChatResponse {
    answer: String!
    sources: [String!]!
    toolCalls: [String!]!
  }

  type Catalog {
    locations: [Location!]!
    operators: [Operator!]!
    vehicles: [Vehicle!]!
  }

  type SeatChangedEvent {
    tripId: ID!
    seats: [Seat!]!
    message: String!
  }

  type Query {
    health: String!
    catalog: Catalog!
    stops: [Stop!]!
    routes: [Route!]!
    searchTrips(input: SearchTripsInput!): SearchTripsPayload!
    trip(id: ID!): Trip
    booking(code: ID!, email: String): Booking
    bookingsByTrip(tripId: ID!): [Booking!]!
    myBookings(userId: ID!): [Booking!]!
    savedPassengers(userId: ID!): [SavedPassenger!]!
    adminSummary: AnalyticsSummary!
    eventLogs(limit: Int): [EventLog!]!
  }

  type Mutation {
    holdSeats(tripId: ID!, seatIds: [String!]!, customerEmail: String, ttlSeconds: Int): HoldResult!
    createBooking(input: CreateBookingInput!): Booking!
    requestGuestBookingAccess(code: ID!, email: String!): GuestBookingAccess!
    payBooking(code: ID!, success: Boolean!): Booking!
    cancelBooking(code: ID!): Booking!
    checkIn(codeOrTicket: String!): Booking!
    adminLogin(email: String!, password: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    registerCustomer(input: RegisterCustomerInput!): AuthPayload!
    savePassenger(userId: ID!, passenger: SavedPassengerInput!): SavedPassenger!
    deleteSavedPassenger(userId: ID!, passengerId: ID!): Boolean!
    createRoute(input: RouteInput!): Route!
    updateRoute(id: ID!, input: RouteInput!): Route!
    deleteRoute(id: ID!): Boolean!
    createStop(input: StopInput!): Stop!
    updateStop(id: ID!, input: StopInput!): Stop!
    deleteStop(id: ID!): Boolean!
    createVehicle(input: VehicleInput!): Vehicle!
    updateVehicle(id: ID!, input: VehicleInput!): Vehicle!
    deleteVehicle(id: ID!): Boolean!
    createTrip(input: TripInput!): Trip!
    updateTrip(id: ID!, input: TripInput!): Trip!
    deleteTrip(id: ID!): Boolean!
    updateTripStatus(id: ID!, status: String!): Trip!
    blockSeats(tripId: ID!, seatIds: [String!]!, blocked: Boolean!): HoldResult!
    askAssistant(message: String!, bookingCode: String, email: String): ChatResponse!
  }

  type Subscription {
    seatChanged(tripId: ID!): SeatChangedEvent!
  }
`;

async function seatMap(tripId) {
  return requestJSON(`${bookingUrl}/seat-map/${tripId}`);
}

async function availableSeatCount(tripId) {
  const map = await seatMap(tripId);
  return map.seats.filter((seat) => seat.status === "AVAILABLE").length;
}

const resolvers = {
  Query: {
    health: () => "GraphQL Gateway OK",
    catalog: async () => requestJSON(`${tripUrl}/locations`),
    stops: async () => (await requestJSON(`${tripUrl}/stops`)).stops,
    routes: async () => (await requestJSON(`${tripUrl}/routes`)).routes,
    searchTrips: async (_parent, { input }) => {
      const { minSeats, ...searchInput } = input;
      const payload = await requestJSON(`${tripUrl}/trips?${qs(searchInput)}`);
      if (!minSeats) return payload;
      const trips = [];
      for (const trip of payload.trips) {
        if ((await availableSeatCount(trip.id)) >= minSeats) trips.push(trip);
      }
      return { ...payload, trips };
    },
    trip: async (_parent, { id }) => (await requestJSON(`${tripUrl}/trips/${id}`)).trip,
    booking: async (_parent, { code, email }, context) => (await requestJSON(`${bookingUrl}/bookings/${code}?${qs({ email })}`, {
      headers: bookingAccessHeaders(context)
    })).booking,
    bookingsByTrip: async (_parent, { tripId }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN", "STAFF"]);
      return (await requestJSON(`${bookingUrl}/bookings?${qs({ tripId })}`, { headers: { authorization } })).bookings;
    },
    myBookings: async (_parent, { userId }, context) => {
      const { authorization } = requireAccountOwner(context, userId);
      return (await requestJSON(`${bookingUrl}/users/${userId}/bookings`, { headers: { authorization } })).bookings;
    },
    savedPassengers: async (_parent, { userId }, context) => {
      const { authorization } = requireAccountOwner(context, userId);
      return (await requestJSON(`${bookingUrl}/users/${userId}/passengers`, { headers: { authorization } })).passengers;
    },
    adminSummary: async (_parent, _args, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN", "STAFF"]);
      return requestJSON(`${analyticsUrl}/summary`, { headers: { authorization } });
    },
    eventLogs: async (_parent, { limit = 20 }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN", "STAFF"]);
      return (await requestJSON(`${analyticsUrl}/events?${qs({ limit })}`, { headers: { authorization } })).events;
    }
  },
  Mutation: {
    holdSeats: async (_parent, args) => {
      const result = await requestJSON(`${bookingUrl}/holds`, {
        method: "POST",
        body: JSON.stringify(args)
      });
      if (result.ok) publishFallbackSeatChange({ tripId: args.tripId, seats: result.seats, message: result.message });
      return result;
    },
    createBooking: async (_parent, { input }, context) => {
      const auth = context.user ? authenticatedHeaders(context) : { user: null, authorization: "" };
      if (input.userId && (!auth.user || auth.user.id !== input.userId)) throw new Error("Booking user does not match the authenticated account.");
      return (await requestJSON(`${bookingUrl}/bookings`, {
        method: "POST",
        headers: auth.authorization ? { authorization: auth.authorization } : {},
        body: JSON.stringify({ ...input, userId: auth.user?.role === "CUSTOMER" ? auth.user.id : undefined })
      })).booking;
    },
    requestGuestBookingAccess: async (_parent, { code, email }) => requestJSON(
      `${bookingUrl}/bookings/${code}/guest-access`,
      { method: "POST", body: JSON.stringify({ email }) }
    ),
    payBooking: async (_parent, { code, success }, context) => {
      const auth = context.user ? authenticatedHeaders(context) : { authorization: "" };
      const booking = (await requestJSON(`${bookingUrl}/bookings/${code}/pay`, {
        method: "POST",
        headers: { ...bookingAccessHeaders(context), ...(auth.authorization ? { authorization: auth.authorization } : {}) },
        body: JSON.stringify({ success })
      })).booking;
      const map = await seatMap(booking.tripId);
      publishFallbackSeatChange({ tripId: booking.tripId, seats: map.seats, message: "Trạng thái ghế đã thay đổi." });
      return booking;
    },
    cancelBooking: async (_parent, { code }, context) => {
      const auth = context.user ? authenticatedHeaders(context) : { authorization: "" };
      const booking = (await requestJSON(`${bookingUrl}/bookings/${code}/cancel`, {
        method: "POST",
        headers: { ...bookingAccessHeaders(context), ...(auth.authorization ? { authorization: auth.authorization } : {}) },
        body: JSON.stringify({})
      })).booking;
      const map = await seatMap(booking.tripId);
      publishFallbackSeatChange({ tripId: booking.tripId, seats: map.seats, message: "Booking đã được hủy." });
      return booking;
    },
    checkIn: async (_parent, { codeOrTicket }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN", "STAFF"]);
      return (await requestJSON(`${bookingUrl}/checkin`, { method: "POST", headers: { authorization }, body: JSON.stringify({ codeOrTicket }) })).booking;
    },
    adminLogin: async (_parent, input) => (await requestJSON(`${bookingUrl}/auth/admin-login`, {
      method: "POST",
      body: JSON.stringify(input)
    })),
    login: async (_parent, input) => (await requestJSON(`${bookingUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify(input)
    })),
    registerCustomer: async (_parent, { input }) => (await requestJSON(`${bookingUrl}/auth/register`, {
      method: "POST",
      body: JSON.stringify(input)
    })),
    savePassenger: async (_parent, { userId, passenger }, context) => {
      const { authorization } = requireAccountOwner(context, userId);
      return (await requestJSON(`${bookingUrl}/users/${userId}/passengers`, { method: "POST", headers: { authorization }, body: JSON.stringify(passenger) })).passenger;
    },
    deleteSavedPassenger: async (_parent, { userId, passengerId }, context) => {
      const { authorization } = requireAccountOwner(context, userId);
      return (await requestJSON(`${bookingUrl}/users/${userId}/passengers/${passengerId}`, { method: "DELETE", headers: { authorization }, body: JSON.stringify({}) })).ok;
    },
    createRoute: async (_parent, { input }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/routes`, { method: "POST", headers: { authorization }, body: JSON.stringify(input) })).route;
    },
    updateRoute: async (_parent, { id, input }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/routes/${id}`, { method: "PUT", headers: { authorization }, body: JSON.stringify(input) })).route;
    },
    deleteRoute: async (_parent, { id }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/routes/${id}`, { method: "DELETE", headers: { authorization }, body: JSON.stringify({}) })).ok;
    },
    createStop: async (_parent, { input }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/stops`, { method: "POST", headers: { authorization }, body: JSON.stringify(input) })).stop;
    },
    updateStop: async (_parent, { id, input }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/stops/${id}`, { method: "PUT", headers: { authorization }, body: JSON.stringify(input) })).stop;
    },
    deleteStop: async (_parent, { id }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/stops/${id}`, { method: "DELETE", headers: { authorization }, body: JSON.stringify({}) })).ok;
    },
    createVehicle: async (_parent, { input }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/vehicles`, { method: "POST", headers: { authorization }, body: JSON.stringify(input) })).vehicle;
    },
    updateVehicle: async (_parent, { id, input }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/vehicles/${id}`, { method: "PUT", headers: { authorization }, body: JSON.stringify(input) })).vehicle;
    },
    deleteVehicle: async (_parent, { id }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/vehicles/${id}`, { method: "DELETE", headers: { authorization }, body: JSON.stringify({}) })).ok;
    },
    createTrip: async (_parent, { input }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/trips`, { method: "POST", headers: { authorization }, body: JSON.stringify(input) })).trip;
    },
    updateTrip: async (_parent, { id, input }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/trips/${id}`, { method: "PUT", headers: { authorization }, body: JSON.stringify(input) })).trip;
    },
    deleteTrip: async (_parent, { id }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/trips/${id}`, { method: "DELETE", headers: { authorization }, body: JSON.stringify({}) })).ok;
    },
    updateTripStatus: async (_parent, { id, status }, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      return (await requestJSON(`${tripUrl}/trips/${id}/status`, { method: "PATCH", headers: { authorization }, body: JSON.stringify({ status }) })).trip;
    },
    blockSeats: async (_parent, args, context) => {
      const { authorization } = authenticatedHeaders(context, ["ADMIN"]);
      const result = await requestJSON(`${bookingUrl}/admin/block-seats`, {
        method: "POST",
        headers: { authorization },
        body: JSON.stringify(args)
      });
      if (result.ok) publishFallbackSeatChange({ tripId: args.tripId, seats: result.seats, message: result.message });
      return {
        ok: result.ok,
        message: result.message,
        holdToken: "",
        expiresIn: 0,
        seats: result.seats
      };
    },
    askAssistant: async (_parent, input, context) => requestJSON(`${aiUrl}/chat`, {
      method: "POST",
      headers: bookingAccessHeaders(context),
      body: JSON.stringify(input)
    })
  },
  Subscription: {
    seatChanged: {
      subscribe: async (_parent, { tripId }) => {
        const rabbitSubscription = await subscribeRabbitEphemeral([seatChangedRoutingKey(tripId)]);
        return rabbitSubscription ?? fallbackPubSub.subscribe(`seat:${tripId}`);
      },
      resolve: (event) => event.payload ?? event
    }
  },
  EventLog: {
    payload: (event) => JSON.stringify(event.payload ?? {})
  },
  Trip: {
    seats: async (trip) => (await seatMap(trip.id)).seats,
    availableSeats: async (trip) => {
      const map = await seatMap(trip.id);
      return map.seats.filter((seat) => seat.status === "AVAILABLE").length;
    }
  },
  Booking: {
    trip: async (booking) => (await requestJSON(`${tripUrl}/trips/${booking.tripId}`)).trip
  },
  Ticket: {
    status: (ticket) => ticket.status ?? "ISSUED"
  }
};

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: "/graphql",
  context: ({ request }) => graphQLAuth(request),
  cors: {
    origin: "*",
    credentials: false,
    allowedHeaders: ["content-type", "authorization", "x-booking-access-token"]
  },
  maskedErrors: false
});

const grpcServer = await startGrpcServer({
  serviceName: "gateway",
  bindAddress: process.env.GATEWAY_GRPC_BIND || "0.0.0.0:50054",
  check: operationalHealth
});

const server = createServer((req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (req.method === "GET" && pathname === "/live") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "gateway", status: "LIVE" }));
    return;
  }
  if (req.method === "GET" && (pathname === "/health" || pathname === "/ready")) {
    void operationalHealth().then((health) => {
      res.writeHead(health.ok ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ service: "gateway", ...health }));
    }).catch((error) => {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, service: "gateway", error: error.message }));
    });
    return;
  }
  return yoga(req, res);
});
const port = Number(process.env.PORT || 4000);
server.listen(port, () => {
  console.log(`[gateway] GraphQL listening on http://localhost:${port}/graphql`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const force = setTimeout(() => {
    grpcServer.forceShutdown();
    process.exit(1);
  }, 10_000);
  force.unref();
  grpcServer.tryShutdown(() => server.close(() => process.exit(0)));
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
