import Link from "next/link";
import SiteChrome from "../../../../components/SiteChrome";
import { gql, money, shortDateTime, todayISO } from "../../../../lib/graphql";

const SEARCH = `
query Search($input: SearchTripsInput!) {
  searchTrips(input: $input) {
    trips {
      id from to operatorName busType departureTime price availableSeats
    }
  }
}`;

function titleCaseSlug(slug) {
  const map = {
    hcm: "TP.HCM",
    "tp-hcm": "TP.HCM",
    "da-lat": "Đà Lạt",
    "nha-trang": "Nha Trang",
    "can-tho": "Cần Thơ",
    "da-nang": "Đà Nẵng",
    "ha-noi": "Hà Nội"
  };
  return map[slug] ?? slug.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export async function generateMetadata({ params }) {
  const resolved = await params;
  const from = titleCaseSlug(resolved.from);
  const to = titleCaseSlug(resolved.to);
  return {
    title: `Vé xe ${from} đi ${to} ngày ${todayISO(0)}`,
    description: `Tìm chuyến xe ${from} đi ${to}, chọn ghế và đặt vé điện tử.`
  };
}

export default async function RouteSeoPage({ params }) {
  const resolved = await params;
  const from = titleCaseSlug(resolved.from);
  const to = titleCaseSlug(resolved.to);
  const data = await gql(SEARCH, { input: { from, to, date: todayISO(0), sort: "DEPARTURE_ASC" } });

  return (
    <SiteChrome>
      <main className="page stack">
        <section className="section-title">
          <div>
            <h1>Vé xe {from} đi {to}</h1>
            <p>Ngày {todayISO(0)}</p>
          </div>
          <Link className="primary-button" href="/">Tìm tuyến khác</Link>
        </section>
        <section className="trip-list">
          {data.searchTrips.trips.map((trip) => (
            <article className="trip-card" key={trip.id}>
              <div>
                <div className="trip-title">{trip.operatorName}</div>
                <div className="meta-row">
                  <span>{shortDateTime(trip.departureTime)}</span>
                  <span>{trip.busType}</span>
                  <span>{trip.availableSeats} ghế trống</span>
                </div>
              </div>
              <div className="price-box">
                <strong className="price">{money(trip.price)}</strong>
                <Link className="primary-button" href={`/trips/${trip.id}`}>Chọn ghế</Link>
              </div>
            </article>
          ))}
          {data.searchTrips.trips.length === 0 && <div className="empty">Chưa có chuyến trong ngày này.</div>}
        </section>
      </main>
    </SiteChrome>
  );
}
