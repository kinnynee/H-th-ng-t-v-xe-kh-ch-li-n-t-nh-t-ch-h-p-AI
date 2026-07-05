import TripCard from '../../../../components/TripCard';
import { mockTrips, normalizeLocation } from '../../../../lib/mockTrips';

function sortTrips(trips, sort) {
  return [...trips].sort((firstTrip, secondTrip) => {
    if (sort === 'price') {
      return firstTrip.price - secondTrip.price;
    }

    return firstTrip.departTime.localeCompare(secondTrip.departTime);
  });
}

function getQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RouteTripsPage({ params, searchParams }) {
  const routeParams = await params;
  const query = await searchParams;
  const from = decodeURIComponent(routeParams.from || 'Điểm đi');
  const to = decodeURIComponent(routeParams.to || 'Điểm đến');
  const date = getQueryValue(query?.date) || '';
  const sort = getQueryValue(query?.sort) === 'price' ? 'price' : 'time';

  const filteredTrips = mockTrips.filter((trip) => {
    const matchesFrom = normalizeLocation(trip.from) === normalizeLocation(from);
    const matchesTo = normalizeLocation(trip.to) === normalizeLocation(to);
    const matchesDate = date ? trip.date === date : true;

    return matchesFrom && matchesTo && matchesDate;
  });
  const trips = sortTrips(filteredTrips, sort);

  return (
    <main className="page-stack">
      <section className="card">
        <p className="eyebrow">Danh sách chuyến</p>
        <h1>
          {from} - {to}
        </h1>
        <p className="muted">{date ? `Ngày đi: ${date}` : 'Chưa chọn ngày đi'}</p>
      </section>

      <form className="trip-toolbar">
        <input type="hidden" name="date" value={date} />
        <label>
          Sắp xếp
          <select name="sort" defaultValue={sort}>
            <option value="time">Giờ đi sớm nhất</option>
            <option value="price">Giá thấp nhất</option>
          </select>
        </label>
        <button className="button button--secondary" type="submit">
          Áp dụng
        </button>
      </form>

      {trips.length ? (
        <section className="list-stack">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </section>
      ) : (
        <section className="empty-state">
          <p className="eyebrow">Không có chuyến phù hợp</p>
          <h2>Chưa tìm thấy chuyến cho tuyến này</h2>
          <p className="muted">Hãy thử đổi ngày đi hoặc kiểm tra lại điểm đi, điểm đến.</p>
        </section>
      )}
    </main>
  );
}
