import { createServer } from "node:http";
import { createSchema, createYoga } from "graphql-yoga";

const tripUrl = process.env.TRIP_SERVICE_URL || "http://localhost:4010";
const bookingUrl = process.env.BOOKING_SERVICE_URL || "http://localhost:4020";
const aiUrl = process.env.AI_SERVICE_URL || "http://localhost:4100";
const analyticsUrl = process.env.ANALYTICS_SERVICE_URL || "http://localhost:4050";

class PubSub {
  constructor() {
    this.listeners = new Map();
  }

  publish(topic, payload) {
    for (const listener of this.listeners.get(topic) ?? []) listener(payload);
  }

  subscribe(topic) {
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
        this.listeners.get(topic)?.delete(push);
        return Promise.resolve({ value: undefined, done: true });
      }
    };
  }
}

const pubSub = new PubSub();

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
    customerEmail: String!
    customerPhone: String
    seatIds: [String!]!
    passengers: [Passenger!]!
    totalAmount: Int!
    status: String!
    tickets: [Ticket!]!
    ticketHtmlUrl: String!
    ticketPdfUrl: String!
    createdAt: String!
    updatedAt: String!
    paidAt: String
    checkedInAt: String
    cancelledAt: String
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
    routes: [Route!]!
    searchTrips(input: SearchTripsInput!): SearchTripsPayload!
    trip(id: ID!): Trip
    booking(code: ID!, email: String): Booking
    bookingsByTrip(tripId: ID!): [Booking!]!
    myBookings(userId: ID!): [Booking!]!
    savedPassengers(userId: ID!): [SavedPassenger!]!
    adminSummary: AnalyticsSummary!
  }

  type Mutation {
    holdSeats(tripId: ID!, seatIds: [String!]!, customerEmail: String, ttlSeconds: Int): HoldResult!
    createBooking(input: CreateBookingInput!): Booking!
    payBooking(code: ID!, success: Boolean!): Booking!
    cancelBooking(code: ID!, email: String!): Booking!
    checkIn(codeOrTicket: String!): Booking!
    adminLogin(email: String!, password: String!): User!
    login(email: String!, password: String!): User!
    registerCustomer(input: RegisterCustomerInput!): User!
    savePassenger(userId: ID!, passenger: SavedPassengerInput!): SavedPassenger!
    deleteSavedPassenger(userId: ID!, passengerId: ID!): Boolean!
    createRoute(input: RouteInput!): Route!
    updateRoute(id: ID!, input: RouteInput!): Route!
    deleteRoute(id: ID!): Boolean!
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
    booking: async (_parent, { code, email }) => (await requestJSON(`${bookingUrl}/bookings/${code}?${qs({ email })}`)).booking,
    bookingsByTrip: async (_parent, { tripId }) => (await requestJSON(`${bookingUrl}/bookings?${qs({ tripId })}`)).bookings,
    myBookings: async (_parent, { userId }) => (await requestJSON(`${bookingUrl}/users/${userId}/bookings`)).bookings,
    savedPassengers: async (_parent, { userId }) => (await requestJSON(`${bookingUrl}/users/${userId}/passengers`)).passengers,
    adminSummary: async () => requestJSON(`${analyticsUrl}/summary`)
  },
  Mutation: {
    holdSeats: async (_parent, args) => {
      const result = await requestJSON(`${bookingUrl}/holds`, {
        method: "POST",
        body: JSON.stringify(args)
      });
      pubSub.publish(`seat:${args.tripId}`, { tripId: args.tripId, seats: result.seats, message: result.message });
      return result;
    },
    createBooking: async (_parent, { input }) => (await requestJSON(`${bookingUrl}/bookings`, {
      method: "POST",
      body: JSON.stringify(input)
    })).booking,
    payBooking: async (_parent, { code, success }) => {
      const booking = (await requestJSON(`${bookingUrl}/bookings/${code}/pay`, {
        method: "POST",
        body: JSON.stringify({ success })
      })).booking;
      const map = await seatMap(booking.tripId);
      pubSub.publish(`seat:${booking.tripId}`, { tripId: booking.tripId, seats: map.seats, message: "Trạng thái ghế đã thay đổi." });
      return booking;
    },
    cancelBooking: async (_parent, { code, email }) => {
      const booking = (await requestJSON(`${bookingUrl}/bookings/${code}/cancel`, {
        method: "POST",
        body: JSON.stringify({ email })
      })).booking;
      const map = await seatMap(booking.tripId);
      pubSub.publish(`seat:${booking.tripId}`, { tripId: booking.tripId, seats: map.seats, message: "Booking đã được hủy." });
      return booking;
    },
    checkIn: async (_parent, { codeOrTicket }) => (await requestJSON(`${bookingUrl}/checkin`, {
      method: "POST",
      body: JSON.stringify({ codeOrTicket })
    })).booking,
    adminLogin: async (_parent, input) => (await requestJSON(`${bookingUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify(input)
    })).user,
    login: async (_parent, input) => (await requestJSON(`${bookingUrl}/auth/login`, {
      method: "POST",
      body: JSON.stringify(input)
    })).user,
    registerCustomer: async (_parent, { input }) => (await requestJSON(`${bookingUrl}/auth/register`, {
      method: "POST",
      body: JSON.stringify(input)
    })).user,
    savePassenger: async (_parent, { userId, passenger }) => (await requestJSON(`${bookingUrl}/users/${userId}/passengers`, {
      method: "POST",
      body: JSON.stringify(passenger)
    })).passenger,
    deleteSavedPassenger: async (_parent, { userId, passengerId }) => (await requestJSON(`${bookingUrl}/users/${userId}/passengers/${passengerId}`, {
      method: "DELETE",
      body: JSON.stringify({})
    })).ok,
    createRoute: async (_parent, { input }) => (await requestJSON(`${tripUrl}/routes`, {
      method: "POST",
      body: JSON.stringify(input)
    })).route,
    updateRoute: async (_parent, { id, input }) => (await requestJSON(`${tripUrl}/routes/${id}`, {
      method: "PUT",
      body: JSON.stringify(input)
    })).route,
    deleteRoute: async (_parent, { id }) => (await requestJSON(`${tripUrl}/routes/${id}`, {
      method: "DELETE",
      body: JSON.stringify({})
    })).ok,
    createVehicle: async (_parent, { input }) => (await requestJSON(`${tripUrl}/vehicles`, {
      method: "POST",
      body: JSON.stringify(input)
    })).vehicle,
    updateVehicle: async (_parent, { id, input }) => (await requestJSON(`${tripUrl}/vehicles/${id}`, {
      method: "PUT",
      body: JSON.stringify(input)
    })).vehicle,
    deleteVehicle: async (_parent, { id }) => (await requestJSON(`${tripUrl}/vehicles/${id}`, {
      method: "DELETE",
      body: JSON.stringify({})
    })).ok,
    createTrip: async (_parent, { input }) => (await requestJSON(`${tripUrl}/trips`, {
      method: "POST",
      body: JSON.stringify(input)
    })).trip,
    updateTrip: async (_parent, { id, input }) => (await requestJSON(`${tripUrl}/trips/${id}`, {
      method: "PUT",
      body: JSON.stringify(input)
    })).trip,
    deleteTrip: async (_parent, { id }) => (await requestJSON(`${tripUrl}/trips/${id}`, {
      method: "DELETE",
      body: JSON.stringify({})
    })).ok,
    updateTripStatus: async (_parent, { id, status }) => (await requestJSON(`${tripUrl}/trips/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    })).trip,
    blockSeats: async (_parent, args) => {
      const result = await requestJSON(`${bookingUrl}/admin/block-seats`, {
        method: "POST",
        body: JSON.stringify(args)
      });
      pubSub.publish(`seat:${args.tripId}`, { tripId: args.tripId, seats: result.seats, message: result.message });
      return {
        ok: result.ok,
        message: result.message,
        holdToken: "",
        expiresIn: 0,
        seats: result.seats
      };
    },
    askAssistant: async (_parent, input) => requestJSON(`${aiUrl}/chat`, {
      method: "POST",
      body: JSON.stringify(input)
    })
  },
  Subscription: {
    seatChanged: {
      subscribe: (_parent, { tripId }) => pubSub.subscribe(`seat:${tripId}`),
      resolve: (event) => event
    }
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
  }
};

const yoga = createYoga({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: "/graphql",
  cors: { origin: "*", credentials: false },
  maskedErrors: false
});

const server = createServer(yoga);
const port = Number(process.env.PORT || 4000);
server.listen(port, () => {
  console.log(`[gateway] GraphQL listening on http://localhost:${port}/graphql`);
});
