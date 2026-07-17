import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { eventEnvelope, publishKafkaEnvelope, publishRabbitEnvelope } from "@bus-ai/shared/broker";
import { connectPostgres } from "@bus-ai/shared/postgres";
import { errorHandler, notFoundHandler } from "@bus-ai/shared/http";
import { bindGrpcServer, createServiceGrpcServer } from "@bus-ai/shared/grpc";
import { createLogger, registerProcessErrorHandlers, requestLoggingMiddleware } from "@bus-ai/shared/logger";
import { assertAuthConfiguration, authenticate, authorize, hashPassword, isPasswordHash, issueAccessToken, verifyPassword } from "@bus-ai/shared/auth";
import { demoUsers } from "./demo-users.js";
import { createGuestAccessToken, hashGuestAccessToken, verifiesGuestAccessToken } from "./guest-access.js";
import { validateBookingInput } from "./validation.js";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const protoPath = path.resolve(__dirname, "../../../proto/seat_inventory.proto");
const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const proto = grpc.loadPackageDefinition(packageDefinition).bus.seat.v1;

const seatClient = new proto.SeatInventoryService(
  process.env.SEAT_GRPC_URL || "localhost:50051",
  grpc.credentials.createInsecure()
);

const logger = createLogger("booking-service");
registerProcessErrorHandlers(logger);
const app = express();
app.use(requestLoggingMiddleware(logger));
app.use(cors());
app.use(express.json());
assertAuthConfiguration();

let bookings = new Map();
let users = new Map((process.env.NODE_ENV === "production" ? [] : demoUsers).map((user) => [user.id, structuredClone(user)]));
const database = await connectPostgres(process.env.DATABASE_URL, "booking-service");
if (database) {
  const stored = await loadBookingRepository(database);
  bookings = stored.bookings;
  users = stored.users;
}
const tripServiceUrl = process.env.TRIP_SERVICE_URL || "http://localhost:4010";
const publicBookingUrl = process.env.PUBLIC_BOOKING_URL || "http://localhost:4020";

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

function ticketCode(booking, seatId) {
  return `${booking.code}-${seatId}`;
}

function publicBooking(booking) {
  if (!booking) return null;
  const {
    holdToken: _holdToken,
    guestAccessTokenHash: _guestAccessTokenHash,
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

function ticketHtml(booking) {
  const tickets = booking.tickets
    .map(
      (ticket) => `
        <article>
          <h2>${ticket.passengerName}</h2>
          <p>Ghế: <strong>${ticket.seatId}</strong></p>
          <p>Mã vé: ${ticket.id}</p>
          <p>QR mô phỏng: ${ticket.qrPayload}</p>
        </article>`
    )
    .join("");
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Vé điện tử ${booking.code}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #172033; }
    main { max-width: 760px; margin: auto; border: 1px solid #d9dee8; padding: 24px; border-radius: 8px; }
    h1 { color: #087f7a; margin-top: 0; }
    article { border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 16px; }
  </style>
</head>
<body>
  <main>
    <h1>Vé điện tử ${booking.code}</h1>
    <p>Tuyến: ${booking.routeName}</p>
    <p>Khởi hành: ${new Date(booking.departureTime).toLocaleString("vi-VN")}</p>
    <p>Điểm đón: ${booking.pickup}</p>
    <p>Điểm trả: ${booking.dropoff}</p>
    <p>Biển số xe: ${booking.vehiclePlate}</p>
    ${tickets}
    <p>Chính sách check-in: có mặt trước giờ khởi hành tối thiểu 30 phút.</p>
  </main>
</body>
</html>`;
}

function pdfEscape(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function pdfText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function simpleTicketPdf(booking) {
  const lines = [
    `Ve dien tu ${booking.code}`,
    `Tuyen: ${booking.routeName}`,
    `Khoi hanh: ${new Date(booking.departureTime).toLocaleString("vi-VN")}`,
    `Diem don: ${booking.pickup}`,
    `Diem tra: ${booking.dropoff}`,
    `Bien so xe: ${booking.vehiclePlate}`,
    ...booking.tickets.map((ticket) => `${ticket.id} - ${ticket.passengerName} - Ghe ${ticket.seatId} - QR ${ticket.qrPayload}`),
    "Check-in truoc gio khoi hanh toi thieu 30 phut."
  ];
  const text = lines.map((line, index) => `BT /F1 12 Tf 50 ${760 - index * 22} Td (${pdfEscape(pdfText(line))}) Tj ET`).join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(text, "utf8")} >> stream\n${text}\nendstream endobj`
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return body;
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
  return verifiesGuestAccessToken(req.get("x-booking-access-token"), booking.guestAccessTokenHash);
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
  const expiresAt = new Date(booking.createdAt).getTime() + 15 * 60 * 1000;
  const delay = Math.max(0, expiresAt - Date.now());
  setTimeout(async () => {
    const current = bookings.get(booking.code);
    if (!current || current.status !== "PENDING_PAYMENT") return;
    const expiredAt = new Date().toISOString();
    const expired = await commitBookingTransition(
      { ...current, status: "EXPIRED", updatedAt: expiredAt },
      ["PENDING_PAYMENT"],
      [
        kafkaOutboxEvent("booking-events", "BookingExpired", publicBooking({ ...current, status: "EXPIRED", updatedAt: expiredAt })),
        seatOutboxEvent("releaseSeats", {
          tripId: current.tripId,
          seatIds: current.seatIds,
          holdToken: current.holdToken
        }, current.code)
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

app.get("/tickets/:code.html", (req, res) => {
  const booking = bookings.get(req.params.code);
  if (!booking) return res.status(404).send("Booking not found");
  if (!canAccessBooking(req, booking)) return res.status(403).send("Ticket access is denied");
  res.type("html").send(ticketHtml(booking));
});

app.get("/tickets/:code.pdf", (req, res) => {
  const booking = bookings.get(req.params.code);
  if (!booking) return res.status(404).send("Booking not found");
  if (!canAccessBooking(req, booking)) return res.status(403).send("Ticket access is denied");
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `inline; filename="${booking.code}.pdf"`);
  res.send(Buffer.from(simpleTicketPdf(booking), "utf8"));
});

app.get("/seat-map/:tripId", async (req, res) => {
  try {
    const seatMap = await grpcCall("getSeatMap", { tripId: req.params.tripId });
    res.json(seatMap);
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.post("/holds", async (req, res) => {
  try {
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
    if (req.body.userId && (!user || user.id !== req.body.userId)) {
      return res.status(403).json({ error: "A booking can only be created for the authenticated user." });
    }
    const passengers = req.body.passengers ?? [];
    const validationError = validateBookingInput({ ...req.body, passengers });
    if (validationError) return res.status(400).json({ error: validationError });
    const trip = await getTrip(req.body.tripId);
    const seatIds = passengers.map((passenger) => String(passenger.seatId).trim().toUpperCase());
    const code = bookingCode();
    const guestAccessToken = createGuestAccessToken();
    const booking = {
      code,
      tripId: trip.id,
      routeName: `${trip.from} - ${trip.to}`,
      departureTime: trip.departureTime,
      pickup: trip.pickup,
      dropoff: trip.dropoff,
      vehiclePlate: trip.vehiclePlate,
      holdToken: req.body.holdToken,
      guestAccessTokenHash: hashGuestAccessToken(guestAccessToken),
      customerEmail: req.body.customerEmail,
      customerPhone: req.body.customerPhone,
      userId: user?.role === "CUSTOMER" ? user.id : "",
      seatIds,
      passengers,
      totalAmount: trip.price * seatIds.length,
      status: "PENDING_PAYMENT",
      tickets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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

app.post("/bookings/:code/pay", async (req, res) => {
  const booking = await currentBooking(req.params.code);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!canAccessBooking(req, booking)) return res.status(403).json({ error: "Booking access is denied" });
  if (!["PENDING_PAYMENT", "PAYMENT_PROCESSING"].includes(booking.status)) {
    return res.status(409).json({ error: `Booking is ${booking.status}` });
  }

  let processing = booking;
  if (booking.status === "PENDING_PAYMENT") {
    processing = await commitBookingTransition(
      { ...booking, status: "PAYMENT_PROCESSING", updatedAt: new Date().toISOString() },
      ["PENDING_PAYMENT"]
    );
    if (!processing) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
  }

  if (!req.body.success) {
    const failedAt = new Date().toISOString();
    const failed = await commitBookingTransition(
      { ...processing, status: "PAYMENT_FAILED", updatedAt: failedAt },
      ["PAYMENT_PROCESSING"],
      [
        kafkaOutboxEvent("payment-events", "PaymentFailed", publicBooking({ ...processing, status: "PAYMENT_FAILED", updatedAt: failedAt })),
        seatOutboxEvent("releaseSeats", {
          tripId: processing.tripId,
          seatIds: processing.seatIds,
          holdToken: processing.holdToken
        }, processing.code)
      ]
    );
    if (!failed) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
    return res.json({ booking: publicBooking(failed) });
  }

  const confirm = await grpcCall("confirmSeats", {
    tripId: processing.tripId,
    seatIds: processing.seatIds,
    holdToken: processing.holdToken,
    bookingCode: processing.code
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
  const issuedCandidate = {
    ...processing,
    status: "TICKET_ISSUED",
    paidAt,
    updatedAt: paidAt,
    tickets: processing.passengers.map((passenger) => ({
    id: ticketCode(processing, passenger.seatId),
    passengerName: passenger.fullName,
    seatId: passenger.seatId,
    qrPayload: `${processing.code}-${passenger.seatId}`,
    issuedAt: paidAt
    }))
  };

  const eventPayload = publicBooking(issuedCandidate);
  const issued = await commitBookingTransition(
    issuedCandidate,
    ["PAYMENT_PROCESSING"],
    [
      rabbitOutboxEvent("booking.paid", "booking.paid", eventPayload),
      kafkaOutboxEvent("payment-events", "PaymentSucceeded", eventPayload),
      kafkaOutboxEvent("booking-events", "BookingPaid", eventPayload)
    ]
  );
  if (!issued) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
  res.json({ booking: publicBooking(issued) });
});

app.post("/bookings/:code/cancel", async (req, res) => {
  const booking = await currentBooking(req.params.code);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (!canAccessBooking(req, booking)) return res.status(403).json({ error: "Booking access is denied" });
  if (["CHECKED_IN", "COMPLETED", "CANCELLED", "EXPIRED", "PAYMENT_FAILED"].includes(booking.status)) {
    return res.status(409).json({ error: `Cannot cancel booking in ${booking.status}` });
  }
  if (Date.parse(booking.departureTime) <= Date.now()) {
    return res.status(409).json({ error: "Cannot cancel a booking after the trip has departed" });
  }
  const cancelledAt = new Date().toISOString();
  const cancelled = await commitBookingTransition(
    { ...booking, status: "CANCELLED", cancelledAt, updatedAt: cancelledAt },
    ["PENDING_PAYMENT", "TICKET_ISSUED", "PAID"],
    [
      kafkaOutboxEvent("booking-events", "BookingCancelled", publicBooking({ ...booking, status: "CANCELLED", cancelledAt, updatedAt: cancelledAt })),
      seatOutboxEvent("releaseSeats", {
        tripId: booking.tripId,
        seatIds: booking.seatIds,
        holdToken: booking.status === "PENDING_PAYMENT" ? booking.holdToken : booking.code
      }, booking.code)
    ]
  );
  if (!cancelled) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
  res.json({ booking: publicBooking(cancelled) });
});

app.post("/checkin", requireRoles("ADMIN", "STAFF"), async (req, res) => {
  const codeOrTicket = req.body.codeOrTicket ?? "";
  const booking = [...bookings.values()].find(
    (item) => item.code === codeOrTicket || item.tickets.some((ticket) => ticket.id === codeOrTicket)
  );
  if (!booking) return res.status(404).json({ error: "Booking or ticket not found" });
  if (!["TICKET_ISSUED", "PAID"].includes(booking.status)) {
    return res.status(409).json({ error: `Cannot check in booking in ${booking.status}` });
  }
  const checkedInAt = new Date().toISOString();
  const checkedIn = await commitBookingTransition(
    { ...booking, status: "CHECKED_IN", checkedInAt, updatedAt: checkedInAt },
    ["TICKET_ISSUED", "PAID"],
    [kafkaOutboxEvent("booking-events", "PassengerCheckedIn", publicBooking({ ...booking, status: "CHECKED_IN", checkedInAt, updatedAt: checkedInAt }))]
  );
  if (!checkedIn) return res.status(409).json({ error: "Booking status changed. Please refresh and try again." });
  res.json({ booking: publicBooking(checkedIn) });
});

app.post("/admin/block-seats", requireRoles("ADMIN", "STAFF"), async (req, res) => {
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
  const force = setTimeout(() => {
    grpcServer.forceShutdown();
    process.exit(1);
  }, 10_000);
  force.unref();
  grpcServer.tryShutdown(() => httpServer.close(() => process.exit(0)));
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
