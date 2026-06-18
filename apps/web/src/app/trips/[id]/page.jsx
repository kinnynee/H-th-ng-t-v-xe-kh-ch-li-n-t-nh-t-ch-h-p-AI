import Link from 'next/link';
import SeatMap from '../../../components/SeatMap';

const mockTripById = {
  'trip-001': {
    id: 'trip-001',
    operator: 'Nhà xe Sao Mai',
    route: 'Hà Nội - Hải Phòng',
    departTime: '07:30',
    arriveTime: '12:45',
    price: 320000,
    seatsLeft: 12,
    bookingCode: 'BK001',
    notes: 'Xe giường nằm tiêu chuẩn, có điều hòa.',
  },
  'trip-002': {
    id: 'trip-002',
    operator: 'Nhà xe Hoàng Long',
    route: 'Hà Nội - Nam Định',
    departTime: '09:00',
    arriveTime: '14:15',
    price: 280000,
    seatsLeft: 8,
    bookingCode: 'BK002',
    notes: 'Xe phù hợp cho chuyến đi ban ngày.',
  },
};

export default function TripDetailPage({ params }) {
  const trip = mockTripById[params.id] || {
    id: params.id,
    operator: 'Nhà xe demo',
    route: 'Tuyến mock',
    departTime: '08:00',
    arriveTime: '12:00',
    price: 250000,
    seatsLeft: 10,
    bookingCode: 'BK-DEMO',
    notes: 'Dữ liệu tạm thời cho skeleton.',
  };

  return (
    <main className="page-stack">
      <section className="card">
        <p className="eyebrow">Chi tiết chuyến</p>
        <h1>{trip.operator}</h1>
        <div className="detail-grid">
          <div>
            <span className="muted">Tuyến</span>
            <strong>{trip.route}</strong>
          </div>
          <div>
            <span className="muted">Giờ đi</span>
            <strong>{trip.departTime}</strong>
          </div>
          <div>
            <span className="muted">Giờ đến</span>
            <strong>{trip.arriveTime}</strong>
          </div>
          <div>
            <span className="muted">Giá vé</span>
            <strong>{trip.price.toLocaleString('vi-VN')} đ</strong>
          </div>
          <div>
            <span className="muted">Ghế còn lại</span>
            <strong>{trip.seatsLeft}</strong>
          </div>
        </div>
        <p>{trip.notes}</p>
        <p className="todo-note">TODO: gọi GraphQL getTripDetail và mutation holdSeat sau.</p>
      </section>

      <section className="card">
        <h2>Chọn ghế</h2>
        <SeatMap />
      </section>

      <div>
        <Link className="button" href={`/booking/${trip.bookingCode}`}>
          Tiếp tục đặt vé
        </Link>
      </div>
    </main>
  );
}
