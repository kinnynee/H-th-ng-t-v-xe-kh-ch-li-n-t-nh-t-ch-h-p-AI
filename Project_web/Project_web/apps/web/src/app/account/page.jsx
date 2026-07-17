"use client";

import { useEffect, useState } from "react";
import { LogIn, Plus, Save, Trash2, UserRound, XCircle } from "lucide-react";
import SiteChrome from "../../components/SiteChrome";
import { gql, money, shortDateTime } from "../../lib/graphql";

const LOGIN = `
mutation Login($email: String!, $password: String!) {
  login(email: $email, password: $password) {
    id email role name
    savedPassengers { id fullName phone email documentId }
  }
}`;

const REGISTER = `
mutation Register($input: RegisterCustomerInput!) {
  registerCustomer(input: $input) {
    id email role name
    savedPassengers { id fullName phone email documentId }
  }
}`;

const ACCOUNT = `
query Account($userId: ID!) {
  myBookings(userId: $userId) {
    code status routeName departureTime customerEmail totalAmount
    seatIds
    tickets { id seatId qrPayload }
  }
  savedPassengers(userId: $userId) {
    id fullName phone email documentId
  }
}`;

const SAVE_PASSENGER = `
mutation SavePassenger($userId: ID!, $passenger: SavedPassengerInput!) {
  savePassenger(userId: $userId, passenger: $passenger) {
    id fullName phone email documentId
  }
}`;

const DELETE_PASSENGER = `
mutation DeletePassenger($userId: ID!, $passengerId: ID!) {
  deleteSavedPassenger(userId: $userId, passengerId: $passengerId)
}`;

const CANCEL = `
mutation Cancel($code: ID!, $email: String!) {
  cancelBooking(code: $code, email: $email) { code status }
}`;

export default function AccountPage() {
  const [mode, setMode] = useState("login");
  const [user, setUser] = useState(null);
  const [credentials, setCredentials] = useState({
    name: "Customer Demo",
    email: "customer@bus.local",
    password: "customer123"
  });
  const [passenger, setPassenger] = useState({
    fullName: "Nguyễn Văn An",
    phone: "0909000000",
    email: "customer@bus.local",
    documentId: "CCCD001"
  });
  const [bookings, setBookings] = useState([]);
  const [passengers, setPassengers] = useState([]);
  const [message, setMessage] = useState("");

  async function loadAccount(nextUser = user) {
    if (!nextUser) return;
    const data = await gql(ACCOUNT, { userId: nextUser.id });
    setBookings(data.myBookings);
    setPassengers(data.savedPassengers);
  }

  useEffect(() => {
    const raw = localStorage.getItem("busUser");
    if (!raw) return;
    const stored = JSON.parse(raw);
    setUser(stored);
    loadAccount(stored).catch((error) => setMessage(error.message));
  }, []);

  async function submitAuth() {
    setMessage("");
    try {
      const data = mode === "login"
        ? await gql(LOGIN, { email: credentials.email, password: credentials.password })
        : await gql(REGISTER, { input: credentials });
      const nextUser = mode === "login" ? data.login : data.registerCustomer;
      if (nextUser.role !== "CUSTOMER") {
        setMessage("Trang này dành cho tài khoản CUSTOMER.");
        return;
      }
      localStorage.setItem("busUser", JSON.stringify(nextUser));
      setUser(nextUser);
      setPassenger((current) => ({ ...current, email: nextUser.email }));
      await loadAccount(nextUser);
      setMessage("Đăng nhập customer thành công.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function logout() {
    localStorage.removeItem("busUser");
    setUser(null);
    setBookings([]);
    setPassengers([]);
  }

  async function savePassenger() {
    setMessage("");
    try {
      await gql(SAVE_PASSENGER, { userId: user.id, passenger });
      await loadAccount();
      setMessage("Đã lưu hành khách thường dùng.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deletePassenger(passengerId) {
    await gql(DELETE_PASSENGER, { userId: user.id, passengerId });
    await loadAccount();
  }

  async function cancelBooking(booking) {
    setMessage("");
    try {
      await gql(CANCEL, { code: booking.code, email: booking.customerEmail });
      await loadAccount();
      setMessage(`Đã hủy booking ${booking.code}.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <SiteChrome>
      <main className="page stack">
        <section className="section-title">
          <div>
            <h1>Tài khoản khách hàng</h1>
            <p>Registered Customer có thể xem lịch sử đặt vé và lưu hành khách thường dùng.</p>
          </div>
          {user && <button className="ghost-button" onClick={logout}>Đăng xuất</button>}
        </section>

        {message && <div className="empty">{message}</div>}

        {!user && (
          <section className="panel">
            <div className="panel-header">
              <h2>{mode === "login" ? "Đăng nhập customer" : "Tạo tài khoản customer"}</h2>
            </div>
            <div className="panel-body form-grid">
              {mode === "register" && (
                <label className="field">
                  <span>Họ tên</span>
                  <input className="input" value={credentials.name} onChange={(event) => setCredentials((current) => ({ ...current, name: event.target.value }))} />
                </label>
              )}
              <label className="field">
                <span>Email</span>
                <input className="input" value={credentials.email} onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label className="field">
                <span>Mật khẩu</span>
                <input className="input" type="password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} />
              </label>
              <div className="two-cols">
                <button className="primary-button" onClick={submitAuth}>
                  <LogIn size={18} /> {mode === "login" ? "Đăng nhập" : "Đăng ký"}
                </button>
                <button className="ghost-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
                  {mode === "login" ? "Tạo tài khoản" : "Đã có tài khoản"}
                </button>
              </div>
            </div>
          </section>
        )}

        {user && (
          <section className="split">
            <div className="stack">
              <div className="panel">
                <div className="panel-header">
                  <h2>
                    <UserRound size={18} /> {user.name}
                  </h2>
                  <p>{user.email}</p>
                </div>
                <div className="panel-body form-grid">
                  <h3>Hành khách thường dùng</h3>
                  <div className="two-cols">
                    <input className="input" value={passenger.fullName} onChange={(event) => setPassenger((current) => ({ ...current, fullName: event.target.value }))} placeholder="Họ tên" />
                    <input className="input" value={passenger.phone} onChange={(event) => setPassenger((current) => ({ ...current, phone: event.target.value }))} placeholder="Số điện thoại" />
                  </div>
                  <div className="two-cols">
                    <input className="input" value={passenger.email} onChange={(event) => setPassenger((current) => ({ ...current, email: event.target.value }))} placeholder="Email" />
                    <input className="input" value={passenger.documentId} onChange={(event) => setPassenger((current) => ({ ...current, documentId: event.target.value }))} placeholder="Giấy tờ" />
                  </div>
                  <button className="primary-button" onClick={savePassenger}>
                    <Save size={18} /> Lưu hành khách
                  </button>
                  <div className="trip-list">
                    {passengers.map((item) => (
                      <div className="ticket-card" key={item.id}>
                        <strong>{item.fullName}</strong>
                        <p>{item.phone} - {item.email}</p>
                        <p className="muted">{item.documentId || "Chưa có giấy tờ"}</p>
                        <button className="ghost-button" onClick={() => deletePassenger(item.id)}>
                          <Trash2 size={16} /> Xóa
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Lịch sử booking</h2>
                <p>Booking được tạo khi checkout bằng tài khoản customer.</p>
              </div>
              <div className="panel-body stack">
                {bookings.length === 0 && <div className="empty">Chưa có booking nào gắn với tài khoản này.</div>}
                {bookings.map((booking) => (
                  <article className="ticket-card" key={booking.code}>
                    <span className="badge status">{booking.status}</span>
                    <h3>{booking.code}</h3>
                    <p>{booking.routeName} - {shortDateTime(booking.departureTime)}</p>
                    <p>{booking.seatIds.join(", ")} - {money(booking.totalAmount)}</p>
                    {!["CANCELLED", "CHECKED_IN", "COMPLETED"].includes(booking.status) && (
                      <button className="danger-button" onClick={() => cancelBooking(booking)}>
                        <XCircle size={18} /> Hủy booking
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </SiteChrome>
  );
}
