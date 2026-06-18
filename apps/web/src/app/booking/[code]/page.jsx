const mockBooking = {
  code: 'BK001',
  passenger: 'Nguyen Van A',
  route: 'Hà Nội - Hải Phòng',
  seat: 'A05',
  paymentStatus: 'Đã thanh toán',
};

export default function BookingPage({ params }) {
  const booking = { ...mockBooking, code: params.code };

  return (
    <main className="page-stack">
      <section className="card">
        <p className="eyebrow">Tra cứu vé</p>
        <h1>Mã vé {booking.code}</h1>
        <div className="detail-grid">
          <div>
            <span className="muted">Hành khách</span>
            <strong>{booking.passenger}</strong>
          </div>
          <div>
            <span className="muted">Tuyến</span>
            <strong>{booking.route}</strong>
          </div>
          <div>
            <span className="muted">Ghế</span>
            <strong>{booking.seat}</strong>
          </div>
          <div>
            <span className="muted">Trạng thái thanh toán</span>
            <strong>{booking.paymentStatus}</strong>
          </div>
        </div>
        <p className="todo-note">TODO: gọi GraphQL getBookingStatus.</p>
      </section>
    </main>
  );
}
