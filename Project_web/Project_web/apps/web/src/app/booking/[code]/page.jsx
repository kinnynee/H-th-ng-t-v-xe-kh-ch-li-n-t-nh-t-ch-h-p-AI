"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Search, Ticket, XCircle } from "lucide-react";
import ChatWidget from "../../../components/ChatWidget";
import SiteChrome from "../../../components/SiteChrome";
import { gql, money, shortDateTime } from "../../../lib/graphql";

const BOOKING = `
query Booking($code: ID!, $email: String) {
  booking(code: $code, email: $email) {
    code status routeName departureTime pickup dropoff vehiclePlate customerEmail totalAmount ticketHtmlUrl ticketPdfUrl
    seatIds
    passengers { seatId fullName phone email documentId }
    tickets { id passengerName seatId qrPayload issuedAt }
  }
}`;

const CANCEL = `
mutation Cancel($code: ID!, $email: String!) {
  cancelBooking(code: $code, email: $email) {
    code status
  }
}`;

export default function BookingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const code = params.code;
  const [lookupCode, setLookupCode] = useState(code === "demo" ? "" : code);
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");

  async function lookup() {
    setError("");
    try {
      const data = await gql(BOOKING, { code: lookupCode, email });
      setBooking(data.booking);
    } catch (err) {
      setError(err.message);
      setBooking(null);
    }
  }

  async function cancel() {
    setError("");
    try {
      await gql(CANCEL, { code: booking.code, email });
      await lookup();
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (lookupCode && email) lookup();
  }, [lookupCode, email]);

  return (
    <SiteChrome>
      <main className="page split">
        <aside className="panel">
          <div className="panel-header">
            <h1>Tra cứu vé</h1>
            <p>Cần mã booking và email nhận vé.</p>
          </div>
          <div className="panel-body form-grid">
            <label className="field">
              <span>Mã booking</span>
              <input
                className="input"
                value={lookupCode}
                readOnly={code !== "demo"}
                onChange={(event) => setLookupCode(event.target.value)}
                placeholder="BK260617ABCD"
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="guest@example.com" />
            </label>
            <button className="primary-button" onClick={lookup}>
              <Search size={18} /> Tra cứu
            </button>
            {error && <div className="empty">{error}</div>}
          </div>
        </aside>

        <section className="stack">
          {!booking && <div className="empty">Vé sẽ hiển thị sau khi tra cứu thành công.</div>}
          {booking && (
            <div className="panel">
              <div className="panel-header">
                <h2>{booking.code}</h2>
                <p>{booking.routeName}</p>
              </div>
              <div className="panel-body stack">
                <div className="meta-row">
                  <span className="badge status">{booking.status}</span>
                  <span>{shortDateTime(booking.departureTime)}</span>
                  <span>{money(booking.totalAmount)}</span>
                </div>
                <div className="ticket-card">
                  <p>Điểm đón: {booking.pickup}</p>
                  <p>Điểm trả: {booking.dropoff}</p>
                  <p>Biển số xe: {booking.vehiclePlate}</p>
                </div>
                <div className="trip-list">
                  {booking.tickets.map((ticket) => (
                    <article className="ticket-card" key={ticket.id}>
                      <span className="badge status-good">
                        <Ticket size={14} /> Vé điện tử
                      </span>
                      <h3>{ticket.id}</h3>
                      <p>{ticket.passengerName}, ghế {ticket.seatId}</p>
                      <p className="muted">QR mô phỏng: {ticket.qrPayload}</p>
                    </article>
                  ))}
                </div>
                {!["CANCELLED", "CHECKED_IN", "COMPLETED"].includes(booking.status) && (
                  <button className="danger-button" onClick={cancel}>
                    <XCircle size={18} /> Hủy booking
                  </button>
                )}
                {booking.status === "TICKET_ISSUED" && (
                  <span className="badge status-good">
                    <CheckCircle2 size={14} /> Sẵn sàng check-in
                  </span>
                )}
                {booking.tickets.length > 0 && (
                  <div className="two-cols">
                    <a className="ghost-button" href={booking.ticketHtmlUrl} target="_blank" rel="noreferrer">Mở vé HTML</a>
                    <a className="ghost-button" href={booking.ticketPdfUrl} target="_blank" rel="noreferrer">Mở vé PDF</a>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
      <ChatWidget bookingCode={booking?.code ?? ""} email={email} />
    </SiteChrome>
  );
}
