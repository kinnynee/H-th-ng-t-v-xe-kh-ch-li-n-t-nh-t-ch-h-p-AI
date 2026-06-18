import TripCard from '../../../../components/TripCard';

const mockTrips = (from, to) => [
  {
    id: 'trip-001',
    operator: 'Nhà xe Sao Mai',
    from,
    to,
    departTime: '07:30',
    arriveTime: '12:45',
    price: 320000,
    seatsLeft: 12,
  },
  {
    id: 'trip-002',
    operator: 'Nhà xe Hoàng Long',
    from,
    to,
    departTime: '09:00',
    arriveTime: '14:15',
    price: 280000,
    seatsLeft: 8,
  },
  {
    id: 'trip-003',
    operator: 'Nhà xe An Tâm',
    from,
    to,
    departTime: '18:20',
    arriveTime: '23:30',
    price: 350000,
    seatsLeft: 5,
  },
];

export default function RouteTripsPage({ params }) {
  const from = decodeURIComponent(params.from || 'Điểm đi');
  const to = decodeURIComponent(params.to || 'Điểm đến');
  const trips = mockTrips(from, to);

  return (
    <main className="page-stack">
      <section className="card">
        <p className="eyebrow">Danh sách chuyến</p>
        <h1>
          {from} - {to}
        </h1>
        <p className="muted">TODO: kết nối GraphQL searchTrips sau.</p>
      </section>

      <section className="list-stack">
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} />
        ))}
      </section>
    </main>
  );
}
