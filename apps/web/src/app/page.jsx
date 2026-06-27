"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bus, CalendarDays, Clock3, MapPin, Search, SlidersHorizontal, Ticket } from "lucide-react";
import ChatWidget from "../components/ChatWidget";
import SiteChrome from "../components/SiteChrome";
import { gql, money, shortDateTime, todayISO } from "../lib/graphql";

const CATALOG = `
query Catalog {
  catalog {
    locations { id name stations }
    operators { id name hotline }
    vehicles { id plate type seatCount layout }
  }
}`;

const SEARCH = `
query Search($input: SearchTripsInput!) {
  searchTrips(input: $input) {
    cache
    suggestionDate
    trips {
      id from to pickup dropoff operatorName busType availableSeats
      departureTime arrivalTime durationMinutes price status
    }
  }
}`;

export default function HomePage() {
  const [catalog, setCatalog] = useState({ locations: [], operators: [], vehicles: [] });
  const [form, setForm] = useState({
    from: "TP.HCM",
    to: "Đà Lạt",
    date: todayISO(0),
    sort: "DEPARTURE_ASC",
    timeFrom: "",
    timeTo: "",
    maxPrice: "",
    operator: "",
    busType: "",
    minSeats: ""
  });
  const [result, setResult] = useState({ trips: [], suggestionDate: null, cache: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const locationNames = useMemo(() => catalog.locations.map((item) => item.name), [catalog]);

  async function loadCatalog() {
    const data = await gql(CATALOG);
    setCatalog(data.catalog);
  }

  async function search(nextForm = form) {
    setLoading(true);
    setError("");
    try {
      const input = {
        ...nextForm,
        maxPrice: nextForm.maxPrice ? Number(nextForm.maxPrice) : undefined,
        minSeats: nextForm.minSeats ? Number(nextForm.minSeats) : undefined
      };
      const data = await gql(SEARCH, { input });
      setResult(data.searchTrips);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCatalog().catch((err) => setError(err.message));
    search().catch((err) => setError(err.message));
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <SiteChrome>
      <main className="page split">
        <aside className="panel">
          <div className="panel-header">
            <h1>Tìm chuyến xe</h1>
            <p>Chọn tuyến, ngày đi và bộ lọc phù hợp.</p>
          </div>
          <div className="panel-body">
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                search();
              }}
            >
              <datalist id="locations">
                {locationNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <label className="field">
                <span>Điểm đi</span>
                <input className="input" list="locations" value={form.from} onChange={(event) => update("from", event.target.value)} />
              </label>
              <label className="field">
                <span>Điểm đến</span>
                <input className="input" list="locations" value={form.to} onChange={(event) => update("to", event.target.value)} />
              </label>
              <label className="field">
                <span>Ngày đi</span>
                <input className="input" type="date" value={form.date} onChange={(event) => update("date", event.target.value)} />
              </label>
              <div className="two-cols">
                <label className="field">
                  <span>Từ giờ</span>
                  <input className="input" type="time" value={form.timeFrom} onChange={(event) => update("timeFrom", event.target.value)} />
                </label>
                <label className="field">
                  <span>Đến giờ</span>
                  <input className="input" type="time" value={form.timeTo} onChange={(event) => update("timeTo", event.target.value)} />
                </label>
              </div>
              <label className="field">
                <span>Giá tối đa</span>
                <input className="input" inputMode="numeric" value={form.maxPrice} onChange={(event) => update("maxPrice", event.target.value)} placeholder="450000" />
              </label>
              <label className="field">
                <span>Nhà xe</span>
                <select className="select" value={form.operator} onChange={(event) => update("operator", event.target.value)}>
                  <option value="">Tất cả nhà xe</option>
                  {catalog.operators.map((operator) => (
                    <option key={operator.id} value={operator.id}>{operator.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Loại xe</span>
                <select className="select" value={form.busType} onChange={(event) => update("busType", event.target.value)}>
                  <option value="">Tất cả loại xe</option>
                  {[...new Set(catalog.vehicles.map((vehicle) => vehicle.type))].map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Ghế trống tối thiểu</span>
                <input className="input" inputMode="numeric" value={form.minSeats} onChange={(event) => update("minSeats", event.target.value)} placeholder="2" />
              </label>
              <label className="field">
                <span>Sắp xếp</span>
                <select className="select" value={form.sort} onChange={(event) => update("sort", event.target.value)}>
                  <option value="DEPARTURE_ASC">Giờ đi sớm nhất</option>
                  <option value="PRICE_ASC">Giá thấp nhất</option>
                  <option value="DURATION_ASC">Thời gian ngắn nhất</option>
                </select>
              </label>
              <button className="primary-button" type="submit">
                <Search size={18} /> Tìm chuyến
              </button>
            </form>
          </div>
        </aside>

        <section>
          <div className="section-title">
            <div>
              <h2>Chuyến phù hợp</h2>
              <p>{loading ? "Đang tải..." : `${result.trips.length} chuyến, cache ${result.cache || "N/A"}`}</p>
            </div>
            <span className="badge">
              <SlidersHorizontal size={14} /> GraphQL Gateway
            </span>
          </div>

          {error && <div className="empty">{error}</div>}
          {!error && result.trips.length === 0 && (
            <div className="empty">
              Chưa có chuyến phù hợp.
              {result.suggestionDate ? ` Gợi ý ngày gần nhất: ${result.suggestionDate}.` : ""}
            </div>
          )}
          <div className="trip-list">
            {result.trips.map((trip) => (
              <article className="trip-card" key={trip.id}>
                <div className="trip-main">
                  <div className="trip-title">
                    {trip.from} <ArrowRight size={18} /> {trip.to}
                    <span className="badge status-good">{trip.availableSeats} ghế trống</span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-item">
                      <CalendarDays size={16} /> {shortDateTime(trip.departureTime)}
                    </span>
                    <span className="meta-item">
                      <Clock3 size={16} /> {Math.round(trip.durationMinutes / 60)} giờ
                    </span>
                    <span className="meta-item">
                      <Bus size={16} /> {trip.operatorName}, {trip.busType}
                    </span>
                  </div>
                  <div className="meta-row">
                    <span className="meta-item">
                      <MapPin size={16} /> {trip.pickup}
                    </span>
                    <span className="meta-item">
                      <Ticket size={16} /> {trip.dropoff}
                    </span>
                  </div>
                </div>
                <div className="price-box">
                  <div className="price">{money(trip.price)}</div>
                  <Link href={`/trips/${trip.id}`} className="primary-button">
                    Chọn ghế
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <ChatWidget />
    </SiteChrome>
  );
}
