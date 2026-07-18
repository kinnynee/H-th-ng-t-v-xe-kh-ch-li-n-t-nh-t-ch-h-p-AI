"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, RefreshCw, Search, Ticket, XCircle } from "lucide-react";
import ChatWidget from "../../../components/ChatWidget";
import SiteChrome from "../../../components/SiteChrome";
import { gql, money, openBookingTicket, shortDateTime, storeBookingAccessToken } from "../../../lib/graphql";

const BOOKING = `
query Booking($code: ID!, $email: String) {
  booking(code: $code, email: $email) {
    code status routeName departureTime pickup dropoff vehiclePlate customerEmail totalAmount
    cancellationPolicy refundAmount cancellationFee ticketHtmlUrl ticketPdfUrl
    seatIds
    passengers { seatId fullName phone email documentId }
    tickets { id passengerName passengerPhone passengerEmail seatId qrPayload qrCodeDataUrl issuedAt status checkedInAt }
  }
}`;

const CANCEL = `
mutation Cancel($code: ID!) {
  cancelBooking(code: $code) {
    code status
  }
}`;

const REQUEST_GUEST_ACCESS = `
mutation RequestGuestAccess($code: ID!, $email: String!) {
  requestGuestBookingAccess(code: $code, email: $email) {
    guestAccessToken expiresAt
  }
}`;

const LIVE_BOOKING_STATUSES = new Set(["PAID", "TICKET_ISSUED", "PARTIALLY_CHECKED_IN"]);

const STATUS_LABELS = {
  HELD: "Đang giữ ghế",
  PENDING_PAYMENT: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  TICKET_ISSUED: "Đã xuất vé",
  PARTIALLY_CHECKED_IN: "Đã check-in một phần",
  CHECKED_IN: "Đã check-in",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  EXPIRED: "Đã hết hạn"
};

export default function BookingPage() {
  const params = useParams();
  const code = params.code;
  const [lookupCode, setLookupCode] = useState(code === "demo" ? "" : code);
  const [lookupEmail, setLookupEmail] = useState("");
  const [accessReady, setAccessReady] = useState(false);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");

  async function lookup() {
    setError("");
    try {
      let data;
      try {
        data = await gql(BOOKING, { code: lookupCode }, { bookingCode: lookupCode });
      } catch (accessError) {
        if (!lookupEmail) throw accessError;
        const access = await gql(REQUEST_GUEST_ACCESS, { code: lookupCode, email: lookupEmail });
        storeBookingAccessToken(lookupCode, access.requestGuestBookingAccess.guestAccessToken);
        data = await gql(BOOKING, { code: lookupCode }, { bookingCode: lookupCode });
      }
      setBooking(data.booking);
    } catch (err) {
      setError(err.message);
      setBooking(null);
    }
  }

  async function cancel() {
    setError("");
    try {
      await gql(CANCEL, { code: booking.code }, { bookingCode: booking.code });
      await lookup();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("access");
    if (token && code !== "demo") {
      storeBookingAccessToken(code, token);
      window.history.replaceState(null, "", window.location.pathname);
    }
    setAccessReady(true);
  }, [code]);

  useEffect(() => {
    if (lookupCode && accessReady) lookup();
  }, [lookupCode, accessReady]);

  useEffect(() => {
    if (!accessReady || !lookupCode || !LIVE_BOOKING_STATUSES.has(booking?.status)) return undefined;
    const timer = window.setInterval(() => lookup(), 10_000);
    return () => window.clearInterval(timer);
  }, [accessReady, booking?.status, lookupCode, lookupEmail]);

  async function openTicket(url) {
    setError("");
    try {
      await openBookingTicket(url, booking.code);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <SiteChrome>
      <main className="page split lookup-layout lookup-page">
        <aside className="panel lookup-panel">
          <div className="panel-header">
            <h1>Tra cứu vé</h1>
            <p>Nhập mã đặt vé và email đã sử dụng để xem vé, trạng thái thanh toán hoặc chính sách hủy.</p>
          </div>
          <div className="panel-body form-grid">
            <label className="field">
              <span>Mã booking</span>
              <input
                className="input"
                value={lookupCode}
                readOnly={code !== "demo"}
                onChange={(event) => { setError(""); setLookupCode(event.target.value); }}
                placeholder="BK260617ABCD"
              />
            </label>
            <label className="field">
              <span>Email đặt vé</span>
              <input
                className="input"
                type="email"
                value={lookupEmail}
                onChange={(event) => { setError(""); setLookupEmail(event.target.value); }}
                placeholder="guest@example.com"
              />
            </label>
            <button className="primary-button" onClick={lookup}>
              <Search size={18} /> Tra cứu
            </button>
            {error && <div className="empty">{error}</div>}
          </div>
        </aside>

        <section className="stack">
          {!booking && <div className="empty lookup-empty"><Ticket size={30} /><strong>Thông tin vé của bạn</strong><span>Vé sẽ hiển thị sau khi tra cứu thành công.</span></div>}
          {booking && (
            <div className="panel">
              <div className="panel-header">
                <h2>{booking.code}</h2>
                <p>{booking.routeName}</p>
              </div>
              <div className="panel-body stack">
                <div className="meta-row">
                  <span className="badge status">{STATUS_LABELS[booking.status] ?? booking.status}</span>
                  <span>{shortDateTime(booking.departureTime)}</span>
                  <span>{money(booking.totalAmount)}</span>
                  {LIVE_BOOKING_STATUSES.has(booking.status) && (
                    <button className="ghost-button" onClick={lookup}>
                      <RefreshCw size={16} /> Cập nhật trạng thái
                    </button>
                  )}
                </div>
                <div className="ticket-card">
                  <p>Điểm đón: {booking.pickup}</p>
                  <p>Điểm trả: {booking.dropoff}</p>
                  <p>Biển số xe: {booking.vehiclePlate}</p>
                </div>
                <div className="policy-inline-card">
                  <strong>Chính sách hủy áp dụng cho vé này</strong>
                  <p>{booking.cancellationPolicy}</p>
                </div>
                {booking.status === "CANCELLED" && (
                  <div className="ticket-card">
                    <p>Hoàn lại: {money(booking.refundAmount)}</p>
                    <p>Phí hủy: {money(booking.cancellationFee)}</p>
                  </div>
                )}
                <div className="trip-list">
                  {booking.tickets.map((ticket) => (
                    <article className="ticket-card" key={ticket.id}>
                      <span className={`badge ${ticket.status === "CANCELLED" ? "status-bad" : "status-good"}`}>
                        {ticket.status === "CANCELLED" ? <XCircle size={14} /> : <Ticket size={14} />}
                        {ticket.status === "CANCELLED" ? "Vé đã hủy" : "Vé điện tử"}
                      </span>
                      <h3>{ticket.id}</h3>
                      <p>{ticket.passengerName}, ghế {ticket.seatId}</p>
                      {ticket.passengerPhone && <p>{ticket.passengerPhone}</p>}
                      {ticket.passengerEmail && <p>{ticket.passengerEmail}</p>}
                      <img className="ticket-qr-code" src={ticket.qrCodeDataUrl} alt={`QR check-in ${ticket.id}`} width="160" height="160" />
                      <p className="muted">Mã QR check-in: {ticket.qrPayload}</p>
                      <span className="badge status">{STATUS_LABELS[ticket.status] ?? ticket.status}</span>
                    </article>
                  ))}
                </div>
                {!["CANCELLED", "PARTIALLY_CHECKED_IN", "CHECKED_IN", "COMPLETED"].includes(booking.status) && (
                  <button className="danger-button" onClick={cancel}>
                    <XCircle size={18} /> Hủy booking
                  </button>
                )}
                {booking.status === "TICKET_ISSUED" && (
                  <span className="badge status-good">
                    <CheckCircle2 size={14} /> Sẵn sàng check-in
                  </span>
                )}
                {booking.tickets.length > 0 && booking.status !== "CANCELLED" && (
                  <div className="two-cols">
                    <button className="ghost-button" onClick={() => openTicket(booking.ticketHtmlUrl)}>Mở vé HTML</button>
                    <button className="ghost-button" onClick={() => openTicket(booking.ticketPdfUrl)}>Mở vé PDF</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
      <ChatWidget bookingCode={booking?.code ?? ""} email={booking?.customerEmail ?? lookupEmail} />
    </SiteChrome>
  );
}
