"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Armchair, CalendarDays, CheckCircle2, CreditCard, MapPin, RefreshCw, Ticket, Timer, UserCheck } from "lucide-react";
import ChatWidget from "../../../components/ChatWidget";
import SeatMap from "../../../components/SeatMap";
import SiteChrome from "../../../components/SiteChrome";
import { gql, money, openBookingTicket, shortDateTime, storeBookingAccessToken, subscribeToSeatChanges } from "../../../lib/graphql";

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
    code status totalAmount customerEmail guestAccessToken guestAccessExpiresAt paymentExpiresAt
  }
}`;

const PAY = `
mutation Pay($code: ID!, $success: Boolean!) {
  payBooking(code: $code, success: $success) {
    code status totalAmount customerEmail ticketHtmlUrl ticketPdfUrl
    tickets { id passengerName seatId qrPayload issuedAt status checkedInAt }
  }
}`;

const SAVED_PASSENGERS = `
query SavedPassengers($userId: ID!) {
  savedPassengers(userId: $userId) {
    id fullName phone email documentId
  }
}`;

function formatHoldTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

function isValidPhone(value) {
  return /^(?:\+?84|0)\d{9,10}$/.test(String(value ?? "").replace(/[.\s-]/g, ""));
}

function isValidDocumentId(value) {
  const documentId = String(value ?? "").trim();
  return !documentId || /^[A-Za-z0-9-]{6,20}$/.test(documentId);
}

function bookingErrorMessage(error) {
  if (error?.message === "Trip has already departed") {
    return "Chuyến xe đã khởi hành. Vui lòng chọn một chuyến khác.";
  }
  return error?.message || "Không thể xử lý yêu cầu đặt vé.";
}

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
  const [paymentRemaining, setPaymentRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nowMs, setNowMs] = useState(null);
  const passengerFormRef = useRef(null);

  const selectedSeats = useMemo(() => selected.join(", "), [selected]);
  const tripDeparted = nowMs !== null && Date.parse(trip?.departureTime) <= nowMs;

  async function load() {
    const data = await gql(TRIP, { id: tripId });
    setTrip(data.trip);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [tripId]);

  useEffect(() => {
    const updateClock = () => setNowMs(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => subscribeToSeatChanges(
    tripId,
    (event) => setTrip((current) => current ? {
      ...current,
      seats: event.seats,
      availableSeats: event.seats.filter((seat) => seat.status === "AVAILABLE").length
    } : current),
    () => null
  ), [tripId]);

  useEffect(() => {
    if (!hold?.ok) return;
    const timer = setInterval(() => {
      setHoldRemaining((current) => {
        if (current <= 1) {
          clearInterval(timer);
          setHold(null);
          setSelected([]);
          setPassengers({});
          setError("Thời gian giữ ghế đã hết hạn. Vui lòng chọn lại ghế.");
          load().catch(() => null);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hold?.ok]);

  useEffect(() => {
    if (booking?.status !== "PENDING_PAYMENT" || !booking.paymentExpiresAt) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(booking.paymentExpiresAt) - Date.now()) / 1000));
      setPaymentRemaining(remaining);
      if (remaining === 0) {
        setBooking((current) => current?.status === "PENDING_PAYMENT" ? { ...current, status: "EXPIRED" } : current);
        setError("Đã hết 15 phút thanh toán. Ghế đang được giải phóng để người khác đặt.");
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [booking?.status, booking?.paymentExpiresAt]);

  useEffect(() => {
    if (!hold?.ok) return;
    const frame = window.requestAnimationFrame(() => {
      passengerFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      passengerFormRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hold?.ok]);

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
    setError("");
    setSelected((items) => (items.includes(seat.id) ? items.filter((id) => id !== seat.id) : [...items, seat.id]));
  }

  async function holdSeats() {
    if (tripDeparted) {
      setError("Chuyến xe đã khởi hành. Vui lòng chọn một chuyến khác.");
      return;
    }
    if (selected.length === 0) {
      setError("Vui lòng chọn ít nhất một ghế trước khi giữ chỗ.");
      return;
    }
    if (!isValidEmail(customer.email) || !isValidPhone(customer.phone)) {
      setError("Vui lòng nhập email và số điện thoại nhận vé hợp lệ.");
      return;
    }
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
      setError(bookingErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createBooking() {
    if (!hold?.ok || !hold.holdToken || holdRemaining <= 0) {
      setError("Phiên giữ ghế đã hết hạn. Vui lòng chọn và giữ ghế lại.");
      return;
    }
    if (selected.length === 0) {
      setError("Không thể tạo booking khi chưa chọn ghế.");
      return;
    }
    if (!isValidEmail(customer.email) || !isValidPhone(customer.phone)) {
      setError("Vui lòng nhập email và số điện thoại nhận vé hợp lệ.");
      return;
    }
    for (const seatId of selected) {
      const passenger = passengers[seatId] ?? {};
      if (String(passenger.fullName ?? "").trim().length < 2) {
        setError(`Vui lòng nhập họ tên hợp lệ cho ghế ${seatId}.`);
        return;
      }
      if (!isValidEmail(passenger.email)) {
        setError(`Vui lòng nhập email hợp lệ cho hành khách ghế ${seatId}.`);
        return;
      }
      if (!isValidPhone(passenger.phone)) {
        setError(`Vui lòng nhập số điện thoại hợp lệ cho hành khách ghế ${seatId}.`);
        return;
      }
      if (!isValidDocumentId(passenger.documentId)) {
        setError(`Giấy tờ của hành khách ghế ${seatId} không hợp lệ.`);
        return;
      }
    }
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
      storeBookingAccessToken(data.createBooking.code, data.createBooking.guestAccessToken);
      setBooking(data.createBooking);
      setHold(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function pay(success) {
    if (!booking || selected.length === 0) {
      setError("Không thể thanh toán khi booking không có ghế.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await gql(PAY, { code: booking.code, success }, { bookingCode: booking.code });
      setBooking((current) => ({ ...data.payBooking, guestAccessToken: current?.guestAccessToken }));
      setHold(null);
      setPaymentRemaining(0);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function updatePassenger(seatId, key, value) {
    setError("");
    setPassengers((current) => ({
      ...current,
      [seatId]: { ...(current[seatId] ?? { seatId }), [key]: value }
    }));
  }

  function applySavedPassenger(seatId, passengerId) {
    const saved = savedPassengers.find((item) => item.id === passengerId);
    if (!saved) return;
    setError("");
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

  function updateCustomer(key, value) {
    setError("");
    setCustomer((current) => ({ ...current, [key]: value }));
  }

  function bookingLink() {
    const base = `/booking/${booking.code}`;
    return booking.guestAccessToken ? `${base}#access=${encodeURIComponent(booking.guestAccessToken)}` : base;
  }

  async function openTicket(url) {
    setError("");
    try {
      await openBookingTicket(url, booking.code);
    } catch (err) {
      setError(err.message);
    }
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
      <main className="page stack checkout-page">
        <nav className="checkout-steps" aria-label="Tiến trình đặt vé">
          <div className={`checkout-step ${!hold?.ok ? "active" : "done"}`}>
            <span className="checkout-step__number">1</span>
            <span><strong>Chọn ghế</strong><small>Xem ghế trống trực tiếp</small></span>
          </div>
          <div className={`checkout-step ${hold?.ok && !booking ? "active" : booking ? "done" : ""}`}>
            <span className="checkout-step__number">2</span>
            <span><strong>Thông tin hành khách</strong><small>Giữ ghế trong 5 phút</small></span>
          </div>
          <div className={`checkout-step ${booking ? "active" : ""}`}>
            <span className="checkout-step__number">3</span>
            <span><strong>Thanh toán</strong><small>Nhận vé điện tử</small></span>
          </div>
        </nav>
        <div className="checkout-layout">
        <section className="stack">
          <div className="panel seat-panel">
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
              {tripDeparted && (
                <div className="empty">Chuyến xe đã khởi hành và không còn nhận giữ ghế.</div>
              )}
              <SeatMap
                busType={trip.busType}
                seats={trip.seats}
                selected={selected}
                onToggle={toggleSeat}
                disabled={tripDeparted || busy}
              />
            </div>
          </div>

          {hold?.ok && (
            <div className="panel" ref={passengerFormRef} tabIndex={-1}>
              <div className="panel-header">
                <h2>Thông tin hành khách</h2>
                <p>
                  <Timer size={14} /> Ghế đang giữ trong {formatHoldTime(holdRemaining)}.
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
                        <input className="input" value={passengers[seatId]?.fullName ?? ""} onChange={(event) => updatePassenger(seatId, "fullName", event.target.value)} minLength={2} required />
                      </label>
                      <label className="field">
                        <span>Số điện thoại</span>
                        <input className="input" type="tel" inputMode="tel" value={passengers[seatId]?.phone ?? ""} onChange={(event) => updatePassenger(seatId, "phone", event.target.value)} required />
                      </label>
                    </div>
                    <div className="two-cols" style={{ marginTop: 12 }}>
                      <label className="field">
                        <span>Email</span>
                        <input className="input" type="email" value={passengers[seatId]?.email ?? ""} onChange={(event) => updatePassenger(seatId, "email", event.target.value)} required />
                      </label>
                      <label className="field">
                        <span>Giấy tờ</span>
                        <input className="input" value={passengers[seatId]?.documentId ?? ""} onChange={(event) => updatePassenger(seatId, "documentId", event.target.value)} placeholder="Tùy chọn" />
                      </label>
                    </div>
                  </div>
                ))}
                <button className="primary-button" onClick={createBooking} disabled={busy || holdRemaining <= 0}>
                  <Ticket size={18} /> Tạo booking
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="panel checkout-summary">
          <div className="panel-header">
            <h2>Tóm tắt</h2>
            <p>{trip.cancellationPolicy}</p>
          </div>
          <div className="panel-body form-grid">
            <label className="field">
              <span>Email nhận vé</span>
              <input className="input" value={customer.email} onChange={(event) => updateCustomer("email", event.target.value)} />
            </label>
            <label className="field">
              <span>Số điện thoại</span>
              <input className="input" value={customer.phone} onChange={(event) => updateCustomer("phone", event.target.value)} />
            </label>
            {user && (
              <label className="field">
                <span>Kiểu checkout</span>
                <select className="select" value={checkoutMode} onChange={(event) => { setError(""); setCheckoutMode(event.target.value); }}>
                  <option value="registered">Registered checkout - gắn với {user.email}</option>
                  <option value="guest">Guest checkout</option>
                </select>
              </label>
            )}
            {checkoutMode === "registered" && user && (
              <span className="badge status-good">
                <UserCheck size={14} />
                {booking
                  ? `Booking ${booking.code} đã được lưu vào lịch sử tài khoản.`
                  : "Booking sẽ được lưu sau khi chọn ghế, giữ ghế và bấm Tạo booking."}
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
              <button className="primary-button" onClick={holdSeats} disabled={busy || tripDeparted || selected.length === 0} aria-busy={busy}>
                <Timer size={18} /> {busy ? "Đang giữ ghế..." : tripDeparted ? "Chuyến đã khởi hành" : "Giữ ghế"}
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
                    <span className="badge status">
                      <Timer size={14} /> Thanh toán còn {formatHoldTime(paymentRemaining)}
                    </span>
                    <button className="primary-button" onClick={() => pay(true)} disabled={busy || paymentRemaining <= 0}>
                      <CreditCard size={18} /> Thanh toán thành công
                    </button>
                    <button className="danger-button" onClick={() => pay(false)} disabled={busy || paymentRemaining <= 0}>
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
                    <Link className="primary-button" href={bookingLink()}>
                      Xem vé
                    </Link>
                    <button className="ghost-button" onClick={() => openTicket(booking.ticketHtmlUrl)}>
                      Vé HTML
                    </button>
                    <button className="ghost-button" onClick={() => openTicket(booking.ticketPdfUrl)}>
                      Vé PDF
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
        </div>
      </main>
      <ChatWidget bookingCode={booking?.code ?? ""} email={customer.email} />
    </SiteChrome>
  );
}
