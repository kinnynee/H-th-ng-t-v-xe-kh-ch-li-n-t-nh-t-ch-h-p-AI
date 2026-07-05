import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { publishKafka, publishRabbit } from "@bus-ai/shared/broker";

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

const app = express();
app.use(cors());
app.use(express.json());

const bookings = new Map();
const users = new Map([
  ["admin-1", { id: "admin-1", email: "admin@bus.local", password: "admin123", role: "ADMIN", name: "Admin Demo", savedPassengers: [] }],
  ["staff-1", { id: "staff-1", email: "staff@bus.local", password: "staff123", role: "STAFF", name: "Check-in Staff", savedPassengers: [] }],
  [
    "customer-1",
    {
      id: "customer-1",
      email: "customer@bus.local",
      password: "customer123",
      role: "CUSTOMER",
      name: "Customer Demo",
      savedPassengers: [
        {
          id: "passenger-1",
          fullName: "Nguyễn Văn An",
          phone: "0909000000",
          email: "customer@bus.local",
          documentId: "CCCD001"
        }
      ]
    }
  ]
]);
const tripServiceUrl = process.env.TRIP_SERVICE_URL || "http://localhost:4010";
const publicBookingUrl = process.env.PUBLIC_BOOKING_URL || "http://localhost:4020";

function grpcCall(method, payload) {
  return new Promise((resolve, reject) => {
    seatClient[method](payload, (error, response) => {
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
  return booking
    ? {
        ...booking,
        ticketHtmlUrl: `${publicBookingUrl}/tickets/${booking.code}.html`,
        ticketPdfUrl: `${publicBookingUrl}/tickets/${booking.code}.pdf`,
        passengers: booking.passengers.map((item) => ({ ...item }))
      }
    : null;
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
  setTimeout(async () => {
    const current = bookings.get(booking.code);
    if (!current || current.status !== "PENDING_PAYMENT") return;
    await grpcCall("releaseSeats", {
      tripId: current.tripId,
      seatIds: current.seatIds,
      holdToken: current.holdToken
    }).catch(() => null);
    current.status = "EXPIRED";
    current.updatedAt = new Date().toISOString();
    await publishKafka("booking-events", "BookingExpired", publicBooking(current));
  }, 15 * 60 * 1000);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "booking-service", bookings: bookings.size });
});

app.get("/tickets/:code.html", (req, res) => {
  const booking = bookings.get(req.params.code);
  if (!booking) return res.status(404).send("Booking not found");
  res.type("html").send(ticketHtml(booking));
});

app.get("/tickets/:code.pdf", (req, res) => {
  const booking = bookings.get(req.params.code);
  if (!booking) return res.status(404).send("Booking not found");
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
    const trip = await getTrip(req.body.tripId);
    const passengers = req.body.passengers ?? [];
    const seatIds = passengers.map((passenger) => passenger.seatId);
    if (seatIds.length === 0) return res.status(400).json({ error: "Booking requires at least one seat" });
    const code = bookingCode();
    const booking = {
      code,
      tripId: trip.id,
      routeName: `${trip.from} - ${trip.to}`,
      departureTime: trip.departureTime,
      pickup: trip.pickup,
      dropoff: trip.dropoff,
      vehiclePlate: trip.vehiclePlate,
      holdToken: req.body.holdToken,
      customerEmail: req.body.customerEmail,
      customerPhone: req.body.customerPhone,
      userId: req.body.userId ?? "",
      seatIds,
      passengers,
      totalAmount: trip.price * seatIds.length,
      status: "PENDING_PAYMENT",
      tickets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    bookings.set(code, booking);
    if (booking.userId) rememberPassengers(booking.userId, passengers);
    schedulePendingExpiry(booking);
    await publishKafka("booking-events", "BookingCreated", publicBooking(booking));
    res.status(201).json({ booking: publicBooking(booking) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/bookings", (req, res) => {
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
  if (req.query.email && booking.customerEmail !== req.query.email) {
    return res.status(403).json({ error: "Email does not match this booking" });
  }
  res.json({ booking: publicBooking(booking) });
});

app.post("/bookings/:code/pay", async (req, res) => {
  const booking = bookings.get(req.params.code);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status !== "PENDING_PAYMENT") return res.status(409).json({ error: `Booking is ${booking.status}` });

  if (!req.body.success) {
    await grpcCall("releaseSeats", {
      tripId: booking.tripId,
      seatIds: booking.seatIds,
      holdToken: booking.holdToken
    }).catch(() => null);
    booking.status = "PAYMENT_FAILED";
    booking.updatedAt = new Date().toISOString();
    await publishKafka("payment-events", "PaymentFailed", publicBooking(booking));
    return res.json({ booking: publicBooking(booking) });
  }

  const confirm = await grpcCall("confirmSeats", {
    tripId: booking.tripId,
    seatIds: booking.seatIds,
    holdToken: booking.holdToken,
    bookingCode: booking.code
  });
  if (!confirm.ok) return res.status(409).json({ error: confirm.message });

  booking.status = "TICKET_ISSUED";
  booking.paidAt = new Date().toISOString();
  booking.updatedAt = booking.paidAt;
  booking.tickets = booking.passengers.map((passenger) => ({
    id: ticketCode(booking, passenger.seatId),
    passengerName: passenger.fullName,
    seatId: passenger.seatId,
    qrPayload: `${booking.code}-${passenger.seatId}`,
    issuedAt: booking.paidAt
  }));

  const eventPayload = publicBooking(booking);
  await publishRabbit("booking.paid", eventPayload, "booking.paid");
  await publishKafka("payment-events", "PaymentSucceeded", eventPayload);
  await publishKafka("booking-events", "BookingPaid", eventPayload);
  res.json({ booking: eventPayload });
});

app.post("/bookings/:code/cancel", async (req, res) => {
  const booking = bookings.get(req.params.code);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (req.body.email && req.body.email !== booking.customerEmail) return res.status(403).json({ error: "Email does not match this booking" });
  if (["CHECKED_IN", "COMPLETED", "CANCELLED"].includes(booking.status)) {
    return res.status(409).json({ error: `Cannot cancel booking in ${booking.status}` });
  }
  await grpcCall("releaseSeats", {
    tripId: booking.tripId,
    seatIds: booking.seatIds,
    holdToken: booking.status === "PENDING_PAYMENT" ? booking.holdToken : booking.code
  }).catch(() => null);
  booking.status = "CANCELLED";
  booking.cancelledAt = new Date().toISOString();
  booking.updatedAt = booking.cancelledAt;
  await publishKafka("booking-events", "BookingCancelled", publicBooking(booking));
  res.json({ booking: publicBooking(booking) });
});

app.post("/checkin", async (req, res) => {
  const codeOrTicket = req.body.codeOrTicket ?? "";
  const booking = [...bookings.values()].find(
    (item) => item.code === codeOrTicket || item.tickets.some((ticket) => ticket.id === codeOrTicket)
  );
  if (!booking) return res.status(404).json({ error: "Booking or ticket not found" });
  if (!["TICKET_ISSUED", "PAID"].includes(booking.status)) {
    return res.status(409).json({ error: `Cannot check in booking in ${booking.status}` });
  }
  booking.status = "CHECKED_IN";
  booking.checkedInAt = new Date().toISOString();
  booking.updatedAt = booking.checkedInAt;
  await publishKafka("booking-events", "PassengerCheckedIn", publicBooking(booking));
  res.json({ booking: publicBooking(booking) });
});

app.post("/admin/block-seats", async (req, res) => {
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

app.post("/auth/register", (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: "Name, email and password are required" });
  if (findUserByEmail(email)) return res.status(409).json({ error: "Email already exists" });
  const id = `customer-${Date.now()}`;
  const user = { id, email, password, role: "CUSTOMER", name, savedPassengers: [] };
  users.set(id, user);
  res.status(201).json({ user: publicUser(user) });
});

app.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = findUserByEmail(email);
  if (user && user.password === password) return res.json({ user: publicUser(user) });
  res.status(401).json({ error: "Invalid credentials" });
});

app.get("/users/:id/bookings", (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const userBookings = [...bookings.values()].filter((booking) => booking.userId === user.id);
  res.json({ bookings: userBookings.map(publicBooking) });
});

app.get("/users/:id/passengers", (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ passengers: user.savedPassengers });
});

app.post("/users/:id/passengers", (req, res) => {
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
  res.status(201).json({ passenger });
});

app.delete("/users/:id/passengers/:passengerId", (req, res) => {
  const user = users.get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.savedPassengers = user.savedPassengers.filter((passenger) => passenger.id !== req.params.passengerId);
  res.json({ ok: true });
});

const port = Number(process.env.PORT || 4020);
app.listen(port, () => {
  console.log(`[booking-service] listening on http://localhost:${port}`);
});
