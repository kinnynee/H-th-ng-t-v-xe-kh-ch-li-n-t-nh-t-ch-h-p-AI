"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bus, CalendarDays, Clock3, Headphones, MapPin, Search, ShieldCheck, SlidersHorizontal, Ticket, UsersRound, Zap } from "lucide-react";
import ChatWidget from "../components/ChatWidget";
import SiteChrome from "../components/SiteChrome";
import { gql, money, shortDateTime, todayISO } from "../lib/graphql";
import {
  hasAdvancedSearch,
  SEARCH_FORM_FIELDS,
  searchFormFromSearch,
  searchFormUrl
} from "../lib/search-url";

const CATALOG = `
query Catalog {
  catalog {
    locations { id name stations }
    operators { id name hotline }
    vehicles { id plate type seatCount layout }
  }
  routes { id from to distanceKm durationMinutes pickup dropoff cancellationPolicy }
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

function submittedSearchForm(formElement, currentForm) {
  const data = new FormData(formElement);
  return Object.fromEntries(SEARCH_FORM_FIELDS.map((key) => [key, String(data.get(key) ?? currentForm[key] ?? "")]));
}

function defaultSearchForm() {
  return {
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
  };
}

export default function HomePage() {
  const [catalog, setCatalog] = useState({ locations: [], operators: [], vehicles: [], routes: [] });
  const [form, setForm] = useState(defaultSearchForm);
  const [result, setResult] = useState({ trips: [], suggestionDate: null, cache: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const searchRequestRef = useRef(0);

  const locationNames = useMemo(
    () => [...new Set(catalog.locations.flatMap((item) => [item.name, ...(item.stations ?? [])]))],
    [catalog]
  );

  async function loadCatalog() {
    const data = await gql(CATALOG);
    setCatalog({ ...data.catalog, routes: data.routes });
  }

  async function search(nextForm = form) {
    const requestId = ++searchRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const input = {
        ...nextForm,
        maxPrice: nextForm.maxPrice ? Number(nextForm.maxPrice) : undefined,
        minSeats: nextForm.minSeats ? Number(nextForm.minSeats) : undefined
      };
      const data = await gql(SEARCH, { input });
      if (requestId === searchRequestRef.current) setResult(data.searchTrips);
    } catch (err) {
      if (requestId === searchRequestRef.current) setError(err.message);
    } finally {
      if (requestId === searchRequestRef.current) setLoading(false);
    }
  }

  function writeSearchUrl(nextForm, mode = "push") {
    const nextUrl = searchFormUrl(window.location.pathname, nextForm);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl === currentUrl) return;
    window.history[`${mode}State`]({ searchForm: nextForm }, "", nextUrl);
  }

  function applySearch(nextForm, mode = "push") {
    setForm(nextForm);
    setShowAdvanced(hasAdvancedSearch(nextForm));
    writeSearchUrl(nextForm, mode);
    search(nextForm);
  }

  useEffect(() => {
    const defaults = defaultSearchForm();
    const initialForm = searchFormFromSearch(window.location.search, defaults);
    setForm(initialForm);
    setShowAdvanced(hasAdvancedSearch(initialForm));
    writeSearchUrl(initialForm, "replace");
    loadCatalog().catch((err) => setError(err.message));
    search(initialForm).catch((err) => setError(err.message));

    function restoreSearchFromHistory() {
      const restoredForm = searchFormFromSearch(window.location.search, defaults);
      setForm(restoredForm);
      setShowAdvanced(hasAdvancedSearch(restoredForm));
      search(restoredForm).catch((err) => setError(err.message));
    }

    window.addEventListener("popstate", restoreSearchFromHistory);
    return () => window.removeEventListener("popstate", restoreSearchFromHistory);
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function choosePopularRoute(route) {
    const nextForm = { ...form, from: route.from, to: route.to };
    applySearch(nextForm);
    window.requestAnimationFrame(() => document.querySelector(".results-area")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <SiteChrome>
      <main className="page stack home-page">
        <section className="customer-hero">
          <div>
            <span className="customer-eyebrow">VÉ XE LIÊN TỈNH AI</span>
            <h1>Chất lượng cho mọi hành trình</h1>
            <p>Đặt vé nhanh, chọn ghế trực tiếp và quản lý toàn bộ chuyến đi trên một nền tảng.</p>
          </div>
          <div className="customer-trust-list" aria-label="Cam kết dịch vụ">
            <span><ShieldCheck size={17} /> Giao dịch an toàn</span>
            <span><Zap size={17} /> Ghế cập nhật tức thời</span>
            <span><Headphones size={17} /> Đồng hành 24/7</span>
          </div>
        </section>

        <div className="split search-layout">
        <aside className="panel search-panel">
          <div className="panel-header">
            <h1>Tìm chuyến xe</h1>
            <p>Một chiều · Chọn điểm đi, điểm đến và ngày khởi hành.</p>
          </div>
          <div className="panel-body">
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                const nextForm = submittedSearchForm(event.currentTarget, form);
                applySearch(nextForm);
              }}
            >
              <datalist id="locations">
                {locationNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <label className="field">
                <span>Điểm đi</span>
                <input className="input" name="from" list="locations" value={form.from} onChange={(event) => update("from", event.target.value)} />
              </label>
              <label className="field">
                <span>Điểm đến</span>
                <input className="input" name="to" list="locations" value={form.to} onChange={(event) => update("to", event.target.value)} />
              </label>
              <label className="field">
                <span>Ngày đi</span>
                <input className="input" name="date" type="date" min={todayISO(0)} value={form.date} onChange={(event) => update("date", event.target.value)} />
              </label>
              <button className="filter-toggle" type="button" onClick={() => setShowAdvanced((current) => !current)} aria-expanded={showAdvanced}>
                <SlidersHorizontal size={17} /> Bộ lọc nâng cao
                <span>{showAdvanced ? "Thu gọn" : "Mở"}</span>
              </button>
              {showAdvanced && (
                <div className="advanced-filters">
                  <div className="two-cols">
                    <label className="field">
                      <span>Từ giờ</span>
                      <input className="input" name="timeFrom" type="time" value={form.timeFrom} onChange={(event) => update("timeFrom", event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Đến giờ</span>
                      <input className="input" name="timeTo" type="time" value={form.timeTo} onChange={(event) => update("timeTo", event.target.value)} />
                    </label>
                  </div>
                  <label className="field">
                    <span>Giá tối đa</span>
                    <input className="input" name="maxPrice" inputMode="numeric" value={form.maxPrice} onChange={(event) => update("maxPrice", event.target.value)} placeholder="450000" />
                  </label>
                  <label className="field">
                    <span>Nhà xe</span>
                    <select className="select" name="operator" value={form.operator} onChange={(event) => update("operator", event.target.value)}>
                      <option value="">Tất cả nhà xe</option>
                      {catalog.operators.map((operator) => (
                        <option key={operator.id} value={operator.id}>{operator.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Loại xe</span>
                    <select className="select" name="busType" value={form.busType} onChange={(event) => update("busType", event.target.value)}>
                      <option value="">Tất cả loại xe</option>
                      {[...new Set(catalog.vehicles.map((vehicle) => vehicle.type))].map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Ghế trống tối thiểu</span>
                    <input className="input" name="minSeats" inputMode="numeric" value={form.minSeats} onChange={(event) => update("minSeats", event.target.value)} placeholder="2" />
                  </label>
                  <label className="field">
                    <span>Sắp xếp</span>
                    <select className="select" name="sort" value={form.sort} onChange={(event) => update("sort", event.target.value)}>
                      <option value="DEPARTURE_ASC">Giờ đi sớm nhất</option>
                      <option value="PRICE_ASC">Giá thấp nhất</option>
                      <option value="DURATION_ASC">Thời gian ngắn nhất</option>
                    </select>
                  </label>
                </div>
              )}
              <button className="primary-button" type="submit">
                <Search size={18} /> Tìm chuyến
              </button>
            </form>
          </div>
        </aside>

        <section className="results-area">
          <div className="section-title">
            <div>
              <h2>Chuyến phù hợp</h2>
              <p>{loading ? "Đang tìm chuyến phù hợp..." : `${result.trips.length} chuyến cho ${form.from} → ${form.to}`}</p>
            </div>
            <span className="badge integration-badge">
              <span className="pulse-dot" /> Cập nhật trực tiếp
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
          <section className="popular-routes-section">
            <div className="customer-section-heading">
              <span>TUYẾN PHỔ BIẾN</span>
              <h2>Được hành khách tin tưởng lựa chọn</h2>
            </div>
            <div className="popular-route-grid">
              {catalog.routes.slice(0, 6).map((route) => (
                <button className="popular-route-card" type="button" key={route.id} onClick={() => choosePopularRoute(route)}>
                  <div>
                    <small>Tuyến xe</small>
                    <strong>{route.from} <ArrowRight size={16} /> {route.to}</strong>
                  </div>
                  <span>{route.distanceKm} km · {Math.round(route.durationMinutes / 60)} giờ</span>
                </button>
              ))}
            </div>
          </section>

          <section className="customer-quality-section">
            <div className="customer-section-heading">
              <span>CHẤT LƯỢNG LÀ CAM KẾT</span>
              <h2>An tâm trên từng chặng đường</h2>
            </div>
            <div className="quality-metrics">
              <article><UsersRound size={26} /><strong>Phục vụ tận tâm</strong><p>Thông tin hành khách và vé được quản lý tập trung, rõ ràng.</p></article>
              <article><Bus size={26} /><strong>Mạng lưới liên tỉnh</strong><p>Nhiều tuyến đường, nhà xe và loại phương tiện để lựa chọn.</p></article>
              <article><Ticket size={26} /><strong>Vé điện tử tiện lợi</strong><p>Tra cứu vé, trạng thái và chính sách hủy ở mọi thời điểm.</p></article>
            </div>
          </section>
        </section>
        </div>
      </main>
      <ChatWidget />
    </SiteChrome>
  );
}
