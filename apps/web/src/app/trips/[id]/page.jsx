import TripBookingPanel from '../../../components/TripBookingPanel';
import { getTripById } from '../../../lib/mockTrips';

export default async function TripDetailPage({ params }) {
  const { id } = await params;
  const trip = getTripById(id);

  if (!trip) {
    return (
      <main className="page-stack">
        <section className="empty-state">
          <p className="eyebrow">Không tìm thấy chuyến</p>
          <h1>Chuyến xe không tồn tại</h1>
          <p className="muted">Vui lòng quay lại danh sách chuyến và chọn một chuyến khác.</p>
        </section>
      </main>
    );
  }

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
            <span className="muted">Ngày đi</span>
            <strong>{trip.date}</strong>
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
      </section>

      <TripBookingPanel trip={trip} />
    </main>
  );
}
