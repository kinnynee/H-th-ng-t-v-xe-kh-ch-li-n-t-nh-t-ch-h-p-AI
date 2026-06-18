import Link from 'next/link';

export default function TripCard({ trip }) {
  return (
    <article className="trip-card">
      <div className="trip-card__content">
        <p className="eyebrow">{trip.operator}</p>
        <h3>
          {trip.from} - {trip.to}
        </h3>
        <div className="trip-meta">
          <span>Giờ đi: {trip.departTime}</span>
          <span>Giờ đến: {trip.arriveTime}</span>
          <span>Giá: {trip.price.toLocaleString('vi-VN')} đ</span>
          <span>Còn {trip.seatsLeft} ghế</span>
        </div>
      </div>
      <Link className="button button--secondary" href={`/trips/${trip.id}`}>
        Xem chi tiết
      </Link>
    </article>
  );
}
