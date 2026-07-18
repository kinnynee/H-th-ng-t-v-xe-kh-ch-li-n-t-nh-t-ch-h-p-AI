import express from "express";
import cors from "cors";
import grpc from "@grpc/grpc-js";
import { eventEnvelope, publishKafkaEnvelope, publishRabbitEnvelope } from "@bus-ai/shared/broker";
import { connectPostgres } from "@bus-ai/shared/postgres";
import { errorHandler, notFoundHandler } from "@bus-ai/shared/http";
import { bindGrpcServer, createGrpcClients, createServiceGrpcServer } from "@bus-ai/shared/grpc";
import { createLogger, registerProcessErrorHandlers, requestLoggingMiddleware } from "@bus-ai/shared/logger";
import { renderTicketHtml, renderTicketPdf } from "@bus-ai/shared/ticket";
import { assertAuthConfiguration, authenticate, authorize, hashPassword, isPasswordHash, issueAccessToken, verifyPassword } from "@bus-ai/shared/auth";
import { demoUsers } from "./demo-users.js";
import { createGuestAccessToken, hashGuestAccessToken, verifiesGuestAccessToken } from "./guest-access.js";
import { validateBookingInput } from "./validation.js";
import {
  assertCheckInWindow,
  assertBookingStatusTransition,
  cancelTickets,
  cancellationQuote,
  checkInTickets,
  createBookingLock,
  seatReleaseCommand,
  transitionBooking
} from "./booking-domain.js";
import {
  loadBookingRepository,
  claimOutboxEvents,
  createBookingWithOutbox,
  findBooking,
  markOutboxPublished,
  releaseOutboxEvent,
  saveUser,
  transitionBookingWithOutbox
} from "./repository.js";
import { createHealthCheck } from "./health.js";
import { normalizePaymentIdempotencyKey, paymentRequestAction } from "./payment.js";
import { createPassengerTickets, normalizeBookingPassengers } from "./passenger-mapping.js";
import { guestBookingEmailMatches, resolveCheckoutCustomer } from "./checkout-policy.js";

const grpcClients = createGrpcClients({
  seatInventory: {
    protoFile: "seat_inventory.proto",
    servicePath: "bus.seat.v1.SeatInventoryService",
    target: process.env.SEAT_GRPC_URL || "localhost:50051"
  }
});
const seatClient = grpcClients.seatInventory;

const logger = createLogger("booking-service");
registerProcessErrorHandlers(logger);
const app = express();
app.use(requestLoggingMiddleware(logger));
app.use(cors());
app.use(express.json());
assertAuthConfiguration();

let bookings = new Map();
let users = new Map((process.env.NODE_ENV === "production" ? [] : demoUsers).map((user) => [user.id, structuredClone(user)]));
const withBookingLock = createBookingLock();
const database = await connectPostgres(process.env.DATABASE_URL, "booking-service");
if (database) {
  const stored = await loadBookingRepository(database);
  bookings = stored.bookings;
  users = stored.users;
}
const tripServiceUrl = process.env.TRIP_SERVICE_URL || "http://localhost:4010";
const publicBookingUrl = process.env.PUBLIC_BOOKING_URL || "http://localhost:4020";
const pendingPaymentTtlSeconds = Math.max(60, Number(process.env.PENDING_PAYMENT_TTL_SECONDS || 900));
const guestAccessTtlSeconds = Math.max(60, Number(process.env.GUEST_ACCESS_TTL_SECONDS || 1800));

function grpcCall(method, payload) {
  return new Promise((resolve, reject) => {
    const metadata = new grpc.Metadata();
    metadata.set("authorization", `Bearer ${issueAccessToken({ id: "booking-service", role: "SERVICE" })}`);
    seatClient[method](payload, metadata, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

async function getTrip(tripId) {
  const response = await fetch(`${tripServiceUrl}/trips/${tripId}`);
  if (!response.ok) throw new Error("Trip not found");
  const data = await response.json();
  return data.trip;
}

function bookingCode() {
  const stamp = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  return `BK${stamp}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function publicBooking(booking) {
  if (!booking) return null;
  const {
    holdToken: _holdToken,
    guestAccessTokenHash: _guestAccessTokenHash,
    paymentIdempotencyKey: _paymentIdempotencyKey,
    _expiryTimerScheduled: _expiryTimerScheduled,
    ...safeBooking
  } = booking;
  return {
    ...safeBooking,
    ticketHtmlUrl: `${publicBookingUrl}/tickets/${booking.code}.html`,
    ticketPdfUrl: `${publicBookingUrl}/tickets/${booking.code}.pdf`,
    passengers: booking.passengers.map((item) => ({ ...item }))
  };
}

function kafkaOutboxEvent(topic, eventType, payload) {
  return {
    destination: "kafka",
    topic,
    envelope: eventEnvelope(eventType, payload, payload.code)
  };
}

function rabbitOutboxEvent(routingKey, eventType, payload) {
  return {
    destination: "rabbit",
    topic: "bus.events",
    routingKey,
    envelope: eventEnvelope(eventType, payload, payload.code)
  };
}

function seatOutboxEvent(method, payload, bookingCode) {
  return {
    destination: "seat",
    topic: method,
    envelope: eventEnvelope("SeatReleaseRequested", payload, bookingCode)
  };
}

async function publishOutboxEvent(event) {
  if (event.destination === "seat") {
    const result = await grpcCall(event.topic, event.envelope.payload);
    return { ...event.envelope, published: Boolean(result?.ok) };
  }
  if (event.destination === "rabbit") return publishRabbitEnvelope(event.envelope, event.routingKey);
  return publishKafkaEnvelope(event.topic, event.envelope);
}

let flushingOutbox = false;
async function flushOutbox() {
  if (!database || flushingOutbox) return;
  flushingOutbox = true;
  try {
    const events = await claimOutboxEvents(database);
    for (const event of events) {
      try {
        const result = await publishOutboxEvent(event);
        if (!result.published) throw new Error("Broker is unavailable");
        await markOutboxPublished(database, event.eventId, event.lockToken);
      } catch (error) {
        await releaseOutboxEvent(database, event.eventId, event.lockToken, error);
        console.warn(`[booking-service] outbox event ${event.eventId} was deferred: ${error.message}`);
      }
    }
  } finally {
    flushingOutbox = false;
  }
}

function requestOutboxFlush() {
  if (database) void flushOutbox().catch((error) => console.warn(`[booking-service] outbox flush failed: ${error.message}`));
}

async function deliverEvents(events) {
  if (database) {
    requestOutboxFlush();
    return;
  }
  for (const event of events) await publishOutboxEvent(event);
}

async function commitBookingTransition(booking, expectedStatuses, events = []) {
  for (const expectedStatus of expectedStatuses) {
    assertBookingStatusTransition(expectedStatus, booking.status, { allowSame: true });
  }
  const result = await transitionBookingWithOutbox(database, booking, expectedStatuses, events);
  if (!result.updated) return null;
  bookings.set(booking.code, result.booking);
  await deliverEvents(events);
  return result.booking;
}

async function currentBooking(code) {
  const durable = await findBooking(database, code);
  if (durable) bookings.set(code, durable);
  return durable ?? bookings.get(code) ?? null;
}

function publicUser(user) {
  if (!user) return null;
  const { password: _password, ...safeUser } = user;
  return { ...safeUser, savedPassengers: user.savedPassengers.map((item) => ({ ...item })) };
}

function findUserByEmail(email) {
  return [...users.values()].find((user) => user.email.toLowerCase() === String(email ?? "").toLowerCase());
}

function requestUser(req) {
  try {
    return authenticate(req.headers);
  } catch {
    return null;
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    try {
      req.user = authorize(authenticate(req.headers), roles);
      next();
    } catch (error) {
      res.status(error.status ?? 401).json({ error: error.message });
    }
  };
}

function requireCurrentUser(req, res, next) {
  try {
    const user = authenticate(req.headers);
    if (user.id !== req.params.id && user.role !== "ADMIN") {
      return res.status(403).json({ error: "You do not have permission for this user." });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(error.status ?? 401).json({ error: error.message });
  }
}

function canAccessBooking(req, booking) {
  const user = requestUser(req);
  if (user && (["ADMIN", "STAFF"].includes(user.role) || (booking.userId && booking.userId === user.id))) return true;
  return verifiesGuestAccessToken(
    req.get("x-booking-access-token"),
    booking.guestAccessTokenHash,
    booking.guestAccessExpiresAt
  );
}

function assertTripBookable(trip) {
  if (trip.status !== "ACTIVE") throw new Error(`Trip is ${trip.status} and is not open for booking`);
  if (Date.parse(trip.departureTime) <= Date.now()) throw new Error("Trip has already departed");
}

async function ensureTripInventory(trip) {
  return grpcCall("ensureTripInventory", {
    tripId: trip.id,
    seatCount: trip.seatCount,
    seats: trip.seatLayout ?? []
  });
}

function rememberPassengers(userId, passengers) {
  const user = users.get(userId);
  if (!user) return;
  for (const passenger of passengers) {
    const exists = user.savedPassengers.some(
      (item) => item.fullName === passenger.fullName && item.phone === passenger.phone && item.email === passenger.email
    );
    if (!exists) {
      user.savedPassengers.push({
        id: `passenger-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fullName: passenger.fullName,
        phone: passenger.phone,
        email: passenger.email,
        documentId: passenger.documentId ?? ""
      });
    }
  }
}

function schedulePendingExpiry(booking) {
  if (booking._expiryTimerScheduled || booking.status !== "PENDING_PAYMENT") return;
  booking._expiryTimerScheduled = true;
  const expiresAt = Date.parse(booking.paymentExpiresAt)
    || new Date(booking.createdAt).getTime() + pendingPaymentTtlSeconds * 1000;
  const delay = Math.max(0, expiresAt - Date.now());
  setTimeout(async () => {
    const current = await currentBooking(booking.code);
    if (!current || current.status !== "PENDING_PAYMENT") return;
    const expiredAt = new Date().toISOString();
    const expired = await commitBookingTransition(
      { ...current, status: "EXPIRED", updatedAt: expiredAt },
      ["PENDING_PAYMENT"],
      [
        kafkaOutboxEvent("booking-events", "BookingExpired", publicBooking({ ...current, status: "EXPIRED", updatedAt: expiredAt })),
        seatOutboxEvent("releaseSeats", seatReleaseCommand(current), current.code)
      ]
    );
    if (!expired) return;
  }, delay);
}

for (const booking of bookings.values()) schedulePendingExpiry(booking);
setInterval(() => void flushOutbox().catch((error) => console.warn(`[booking-service] outbox flush failed: ${error.message}`)), 2_000).unref();
requestOutboxFlush();

const operationalHealth = createHealthCheck({
  database,
  bookings,
  users,
  seatGrpcTarget: process.env.SEAT_GRPC_URL || "localhost:50051"
});

app.get("/live", (_req, res) => {
  res.json({ ok: true, service: "booking-service", status: "LIVE" });
});
app.get("/ready", async (_req, res) => {
  const health = await operationalHealth();
  res.status(health.ok ? 200 : 503).json({ service: "booking-service", ...health });
});
app.get("/health", async (_req, res) => {
  const health = await operationalHealth();
  res.status(health.ok ? 200 : 503).json({ service: "booking-service", ...health });
});

app.get("/tickets/:code.html", async (req, res) => {
  const booking = bookings.get(req.params.code);
  if (!booking) return res.status(404).send("Booking not found");
  if (!canAccessBooking(req, booking)) return res.status(403).send("Ticket access is denied");
  if (booking.status === "CANCELLED") return res.status(410).send("Ticket has been cancelled");
  res.type("html").send(await renderTicketHtml(booking));
});

app.get("/tickets/:code.pdf", async (req, res) => {
  const booking = bookings.get(req.params.code);
  if (!booking) return res.status(404).send("Booking not found");
  if (!canAccessBooking(req, booking)) return res.status(403).send("Ticket access is denied");
  if (booking.status === "CANCELLED") return res.status(410).send("Ticket has been cancelled");
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `inline; filename="${booking.code}.pdf"`);
  res.send(await renderTicketPdf(booking));
});

app.get("/seat-map/:tripId", async (req, res) => {
  try {
    const trip = await getTrip(req.params.tripId);
    const seatMap = await ensureTripInventory(trip);
    res.json(seatMap);
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.post("/holds", async (req, res) => {
  try {
    const trip = await getTrip(req.body.tripId);
    assertTripBookable(trip);
    await ensureTripInventory(trip);
    const result = await grpcCall("holdSeats", {
      tripId: req.body.tripId,
      seatIds: req.body.seatIds ?? [],
      customerEmail: req.body.customerEmail ?? "",
      idempotencyKey: req.body.idempotencyKey ?? "",
      ttlSeconds: req.body.ttlSeconds ?? 300
    });
    res.status(result.ok ? 200 : 409).json(result);
  } catch (error) {
    res.status(503).json({ ok: false, message: error.message });
  }
});

app.post("/bookings", async (req, res) => {
  try {
    const user = requestUser(req);
    const checkoutCustomer = resolveCheckoutCustomer({ requestedUserId: req.body.userId, user });
    if (!checkoutCustomer.ok) return res.status(403).json({ error: checkoutCustomer.message });
    const passengers = normalizeBookingPassengers(req.body.passengers);
    const validationError = validateBookingInput({ ...req.body, passengers });
    if (validationError) return res.status(400).json({ error: validationError });
    const trip = await getTrip(req.body.tripId);
    assertTripBookable(trip);
    const seatIds = passengers.map((passenger) => String(passenger.seatId).trim().toUpperCase());
    await withBookingLock(`hold:${req.body.holdToken}`, async () => {
      await ensureTripInventory(trip);
      const hold = await grpcCall("verifyHold", {
        tripId: trip.id,
        seatIds,
        holdToken: req.body.holdToken,
        customerEmail: req.body.customerEmail
      });
      if (!hold.ok || hold.expiresIn <= 0) return res.status(409).json({ error: hold.message });
      const duplicate = [...bookings.values()].find((item) =>
        item.tripId === trip.id && item.holdToken === req.body.holdToken && item.status === "PENDING_PAYMENT"
      );
      if (duplicate) return res.status(409).json({ error: `Hold already belongs to booking ${duplicate.code}` });

      const extendedHold = await grpcCall("extendHold", {
        tripId: trip.id,
        seatIds,
        holdToken: req.body.holdToken,
        customerEmail: req.body.customerEmail,
        ttlSeconds: pendingPaymentTtlSeconds
      });
      if (!extendedHold.ok) return res.status(409).json({ error: extendedHold.message });

      const code = bookingCode();
      const guestAccessToken = createGuestAccessToken();
      const now = new Date();
      const booking = {
        code,
        tripId: trip.id,
        routeName: `${trip.from} - ${trip.to}`,
        departureTime: trip.departureTime,
        pickup: trip.pickup,
        dropoff: trip.dropoff,
        vehiclePlate: trip.vehiclePlate,
        cancellationPolicy: trip.cancellationPolicy,
        holdToken: req.body.holdToken,
        guestAccessTokenHash: hashGuestAccessToken(guestAccessToken),
        guestAccessExpiresAt: new Date(now.getTime() + guestAccessTtlSeconds * 1000).toISOString(),
        customerEmail: req.body.customerEmail,
        customerPhone: req.body.customerPhone,
        userId: checkoutCustomer.userId,
        seatIds,
        passengers,
        totalAmount: trip.price * seatIds.length,
        refundAmount: 0,
        cancellationFee: 0,
        status: "PENDING_PAYMENT",
        tickets: [],
        createdAt: now.toISOString(),
        paymentExpiresAt: new Date(now.getTime() + pendingPaymentTtlSeconds * 1000).toISOString(),
        updatedAt: now.toISOString()
      };
      const createdEvents = [kafkaOutboxEvent("booking-events", "BookingCreated", publicBooking(booking))];
      const created = await createBookingWithOutbox(database, booking, createdEvents);
      const persistedBooking = created.booking;
      bookings.set(code, persistedBooking);
      if (booking.userId) {
        rememberPassengers(booking.userId, passengers);
        await saveUser(database, users.get(booking.userId));
      }
      schedulePendingExpiry(persistedBooking);
      await deliverEvents(createdEvents);
      // The raw capability is returned only in this checkout response. It is
      // never persisted or included in events, logs, or subsequent lookups.
      res.status(201).json({ booking: { ...publicBooking(persistedBooking), guestAccessToken } });
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/bookings", requireRoles("ADMIN", "STAFF"), (req, res) => {
  const items = [...bookings.values()].filter((booking) => {
    if (req.query.tripId && booking.tripId !== req.query.tripId) return false;
    if (req.query.email && booking.customerEmail !== req.query.email) return false;
    if (req.query.userId && booking.userId !== req.query.userId) return false;
    return true;
  });
  res.json({ bookings: items.map(publicBooking) });
});

app.get("/bookings/:code", (req, res) => {
  const booking = bookings.get(req.params.code);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!canAccessBooking(req, booking)) return res.status(403).json({ error: "Booking access is denied" });
  res.json({ booking: publicBooking(booking) });
});

app.post("/bookings/:code/guest-access", async (req, res) => {
  const booking = await currentBooking(req.params.code);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!guestBookingEmailMatches(booking, req.body.email)) {
    return res.status(403).json({ error: "Booking code or email is incorrect" });
  }
  const guestAccessToken = createGuestAccessToken();
  const candidate = {
    ...booking,
    guestAccessTokenHash: hashGuestAccessToken(guestAccessToken),
    guestAccessExpiresAt: new Date(Date.now() + guestAccessTtlSeconds * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  };
  const renewed = await commitBookingTransition(candidate, [booking.status]);
  if (!renewed) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
  res.json({ guestAccessToken, expiresAt: renewed.guestAccessExpiresAt });
});

function readIdempotencyKey(req, fallback = "") {
  return normalizePaymentIdempotencyKey(req.get?.("idempotency-key") || req.body?.idempotencyKey || fallback);
}

async function issuePaidBooking(paidBooking) {
  const issuedAt = paidBooking.paidAt || new Date().toISOString();
  const issuedCandidate = {
    ...paidBooking,
    status: "TICKET_ISSUED",
    updatedAt: issuedAt,
    tickets: createPassengerTickets(paidBooking, issuedAt)
  };
  const eventPayload = publicBooking(issuedCandidate);
  return commitBookingTransition(issuedCandidate, ["PAID"], [
    rabbitOutboxEvent("booking.paid", "booking.paid", eventPayload),
    kafkaOutboxEvent("booking-events", "TicketIssued", eventPayload)
  ]);
}

async function handlePayment(req, res, {
  trusted = false,
  code = req.params.code,
  success = req.body.success,
  fallbackKey = "",
  forcedKey = ""
} = {}) {
  try {
    const idempotencyKey = forcedKey
      ? normalizePaymentIdempotencyKey(forcedKey)
      : readIdempotencyKey(req, fallbackKey);
    if (!idempotencyKey) return res.status(400).json({ error: "A valid Idempotency-Key is required" });
    await withBookingLock(code, async () => {
      const booking = await currentBooking(code);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (!trusted && !canAccessBooking(req, booking)) return res.status(403).json({ error: "Booking access is denied" });
      const paymentAction = paymentRequestAction(booking, idempotencyKey);
      if (paymentAction === "ISSUE_TICKETS") {
        const issued = await issuePaidBooking(booking);
        if (!issued) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
        res.set("idempotency-replayed", "true");
        return res.json({ booking: publicBooking(issued), idempotent: true });
      }
      if (paymentAction === "REPLAY") {
        res.set("idempotency-replayed", "true");
        return res.json({ booking: publicBooking(booking), idempotent: true });
      }
      if (paymentAction === "CONFLICT") {
        return res.status(409).json({ error: `Booking is ${booking.status} or uses another idempotency key` });
      }
      if (paymentAction === "START" && Date.parse(booking.paymentExpiresAt) <= Date.now()) {
        const expiredAt = new Date().toISOString();
        const expired = await commitBookingTransition(
          { ...booking, status: "EXPIRED", updatedAt: expiredAt },
          ["PENDING_PAYMENT"],
          [
            kafkaOutboxEvent("booking-events", "BookingExpired", publicBooking({ ...booking, status: "EXPIRED", updatedAt: expiredAt })),
            seatOutboxEvent("releaseSeats", seatReleaseCommand(booking), booking.code)
          ]
        );
        if (!expired) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
        return res.status(409).json({ error: "Booking payment window has expired" });
      }

      let processing = booking;
      if (paymentAction === "START") {
        processing = await commitBookingTransition(
          { ...booking, status: "PAYMENT_PROCESSING", paymentIdempotencyKey: idempotencyKey, updatedAt: new Date().toISOString() },
          ["PENDING_PAYMENT"]
        );
        if (!processing) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
      }

      if (!success) {
        const failedAt = new Date().toISOString();
        const failed = await commitBookingTransition(
          { ...processing, status: "PAYMENT_FAILED", updatedAt: failedAt },
          ["PAYMENT_PROCESSING"],
          [
            kafkaOutboxEvent("payment-events", "PaymentFailed", publicBooking({ ...processing, status: "PAYMENT_FAILED", updatedAt: failedAt })),
            seatOutboxEvent("releaseSeats", seatReleaseCommand(processing), processing.code)
          ]
        );
        if (!failed) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
        return res.json({ booking: publicBooking(failed) });
      }

      const confirm = await grpcCall("confirmSeats", {
        tripId: processing.tripId, seatIds: processing.seatIds, holdToken: processing.holdToken, bookingCode: processing.code
      });
      if (!confirm.ok) {
        const reset = await commitBookingTransition(
          { ...processing, status: "PENDING_PAYMENT", updatedAt: new Date().toISOString() },
          ["PAYMENT_PROCESSING"]
        );
        if (reset) schedulePendingExpiry(reset);
        return res.status(409).json({ error: confirm.message });
      }

      const paidAt = new Date().toISOString();
      const paidCandidate = {
        ...processing,
        status: "PAID",
        paidAt,
        updatedAt: paidAt
      };
      const paid = await commitBookingTransition(paidCandidate, ["PAYMENT_PROCESSING"], [
        kafkaOutboxEvent("payment-events", "PaymentSucceeded", publicBooking(paidCandidate)),
        kafkaOutboxEvent("booking-events", "BookingPaid", publicBooking(paidCandidate))
      ]);
      if (!paid) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
      const issued = await issuePaidBooking(paid);
      if (!issued) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
      return res.json({ booking: publicBooking(issued) });
    });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
}

app.post("/bookings/:code/pay", (req, res) => handlePayment(req, res));

app.post("/payments/callback", (req, res) => {
  const configuredSecret = String(process.env.PAYMENT_CALLBACK_SECRET || "");
  if (!configuredSecret || req.get("x-payment-callback-secret") !== configuredSecret) {
    return res.status(401).json({ error: "Invalid payment callback credentials" });
  }
  const eventId = String(req.body.eventId || "").trim();
  const code = String(req.body.bookingCode || "").trim();
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(eventId) || !code) {
    return res.status(400).json({ error: "eventId and bookingCode are required" });
  }
  return handlePayment(req, res, {
    trusted: true,
    code,
    success: req.body.success === true,
    forcedKey: `callback:${eventId}`
  });
});

app.post("/holds/verify", async (req, res) => {
  try {
    const result = await grpcCall("verifyHold", {
      tripId: req.body.tripId,
      seatIds: req.body.seatIds ?? [],
      holdToken: req.body.holdToken,
      customerEmail: req.body.customerEmail ?? ""
    });
    res.status(result.ok ? 200 : 409).json(result);
  } catch (error) {
    res.status(503).json({ ok: false, message: error.message, expiresIn: 0 });
  }
});

app.post("/bookings/:code/cancel", async (req, res) => {
  try {
    await withBookingLock(req.params.code, async () => {
      const booking = await currentBooking(req.params.code);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (!canAccessBooking(req, booking)) return res.status(403).json({ error: "Booking access is denied" });
      if (!["PENDING_PAYMENT", "PAID", "TICKET_ISSUED"].includes(booking.status)) {
        return res.status(409).json({ error: `Cannot cancel booking in ${booking.status}` });
      }
      if (booking.tickets.some((ticket) => ticket.status === "CHECKED_IN")) {
        return res.status(409).json({ error: "Cannot cancel a booking with checked-in tickets" });
      }
      const cancelledAt = new Date();
      const candidate = structuredClone(booking);
      const quote = cancellationQuote(candidate);
      candidate.refundAmount = quote.refundAmount;
      candidate.cancellationFee = quote.cancellationFee;
      cancelTickets(candidate, cancelledAt);
      transitionBooking(candidate, "CANCELLED", cancelledAt);
      candidate.cancelledAt = candidate.updatedAt;
      const cancelled = await commitBookingTransition(candidate, [booking.status], [
        kafkaOutboxEvent("booking-events", "BookingCancelled", publicBooking(candidate)),
        seatOutboxEvent("releaseSeats", seatReleaseCommand(booking), booking.code)
      ]);
      if (!cancelled) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
      return res.json({ booking: publicBooking(cancelled) });
    });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.post("/checkin", requireRoles("ADMIN", "STAFF"), async (req, res) => {
  const codeOrTicket = req.body.codeOrTicket ?? "";
  const found = [...bookings.values()].find(
    (item) => item.code === codeOrTicket || item.tickets.some((ticket) => ticket.id === codeOrTicket || ticket.qrPayload === codeOrTicket)
  );
  if (!found) return res.status(404).json({ error: "Booking or ticket not found" });
  try {
    await withBookingLock(found.code, async () => {
      const booking = await currentBooking(found.code);
      if (!["TICKET_ISSUED", "PARTIALLY_CHECKED_IN"].includes(booking.status)) {
        return res.status(409).json({ error: `Cannot check in booking in ${booking.status}` });
      }
      assertCheckInWindow(booking.departureTime);
      const candidate = structuredClone(booking);
      const checkedTicketIds = checkInTickets(candidate, codeOrTicket);
      const checkedIn = await commitBookingTransition(candidate, [booking.status], [
        kafkaOutboxEvent("booking-events", "PassengerCheckedIn", {
          ...publicBooking(candidate), checkedTicketIds
        })
      ]);
      if (!checkedIn) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
      return res.json({ booking: publicBooking(checkedIn), checkedTicketIds });
    });
  } catch (error) {
    return res.status(409).json({ error: error.message });
  }
});

app.post("/bookings/:code/complete", requireRoles("ADMIN", "STAFF"), async (req, res) => {
  try {
    await withBookingLock(req.params.code, async () => {
      const booking = await currentBooking(req.params.code);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.status !== "CHECKED_IN") {
        return res.status(409).json({ error: `Cannot complete booking in ${booking.status}` });
      }
      const trip = await getTrip(booking.tripId);
      if (trip.status !== "COMPLETED") {
        return res.status(409).json({ error: "The trip must be completed before completing its bookings" });
      }
      const completedAt = new Date();
      const candidate = structuredClone(booking);
      transitionBooking(candidate, "COMPLETED", completedAt);
      const completed = await commitBookingTransition(candidate, ["CHECKED_IN"], [
        kafkaOutboxEvent("booking-events", "BookingCompleted", publicBooking(candidate))
      ]);
      if (!completed) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
      return res.json({ booking: publicBooking(completed) });
    });
  } catch (error) {
    return res.status(409).json({ error: error.message });
  }
});

app.post("/admin/block-seats", requireRoles("ADMIN"), async (req, res) => {
  try {
    const result = await grpcCall("blockSeats", {
      tripId: req.body.tripId,
      seatIds: req.body.seatIds ?? [],
      blocked: Boolean(req.body.blocked)
    });
    res.json(result);
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: "Name, email and password are required" });
  if (String(password).length < 8) return res.status(400).json({ error: "Password must contain at least 8 characters" });
  if (findUserByEmail(email)) return res.status(409).json({ error: "Email already exists" });
  const id = `customer-${Date.now()}`;
  const user = { id, email, password: await hashPassword(password), role: "CUSTOMER", name, savedPassengers: [] };
  users.set(id, user);
  await saveUser(database, user);
  res.status(201).json({ user: publicUser(user), accessToken: issueAccessToken(user) });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.password))) return res.status(401).json({ error: "Invalid credentials" });
  if (!isPasswordHash(user.password)) {
    user.password = await hashPassword(password);
    await saveUser(database, user);
  }
  return res.json({ user: publicUser(user), accessToken: issueAccessToken(user) });
});

app.post("/auth/admin-login", async (req, res) => {
  const { email, password } = req.body;
  const user = findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.password))) return res.status(401).json({ error: "Invalid credentials" });
  if (!["ADMIN", "STAFF"].includes(user.role)) return res.status(403).json({ error: "Admin or staff role is required" });
  if (!isPasswordHash(user.password)) {
    user.password = await hashPassword(password);
    await saveUser(database, user);
  }
  res.json({ user: publicUser(user), accessToken: issueAccessToken(user) });
});

app.get("/users/:id/bookings", requireCurrentUser, (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const userBookings = [...bookings.values()].filter((booking) => booking.userId === user.id);
  res.json({ bookings: userBookings.map(publicBooking) });
});

app.get("/users/:id/passengers", requireCurrentUser, (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ passengers: user.savedPassengers });
});

app.post("/users/:id/passengers", requireCurrentUser, async (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const passenger = {
    id: req.body.id || `passenger-${Date.now()}`,
    fullName: req.body.fullName,
    phone: req.body.phone,
    email: req.body.email || user.email,
    documentId: req.body.documentId ?? ""
  };
  user.savedPassengers.push(passenger);
  await saveUser(database, user);
  res.status(201).json({ passenger });
});

app.delete("/users/:id/passengers/:passengerId", requireCurrentUser, async (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.savedPassengers = user.savedPassengers.filter((passenger) => passenger.id !== req.params.passengerId);
  await saveUser(database, user);
  res.json({ ok: true });
});

const grpcServer = createServiceGrpcServer({
  serviceName: "booking-service",
  health: operationalHealth
});
app.use(notFoundHandler);
app.use(errorHandler);
await bindGrpcServer(grpcServer, process.env.BOOKING_GRPC_BIND || "0.0.0.0:50053", "booking-service");

const port = Number(process.env.PORT || 4020);
const httpServer = app.listen(port, () => {
  logger.info("service_started", { port });
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  grpcClients.closeAll();
  const force = setTimeout(() => {
    grpcServer.forceShutdown();
    process.exit(1);
  }, 10_000);
  force.unref();
  grpcServer.tryShutdown(() => httpServer.close(() => process.exit(0)));
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
