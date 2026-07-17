"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Armchair, CalendarDays, CheckCircle2, CreditCard, MapPin, RefreshCw, Ticket, Timer, UserCheck } from "lucide-react";
import ChatWidget from "../../../components/ChatWidget";
import SiteChrome from "../../../components/SiteChrome";
import { gql, money, shortDateTime } from "../../../lib/graphql";

const TRIP = `
query Trip($id: ID!) {
  trip(id: $id) {
    id from to pickup dropoff operatorName busType vehiclePlate availableSeats
    departureTime arrivalTime durationMinutes price cancellationPolicy
    seats { id label floor status holdExpiresIn }
  }
}`;

const HOLD = `
mutation Hold($tripId: ID!, $seatIds: [String!]!, $customerEmail: String, $ttlSeconds: Int) {
  holdSeats(tripId: $tripId, seatIds: $seatIds, customerEmail: $customerEmail, ttlSeconds: $ttlSeconds) {
    ok message holdToken expiresIn seats { id label floor status holdExpiresIn }
  }
}`;

const CREATE = `
mutation CreateBooking($input: CreateBookingInput!) {
  createBooking(input: $input) {
    code status totalAmount customerEmail
  }
}`;

const PAY = `
mutation Pay($code: ID!, $success: Boolean!) {
  payBooking(code: $code, success: $success) {
    code status totalAmount customerEmail ticketHtmlUrl ticketPdfUrl
    tickets { id passengerName seatId qrPayload issuedAt }
  }
}`;

const SAVED_PASSENGERS = `
query SavedPassengers($userId: ID!) {
  savedPassengers(userId: $userId) {
    id fullName phone email documentId
  }
}`;

export default function TripDetail() {
  const params = useParams();
  const tripId = params.id;
  const [trip, setTrip] = useState(null);
  const [selected, setSelected] = useState([]);
  const [hold, setHold] = useState(null);
  const [customer, setCustomer] = useState({ email: "guest@example.com", phone: "0909000000" });
  const [user, setUser] = useState(null);
  const [checkoutMode, setCheckoutMode] = useState("guest");
  const [savedPassengers, setSavedPassengers] = useState([]);
  const [passengers, setPassengers] = useState({});
  const [booking, setBooking] = useState(null);
  const [holdRemaining, setHoldRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedSeats = useMemo(() => selected.join(", "), [selected]);

  async function load() {
    const data = await gql(TRIP, { id: tripId });
    setTrip(data.trip);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [tripId]);

  useEffect(() => {
    if (!hold?.ok || holdRemaining <= 0) return;
    const timer = setInterval(() => {
      setHoldRemaining((current) => {
        if (current <= 1) {
          clearInterval(timer);
          load().catch(() => null);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hold?.ok, holdRemaining]);

  useEffect(() => {
    const raw = localStorage.getItem("busUser");
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored.role !== "CUSTOMER") return;
    setUser(stored);
    setCheckoutMode("registered");
    setCustomer((current) => ({ ...current, email: stored.email }));
    gql(SAVED_PASSENGERS, { userId: stored.id })
      .then((data) => setSavedPassengers(data.savedPassengers))
      .catch(() => setSavedPassengers(stored.savedPassengers ?? []));
  }, []);

  function toggleSeat(seat) {
    if (seat.status !== "AVAILABLE" && !selected.includes(seat.id)) return;
    setSelected((items) => (items.includes(seat.id) ? items.filter((id) => id !== seat.id) : [...items, seat.id]));
  }

  async function holdSeats() {
    setBusy(true);
    setError("");
    try {
      const data = await gql(HOLD, {
        tripId: trip.id,
        seatIds: selected,
        customerEmail: customer.email,
        ttlSeconds: 300
      });
      setHold(data.holdSeats);
      setHoldRemaining(data.holdSeats.expiresIn);
      setTrip((current) => ({ ...current, seats: data.holdSeats.seats }));
      const next = {};
      selected.forEach((seatId, index) => {
        next[seatId] = passengers[seatId] ?? {
          seatId,
          fullName: index === 0 ? "Nguyễn Văn An" : "",
          phone: customer.phone,
          email: customer.email,
          documentId: ""
        };
      });
      setPassengers(next);
      if (!data.holdSeats.ok) setError(data.holdSeats.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createBooking() {
    setBusy(true);
    setError("");
    try {
      const data = await gql(CREATE, {
        input: {
          tripId: trip.id,
          holdToken: hold.holdToken,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          passengers: selected.map((seatId) => passengers[seatId]),
          userId: checkoutMode === "registered" ? user?.id : undefined
        }
      });
      setBooking(data.createBooking);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function pay(success) {
    setBusy(true);
    setError("");
    try {
      const data = await gql(PAY, { code: booking.code, success });
      setBooking(data.payBooking);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function updatePassenger(seatId, key, value) {
    setPassengers((current) => ({
      ...current,
      [seatId]: { ...(current[seatId] ?? { seatId }), [key]: value }
    }));
  }

  function applySavedPassenger(seatId, passengerId) {
    const saved = savedPassengers.find((item) => item.id === passengerId);
    if (!saved) return;
    setPassengers((current) => ({
      ...current,
      [seatId]: {
        ...(current[seatId] ?? { seatId }),
        seatId,
        fullName: saved.fullName,
        phone: saved.phone,
        email: saved.email,
        documentId: saved.documentId
      }
    }));
    setCustomer((current) => ({ ...current, email: saved.email, phone: saved.phone }));
  }

  if (!trip) {
    return (
      <SiteChrome>
        <main className="page">
          <div className="empty">{error || "Đang tải chuyến..."}</div>
        </main>
      </SiteChrome>
    );
  }

  return (
    <SiteChrome>
      <main className="page checkout-layout">
        <section className="stack">
          <div className="panel">
            <div className="panel-header">
              <h1>
                {trip.from} - {trip.to}
              </h1>
              <p>
                {trip.operatorName}, {trip.busType}, biển số {trip.vehiclePlate}
              </p>
            </div>
            <div className="panel-body stack">
              <div className="meta-row">
                <span className="meta-item">
                  <CalendarDays size={16} /> {shortDateTime(trip.departureTime)}
                </span>
                <span className="meta-item">
                  <MapPin size={16} /> {trip.pickup} → {trip.dropoff}
                </span>
                <span className="meta-item">
                  <Armchair size={16} /> {trip.availableSeats} ghế trống
                </span>
              </div>
              <div className="seat-grid">
                {trip.seats.map((seat) => (
                  <button
                    className={`seat-button ${seat.status.toLowerCase()} ${selected.includes(seat.id) ? "selected" : ""}`}
                    key={seat.id}
                    onClick={() => toggleSeat(seat)}
                    title={`${seat.label} - ${seat.status}`}
                  >
                    {seat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {hold?.ok && (
            <div className="panel">
              <div className="panel-header">
                <h2>Thông tin hành khách</h2>
                <p>
                  <Timer size={14} /> Ghế đang giữ trong {holdRemaining} giây.
                </p>
              </div>
              <div className="panel-body passenger-list">
                {selected.map((seatId) => (
                  <div className="ticket-card" key={seatId}>
                    <div className="badge">Ghế {seatId}</div>
                    {checkoutMode === "registered" && savedPassengers.length > 0 && (
                      <label className="field" style={{ marginTop: 12 }}>
                        <span>Điền từ hành khách đã lưu</span>
                        <select className="select" defaultValue="" onChange={(event) => applySavedPassenger(seatId, event.target.value)}>
                          <option value="">Chọn hành khách</option>
                          {savedPassengers.map((item) => (
                            <option key={item.id} value={item.id}>{item.fullName} - {item.phone}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="two-cols" style={{ marginTop: 12 }}>
                      <label className="field">
                        <span>Họ tên</span>
                        <input className="input" value={passengers[seatId]?.fullName ?? ""} onChange={(event) => updatePassenger(seatId, "fullName", event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Số điện thoại</span>
                        <input className="input" value={passengers[seatId]?.phone ?? ""} onChange={(event) => updatePassenger(seatId, "phone", event.target.value)} />
                      </label>
                    </div>
                    <div className="two-cols" style={{ marginTop: 12 }}>
                      <label className="field">
                        <span>Email</span>
                        <input className="input" value={passengers[seatId]?.email ?? ""} onChange={(event) => updatePassenger(seatId, "email", event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Giấy tờ</span>
                        <input className="input" value={passengers[seatId]?.documentId ?? ""} onChange={(event) => updatePassenger(seatId, "documentId", event.target.value)} />
                      </label>
                    </div>
                  </div>
                ))}
                <button className="primary-button" onClick={createBooking} disabled={busy}>
                  <Ticket size={18} /> Tạo booking
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="panel">
          <div className="panel-header">
            <h2>Tóm tắt</h2>
            <p>{trip.cancellationPolicy}</p>
          </div>
          <div className="panel-body form-grid">
            <label className="field">
              <span>Email nhận vé</span>
              <input className="input" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label className="field">
              <span>Số điện thoại</span>
              <input className="input" value={customer.phone} onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} />
            </label>
            {user && (
              <label className="field">
                <span>Kiểu checkout</span>
                <select className="select" value={checkoutMode} onChange={(event) => setCheckoutMode(event.target.value)}>
                  <option value="registered">Registered checkout - gắn với {user.email}</option>
                  <option value="guest">Guest checkout</option>
                </select>
              </label>
            )}
            {checkoutMode === "registered" && user && (
              <span className="badge status-good">
                <UserCheck size={14} /> Booking sẽ lưu vào lịch sử tài khoản
              </span>
            )}
            <div className="ticket-card">
              <p className="muted">Ghế đã chọn</p>
              <strong>{selectedSeats || "Chưa chọn"}</strong>
            </div>
            <div className="ticket-card">
              <p className="muted">Tổng tiền</p>
              <strong className="price">{money(selected.length * trip.price)}</strong>
            </div>
            {error && <div className="empty">{error}</div>}
            {!hold?.ok && (
              <button className="primary-button" onClick={holdSeats} disabled={busy || selected.length === 0}>
                <Timer size={18} /> Giữ ghế
              </button>
            )}
            {hold?.ok && !booking && (
              <button className="ghost-button" onClick={load}>
                <RefreshCw size={18} /> Cập nhật ghế
              </button>
            )}
            {booking && (
              <div className="stack">
                <div className="ticket-card">
                  <span className="badge status">{booking.status}</span>
                  <h3>{booking.code}</h3>
                  <p>{money(booking.totalAmount)}</p>
                </div>
                {booking.status === "PENDING_PAYMENT" && (
                  <>
                    <button className="primary-button" onClick={() => pay(true)} disabled={busy}>
                      <CreditCard size={18} /> Thanh toán thành công
                    </button>
                    <button className="danger-button" onClick={() => pay(false)} disabled={busy}>
                      Thanh toán thất bại
                    </button>
                  </>
                )}
                {booking.tickets?.length > 0 && (
                  <>
                    {booking.tickets.map((ticket) => (
                      <div className="ticket-card" key={ticket.id}>
                        <span className="badge status-good">
                          <CheckCircle2 size={14} /> Vé điện tử
                        </span>
                        <h3>{ticket.id}</h3>
                        <p>{ticket.passengerName}, ghế {ticket.seatId}</p>
                        <p className="muted">QR: {ticket.qrPayload}</p>
                      </div>
                    ))}
                    <Link className="primary-button" href={`/booking/${booking.code}?email=${encodeURIComponent(booking.customerEmail)}`}>
                      Xem vé
                    </Link>
                    <a className="ghost-button" href={booking.ticketHtmlUrl} target="_blank" rel="noreferrer">
                      Vé HTML
                    </a>
                    <a className="ghost-button" href={booking.ticketPdfUrl} target="_blank" rel="noreferrer">
                      Vé PDF
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
      </main>
      <ChatWidget bookingCode={booking?.code ?? ""} email={customer.email} />
    </SiteChrome>
  );
}
