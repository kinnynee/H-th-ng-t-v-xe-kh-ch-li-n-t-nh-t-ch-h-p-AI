"use client";

import { useEffect, useState } from "react";
import { BarChart3, BusFront, CheckCircle2, Lock, LogIn, LogOut, MapPin, Plus, Save, Search, Trash2 } from "lucide-react";
import SiteChrome from "../../components/SiteChrome";
import { gql, money, shortDateTime, todayISO } from "../../lib/graphql";

const ADMIN = `
query Admin($input: SearchTripsInput!) {
  catalog { operators { id name hotline } vehicles { id plate type seatCount layout } }
  stops { id city name }
  routes { id from to distanceKm durationMinutes pickup dropoff cancellationPolicy }
  searchTrips(input: $input) {
    trips { id routeId from to operatorName busType departureTime price status availableSeats }
  }
  adminSummary {
    eventCount
    conversionRate
    revenueByDay { date revenue tickets }
    popularRoutes { route searches tickets }
  }
  eventLogs(limit: 30) { eventId eventType topic occurredAt payload }
}`;

const LOGIN = `
mutation Login($email: String!, $password: String!) {
  adminLogin(email: $email, password: $password) {
    user { id email role name }
    accessToken
  }
}`;

const CREATE_STOP = `
mutation CreateStop($input: StopInput!) {
  createStop(input: $input) { id city name }
}`;

const UPDATE_STOP = `
mutation UpdateStop($id: ID!, $input: StopInput!) {
  updateStop(id: $id, input: $input) { id city name }
}`;

const DELETE_STOP = `
mutation DeleteStop($id: ID!) {
  deleteStop(id: $id)
}`;

const CREATE_ROUTE = `
mutation CreateRoute($input: RouteInput!) {
  createRoute(input: $input) { id from to distanceKm durationMinutes pickup dropoff cancellationPolicy }
}`;

const UPDATE_ROUTE = `
mutation UpdateRoute($id: ID!, $input: RouteInput!) {
  updateRoute(id: $id, input: $input) { id from to distanceKm durationMinutes pickup dropoff cancellationPolicy }
}`;

const DELETE_ROUTE = `
mutation DeleteRoute($id: ID!) {
  deleteRoute(id: $id)
}`;

const CREATE_TRIP = `
mutation CreateTrip($input: TripInput!) {
  createTrip(input: $input) { id from to departureTime price status }
}`;

const UPDATE_TRIP = `
mutation UpdateTrip($id: ID!, $input: TripInput!) {
  updateTrip(id: $id, input: $input) { id from to departureTime price status }
}`;

const DELETE_TRIP = `
mutation DeleteTrip($id: ID!) {
  deleteTrip(id: $id)
}`;

const CREATE_VEHICLE = `
mutation CreateVehicle($input: VehicleInput!) {
  createVehicle(input: $input) { id plate type seatCount layout }
}`;

const UPDATE_VEHICLE = `
mutation UpdateVehicle($id: ID!, $input: VehicleInput!) {
  updateVehicle(id: $id, input: $input) { id plate type seatCount layout }
}`;

const DELETE_VEHICLE = `
mutation DeleteVehicle($id: ID!) {
  deleteVehicle(id: $id)
}`;

const BOOKINGS_BY_TRIP = `
query BookingsByTrip($tripId: ID!) {
  bookingsByTrip(tripId: $tripId) {
    code status customerEmail totalAmount seatIds
    passengers { fullName phone email seatId }
  }
}`;

const STATUS = `
mutation Status($id: ID!, $status: String!) {
  updateTripStatus(id: $id, status: $status) { id status }
}`;

const BLOCK = `
mutation Block($tripId: ID!, $seatIds: [String!]!, $blocked: Boolean!) {
  blockSeats(tripId: $tripId, seatIds: $seatIds, blocked: $blocked) { ok message }
}`;

const CHECKIN = `
mutation CheckIn($codeOrTicket: String!) {
  checkIn(codeOrTicket: $codeOrTicket) { code status }
}`;

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [login, setLogin] = useState({ email: "admin@bus.local", password: "admin123" });
  const [data, setData] = useState(null);
  const [routeForm, setRouteForm] = useState({
    id: "",
    from: "TP.HCM",
    to: "Vũng Tàu",
    distanceKm: 95,
    durationMinutes: 150,
    pickup: "Bến xe Miền Đông",
    dropoff: "Bến xe Vũng Tàu",
    cancellationPolicy: "Hủy trước 4 tiếng hoàn 80%."
  });
  const [tripForm, setTripForm] = useState({
    id: "",
    routeId: "",
    operatorId: "",
    vehicleId: "",
    departureTime: `${todayISO(1)}T09:00:00+07:00`,
    price: 180000,
    status: "ACTIVE"
  });
  const [vehicleForm, setVehicleForm] = useState({
    id: "",
    plate: "51B-999.99",
    type: "Limousine 22 chỗ",
    seatCount: 22,
    layout: "premium"
  });
  const [stopForm, setStopForm] = useState({ id: "", city: "TP.HCM", name: "Bến xe Miền Đông mới" });
  const [ops, setOps] = useState({ tripId: "", seatIds: "A01", codeOrTicket: "" });
  const [tripBookings, setTripBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setIsLoading(true);
    try {
      const result = await gql(ADMIN, { input: { includeInactive: true } });
      setData(result);
      setTripForm((current) => ({
        ...current,
        routeId: current.routeId || result.routes[0]?.id || "",
        operatorId: current.operatorId || result.catalog.operators[0]?.id || "",
        vehicleId: current.vehicleId || result.catalog.vehicles[0]?.id || "",
      }));
      setOps((current) => ({ ...current, tripId: current.tripId || result.searchTrips.trips[0]?.id || "" }));
    } catch (err) {
      setMessage(`Lỗi: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const raw = localStorage.getItem("busAdminUser");
    const token = localStorage.getItem("busAccessToken");
    if (!raw || !token) return;
    try {
      const stored = JSON.parse(raw);
      if (!["ADMIN", "STAFF"].includes(stored.role)) return;
      setUser(stored);
      load().catch((err) => setMessage(`Lỗi: ${err.message}`));
    } catch {
      localStorage.removeItem("busAdminUser");
    }
  }, []);

  async function doLogin() {
    setIsLoading(true);
    try {
      const result = await gql(LOGIN, login);
      localStorage.removeItem("busUser");
      localStorage.setItem("busAccessToken", result.adminLogin.accessToken);
      localStorage.setItem("busAdminUser", JSON.stringify(result.adminLogin.user));
      setUser(result.adminLogin.user);
      setMessage(`Đăng nhập ${result.adminLogin.user.role}`);
      await load();
    } catch (err) {
      setMessage(`Lỗi: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("busAccessToken");
    localStorage.removeItem("busAdminUser");
    setUser(null);
    setData(null);
    setTripBookings([]);
    setMessage("Đã đăng xuất.");
  }

  async function saveStop() {
    if (!stopForm.city.trim() || !stopForm.name.trim()) {
      return setMessage("Lỗi: Vui lòng nhập tỉnh/thành và tên điểm dừng.");
    }
    setIsLoading(true);
    try {
      const input = { city: stopForm.city.trim(), name: stopForm.name.trim() };
      const result = stopForm.id
        ? await gql(UPDATE_STOP, { id: stopForm.id, input })
        : await gql(CREATE_STOP, { input });
      const stop = stopForm.id ? result.updateStop : result.createStop;
      setStopForm({ id: "", city: stop.city, name: "" });
      setMessage(`Đã lưu điểm dừng ${stop.name}`);
      await load();
    } catch (err) {
      setMessage(`Lỗi: ${err.message}`);
      setIsLoading(false);
    }
  }

  function editStop(stop) {
    setStopForm({ id: stop.id, city: stop.city, name: stop.name });
  }

  async function deleteStop(id) {
    try {
      await gql(DELETE_STOP, { id });
      setMessage("Đã xóa điểm dừng.");
      await load();
    } catch (err) {
      setMessage(`Lỗi: ${err.message}`);
    }
  }

  async function createRoute() {
    if (!routeForm.from || !routeForm.to || !routeForm.pickup || !routeForm.dropoff) {
      return setMessage("Lỗi: Vui lòng nhập đầy đủ thông tin tuyến.");
    }
    if (routeForm.distanceKm <= 0 || routeForm.durationMinutes <= 0) {
      return setMessage("Lỗi: Khoảng cách và thời gian phải lớn hơn 0.");
    }
    setIsLoading(true);
    try {
      const { id, ...routeInput } = routeForm;
      const input = { ...routeInput, distanceKm: Number(routeForm.distanceKm), durationMinutes: Number(routeForm.durationMinutes) };
      const result = id ? await gql(UPDATE_ROUTE, { id, input }) : await gql(CREATE_ROUTE, { input });
    const route = id ? result.updateRoute : result.createRoute;
    setRouteForm({
      id: "",
      from: "TP.HCM",
      to: "Vũng Tàu",
      distanceKm: 95,
      durationMinutes: 150,
      pickup: "Bến xe Miền Đông",
      dropoff: "Bến xe Vũng Tàu",
      cancellationPolicy: "Hủy trước 4 tiếng hoàn 80%."
    });
    setMessage(`Đã lưu tuyến ${route.from} - ${route.to}`);
    await load();
    } catch (err) {
      setMessage(`Lỗi: ${err.message}`);
      setIsLoading(false);
    }
  }

  async function createTrip() {
    if (!tripForm.routeId || !tripForm.operatorId || !tripForm.vehicleId) {
      return setMessage("Lỗi: Vui lòng chọn tuyến, nhà xe và xe.");
    }
    if (tripForm.price <= 0) {
      return setMessage("Lỗi: Giá vé phải lớn hơn 0.");
    }
    if (!tripForm.departureTime) {
      return setMessage("Lỗi: Vui lòng nhập thời gian khởi hành.");
    }
    setIsLoading(true);
    try {
      const { id, ...tripInput } = tripForm;
      const input = { ...tripInput, price: Number(tripForm.price) };
      const result = id ? await gql(UPDATE_TRIP, { id, input }) : await gql(CREATE_TRIP, { input });
    const trip = id ? result.updateTrip : result.createTrip;
    setTripForm((current) => ({ ...current, id: "" }));
    setMessage(`Đã lưu chuyến ${trip.id}`);
    await load();
    } catch (err) {
      setMessage(`Lỗi: ${err.message}`);
      setIsLoading(false);
    }
  }

  function editRoute(route) {
    setRouteForm({
      id: route.id,
      from: route.from,
      to: route.to,
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      pickup: route.pickup,
      dropoff: route.dropoff,
      cancellationPolicy: route.cancellationPolicy
    });
  }

  async function deleteRoute(id) {
    await gql(DELETE_ROUTE, { id });
    setMessage("Đã xóa tuyến.");
    await load();
  }

  function editTrip(trip) {
    setTripForm({
      id: trip.id,
      routeId: trip.routeId,
      operatorId: data.catalog.operators.find((operator) => operator.name === trip.operatorName)?.id || data.catalog.operators[0]?.id || "",
      vehicleId: data.catalog.vehicles.find((vehicle) => vehicle.type === trip.busType)?.id || data.catalog.vehicles[0]?.id || "",
      departureTime: trip.departureTime,
      price: trip.price,
      status: trip.status
    });
  }

  async function deleteTrip(id) {
    await gql(DELETE_TRIP, { id });
    setMessage("Đã xóa chuyến.");
    await load();
  }

  async function saveVehicle() {
    if (!vehicleForm.plate || !vehicleForm.type || !vehicleForm.layout) {
      return setMessage("Lỗi: Vui lòng nhập đầy đủ thông tin xe.");
    }
    if (vehicleForm.seatCount <= 0) {
      return setMessage("Lỗi: Số ghế phải lớn hơn 0.");
    }
    setIsLoading(true);
    try {
      const input = { ...vehicleForm, seatCount: Number(vehicleForm.seatCount) };
      const result = vehicleForm.id
        ? await gql(UPDATE_VEHICLE, { id: vehicleForm.id, input })
        : await gql(CREATE_VEHICLE, { input });
    const vehicle = vehicleForm.id ? result.updateVehicle : result.createVehicle;
    setMessage(`Đã lưu xe ${vehicle.plate}`);
    setVehicleForm({ id: "", plate: "51B-999.99", type: "Limousine 22 chỗ", seatCount: 22, layout: "premium" });
    await load();
    } catch (err) {
      setMessage(`Lỗi: ${err.message}`);
      setIsLoading(false);
    }
  }

  function editVehicle(vehicle) {
    setVehicleForm({
      id: vehicle.id,
      plate: vehicle.plate,
      type: vehicle.type,
      seatCount: vehicle.seatCount,
      layout: vehicle.layout
    });
  }

  async function deleteVehicle(id) {
    await gql(DELETE_VEHICLE, { id });
    setMessage("Đã xóa xe.");
    await load();
  }

  async function updateStatus(id, status) {
    await gql(STATUS, { id, status });
    setMessage(`Đã chuyển ${id} sang ${status}`);
    await load();
  }

  async function blockSeats(blocked) {
    const seatIds = ops.seatIds.split(",").map((item) => item.trim()).filter(Boolean);
    const result = await gql(BLOCK, { tripId: ops.tripId, seatIds, blocked });
    setMessage(result.blockSeats.message);
  }

  async function checkIn() {
    const result = await gql(CHECKIN, { codeOrTicket: ops.codeOrTicket });
    setMessage(`Check-in ${result.checkIn.code}: ${result.checkIn.status}`);
  }

  async function loadTripBookings() {
    const result = await gql(BOOKINGS_BY_TRIP, { tripId: ops.tripId });
    setTripBookings(result.bookingsByTrip);
    setMessage(`Đã tải ${result.bookingsByTrip.length} booking của chuyến.`);
  }

  const summary = data?.adminSummary;

  return (
    <SiteChrome>
      <main className="page stack">
        <section className="section-title">
          <div>
            <h1>Vận hành hệ thống</h1>
            <p>{user ? `${user.name} - ${user.role}` : "Đăng nhập admin hoặc staff."}</p>
          </div>
          <div className="meta-row">
            <span className="badge">
              <BarChart3 size={14} /> Analytics
            </span>
            {user && (
              <button className="ghost-button" onClick={logout}>
                <LogOut size={16} /> Đăng xuất
              </button>
            )}
          </div>
        </section>

        {!user && (
          <section className="panel">
            <div className="panel-body two-cols">
              <label className="field">
                <span>Email</span>
                <input className="input" value={login.email} onChange={(event) => setLogin((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label className="field">
                <span>Mật khẩu</span>
                <input className="input" type="password" value={login.password} onChange={(event) => setLogin((current) => ({ ...current, password: event.target.value }))} />
              </label>
              <button className="primary-button" onClick={doLogin}>
                <LogIn size={18} /> Đăng nhập
              </button>
            </div>
          </section>
        )}

        {message && <div className="empty" style={{ color: message.startsWith("Lỗi") ? "var(--danger)" : "var(--success)", borderColor: message.startsWith("Lỗi") ? "var(--danger)" : "var(--success)" }}>{message}</div>}
        {isLoading && <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>Đang tải dữ liệu...</div>}

        {summary && (
          <section className="metrics">
            <div className="metric-card">
              Doanh thu hôm nay
              <strong>{money(summary.revenueByDay.at(-1)?.revenue ?? 0)}</strong>
            </div>
            <div className="metric-card">
              Vé đã bán
              <strong>{summary.revenueByDay.reduce((sum, item) => sum + item.tickets, 0)}</strong>
            </div>
            <div className="metric-card">
              Conversion
              <strong>{Math.round(summary.conversionRate * 100)}%</strong>
            </div>
            <div className="metric-card">
              Event Kafka
              <strong>{summary.eventCount}</strong>
            </div>
          </section>
        )}

        {user && data && (
          <section className="split">
            <div className="stack" style={{ display: user.role === "ADMIN" ? undefined : "none" }}>
              <div className="panel">
                <div className="panel-header">
                  <h2>CRUD điểm dừng</h2>
                </div>
                <div className="panel-body form-grid">
                  <div className="two-cols">
                    <input className="input" value={stopForm.city} onChange={(event) => setStopForm((current) => ({ ...current, city: event.target.value }))} placeholder="Tỉnh/thành" />
                    <input className="input" value={stopForm.name} onChange={(event) => setStopForm((current) => ({ ...current, name: event.target.value }))} placeholder="Tên bến/điểm dừng" />
                  </div>
                  <button className="primary-button" onClick={saveStop} disabled={isLoading}>
                    <MapPin size={18} /> {stopForm.id ? "Cập nhật điểm dừng" : "Tạo điểm dừng"}
                  </button>
                  <div style={{ overflowX: "auto" }}>
                    <table className="table">
                      <thead><tr><th>Tỉnh/thành</th><th>Điểm dừng</th><th></th></tr></thead>
                      <tbody>
                        {data.stops.map((stop) => (
                          <tr key={stop.id}>
                            <td>{stop.city}</td>
                            <td>{stop.name}</td>
                            <td>
                              <button className="ghost-button" onClick={() => editStop(stop)}>Sửa</button>
                              <button className="ghost-button" onClick={() => deleteStop(stop.id)}><Trash2 size={16} /> Xóa</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2>CRUD tuyến</h2>
                </div>
                <div className="panel-body form-grid">
                  <div className="two-cols">
                    <input className="input" value={routeForm.from} onChange={(event) => setRouteForm((current) => ({ ...current, from: event.target.value }))} />
                    <input className="input" value={routeForm.to} onChange={(event) => setRouteForm((current) => ({ ...current, to: event.target.value }))} />
                  </div>
                  <div className="two-cols">
                    <input className="input" type="number" value={routeForm.distanceKm} onChange={(event) => setRouteForm((current) => ({ ...current, distanceKm: event.target.value }))} />
                    <input className="input" type="number" value={routeForm.durationMinutes} onChange={(event) => setRouteForm((current) => ({ ...current, durationMinutes: event.target.value }))} />
                  </div>
                  <input className="input" value={routeForm.pickup} onChange={(event) => setRouteForm((current) => ({ ...current, pickup: event.target.value }))} />
                  <input className="input" value={routeForm.dropoff} onChange={(event) => setRouteForm((current) => ({ ...current, dropoff: event.target.value }))} />
                  <textarea className="textarea" value={routeForm.cancellationPolicy} onChange={(event) => setRouteForm((current) => ({ ...current, cancellationPolicy: event.target.value }))} />
                  <button className="primary-button" onClick={createRoute} disabled={isLoading}>
                    <Plus size={18} /> {routeForm.id ? "Cập nhật tuyến" : "Tạo tuyến"}
                  </button>
                  <div style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr><th>Tuyến</th><th>Km</th><th>Thời gian</th><th></th></tr>
                    </thead>
                    <tbody>
                      {data.routes.map((route) => (
                        <tr key={route.id}>
                          <td>{route.from} - {route.to}</td>
                          <td>{route.distanceKm}</td>
                          <td>{route.durationMinutes} phút</td>
                          <td>
                            <button className="ghost-button" onClick={() => editRoute(route)}>Sửa</button>
                            <button className="ghost-button" onClick={() => deleteRoute(route.id)}>
                              <Trash2 size={16} /> Xóa
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2>Tạo chuyến</h2>
                </div>
                <div className="panel-body form-grid">
                  <select className="select" value={tripForm.routeId} onChange={(event) => setTripForm((current) => ({ ...current, routeId: event.target.value }))}>
                    {data.routes.map((route) => (
                      <option key={route.id} value={route.id}>{route.from} - {route.to}</option>
                    ))}
                  </select>
                  <select className="select" value={tripForm.operatorId} onChange={(event) => setTripForm((current) => ({ ...current, operatorId: event.target.value }))}>
                    {data.catalog.operators.map((operator) => (
                      <option key={operator.id} value={operator.id}>{operator.name}</option>
                    ))}
                  </select>
                  <select className="select" value={tripForm.vehicleId} onChange={(event) => setTripForm((current) => ({ ...current, vehicleId: event.target.value }))}>
                    {data.catalog.vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>{vehicle.type} - {vehicle.plate}</option>
                    ))}
                  </select>
                  <input className="input" value={tripForm.departureTime} onChange={(event) => setTripForm((current) => ({ ...current, departureTime: event.target.value }))} />
                  <input className="input" type="number" value={tripForm.price} onChange={(event) => setTripForm((current) => ({ ...current, price: event.target.value }))} />
                  <button className="primary-button" onClick={createTrip} disabled={isLoading}>
                    <Save size={18} /> {tripForm.id ? "Cập nhật chuyến" : "Lưu chuyến"}
                  </button>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2>CRUD xe</h2>
                </div>
                <div className="panel-body form-grid">
                  <div className="two-cols">
                    <input className="input" value={vehicleForm.plate} onChange={(event) => setVehicleForm((current) => ({ ...current, plate: event.target.value }))} placeholder="Biển số" />
                    <input className="input" value={vehicleForm.type} onChange={(event) => setVehicleForm((current) => ({ ...current, type: event.target.value }))} placeholder="Loại xe" />
                  </div>
                  <div className="two-cols">
                    <input className="input" type="number" value={vehicleForm.seatCount} onChange={(event) => setVehicleForm((current) => ({ ...current, seatCount: event.target.value }))} placeholder="Số ghế" />
                    <input className="input" value={vehicleForm.layout} onChange={(event) => setVehicleForm((current) => ({ ...current, layout: event.target.value }))} placeholder="Layout" />
                  </div>
                  <button className="primary-button" onClick={saveVehicle} disabled={isLoading}>
                    <BusFront size={18} /> {vehicleForm.id ? "Cập nhật xe" : "Tạo xe"}
                  </button>
                  <div style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr><th>Biển số</th><th>Loại xe</th><th>Ghế</th><th></th></tr>
                    </thead>
                    <tbody>
                      {data.catalog.vehicles.map((vehicle) => (
                        <tr key={vehicle.id}>
                          <td>{vehicle.plate}</td>
                          <td>{vehicle.type}</td>
                          <td>{vehicle.seatCount}</td>
                          <td>
                            <button className="ghost-button" onClick={() => editVehicle(vehicle)}>Sửa</button>
                            <button className="ghost-button" onClick={() => deleteVehicle(vehicle.id)}>
                              <Trash2 size={16} /> Xóa
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="stack">
              <div className="panel">
                <div className="panel-header">
                  <h2>Check-in và khóa ghế</h2>
                </div>
                <div className="panel-body form-grid">
                  <select className="select" value={ops.tripId} onChange={(event) => setOps((current) => ({ ...current, tripId: event.target.value }))}>
                    {data.searchTrips.trips.map((trip) => (
                      <option key={trip.id} value={trip.id}>{trip.from} - {trip.to} {shortDateTime(trip.departureTime)}</option>
                    ))}
                  </select>
                  <input className="input" value={ops.seatIds} onChange={(event) => setOps((current) => ({ ...current, seatIds: event.target.value }))} placeholder="A01,A02" />
                  <div className="two-cols">
                    <button className="ghost-button" onClick={() => blockSeats(true)}>
                      <Lock size={18} /> Khóa ghế
                    </button>
                    <button className="ghost-button" onClick={() => blockSeats(false)}>
                      Mở khóa
                    </button>
                  </div>
                  <input className="input" value={ops.codeOrTicket} onChange={(event) => setOps((current) => ({ ...current, codeOrTicket: event.target.value }))} placeholder="Mã booking hoặc mã vé" />
                  <button className="primary-button" onClick={checkIn}>
                    <CheckCircle2 size={18} /> Check-in
                  </button>
                  <button className="ghost-button" onClick={loadTripBookings}>
                    <Search size={18} /> Xem booking chuyến
                  </button>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2>Booking theo chuyến</h2>
                </div>
                <div className="panel-body">
                  {tripBookings.length === 0 && <div className="empty">Chưa tải hoặc chưa có booking.</div>}
                  {tripBookings.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                    <table className="table">
                      <thead>
                        <tr><th>Mã</th><th>Email</th><th>Ghế</th><th>Tổng tiền</th><th>Trạng thái</th></tr>
                      </thead>
                      <tbody>
                        {tripBookings.map((booking) => (
                          <tr key={booking.code}>
                            <td>{booking.code}</td>
                            <td>{booking.customerEmail}</td>
                            <td>{booking.seatIds.join(", ")}</td>
                            <td>{money(booking.totalAmount)}</td>
                            <td>{booking.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2>Top tuyến</h2>
                </div>
                <div className="panel-body">
                  <div style={{ overflowX: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr><th>Tuyến</th><th>Tìm kiếm</th><th>Vé</th></tr>
                    </thead>
                    <tbody>
                      {summary.popularRoutes.map((route) => (
                        <tr key={route.route}><td>{route.route}</td><td>{route.searches}</td><td>{route.tickets}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2>Nhật ký sự kiện</h2>
                </div>
                <div className="panel-body">
                  {data.eventLogs.length === 0 && <div className="empty">Chưa có sự kiện Kafka.</div>}
                  {data.eventLogs.length > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <table className="table">
                        <thead><tr><th>Thời gian</th><th>Topic</th><th>Sự kiện</th></tr></thead>
                        <tbody>
                          {data.eventLogs.map((event) => (
                            <tr key={event.eventId}>
                              <td>{shortDateTime(event.occurredAt)}</td>
                              <td>{event.topic}</td>
                              <td>{event.eventType}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {data && (
          <section className="panel">
            <div className="panel-header">
              <h2>Chuyến đang bán</h2>
            </div>
            <div className="panel-body">
              <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr><th>Tuyến</th><th>Khởi hành</th><th>Nhà xe</th><th>Giá</th><th>Ghế</th><th>Trạng thái</th><th></th></tr>
                </thead>
                <tbody>
                  {data.searchTrips.trips.map((trip) => (
                    <tr key={trip.id}>
                      <td>{trip.from} - {trip.to}</td>
                      <td>{shortDateTime(trip.departureTime)}</td>
                      <td>{trip.operatorName}</td>
                      <td>{money(trip.price)}</td>
                      <td>{trip.availableSeats}</td>
                      <td>{trip.status}</td>
                      <td>
                        <select className="select" value={trip.status} onChange={(event) => updateStatus(trip.id, event.target.value)} aria-label={`Trạng thái chuyến ${trip.id}`}>
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="SUSPENDED">SUSPENDED</option>
                          <option value="DEPARTED">DEPARTED</option>
                          <option value="COMPLETED">COMPLETED</option>
                        </select>
                        {user?.role === "ADMIN" && (
                          <>
                            <button className="ghost-button" onClick={() => editTrip(trip)}>Sửa</button>
                            <button className="ghost-button" onClick={() => deleteTrip(trip.id)}>
                              <Trash2 size={16} /> Xóa
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </section>
        )}
      </main>
    </SiteChrome>
  );
}
