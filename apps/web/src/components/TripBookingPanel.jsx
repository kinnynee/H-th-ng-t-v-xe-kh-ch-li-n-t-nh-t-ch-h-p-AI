'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import SeatMap from './SeatMap';

const initialPassenger = {
  name: '',
  phone: '',
  email: '',
};

function validatePassenger(passenger, selectedSeats) {
  const errors = {};

  if (!passenger.name.trim()) {
    errors.name = 'Vui lòng nhập họ tên.';
  }

  if (!passenger.phone.trim()) {
    errors.phone = 'Vui lòng nhập số điện thoại.';
  } else if (!/^[0-9+\s.-]{9,15}$/.test(passenger.phone.trim())) {
    errors.phone = 'Số điện thoại chưa đúng định dạng.';
  }

  if (!passenger.email.trim()) {
    errors.email = 'Vui lòng nhập email.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(passenger.email.trim())) {
    errors.email = 'Email chưa đúng định dạng.';
  }

  if (!selectedSeats.length) {
    errors.seats = 'Vui lòng chọn ít nhất 1 ghế.';
  }

  return errors;
}

export default function TripBookingPanel({ trip }) {
  const router = useRouter();
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [passenger, setPassenger] = useState(initialPassenger);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const errors = useMemo(
    () => validatePassenger(passenger, selectedSeats),
    [passenger, selectedSeats]
  );
  const totalPrice = selectedSeats.length * trip.price;

  const shouldShowError = (field) => submitted || touched[field];

  const handleChange = (event) => {
    const { name, value } = event.target;
    setPassenger((current) => ({ ...current, [name]: value }));
  };

  const handleBlur = (event) => {
    const { name } = event.target;
    setTouched((current) => ({ ...current, [name]: true }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(true);

    if (Object.keys(errors).length) return;

    const query = new URLSearchParams({
      tripId: trip.id,
      seats: selectedSeats.join(','),
      name: passenger.name.trim(),
      phone: passenger.phone.trim(),
      email: passenger.email.trim(),
    });

    router.push(`/booking/${trip.bookingCode}?${query.toString()}`);
  };

  return (
    <form className="page-stack" onSubmit={handleSubmit}>
      <section className="card">
        <h2>Chọn ghế</h2>
        <SeatMap
          seatCount={trip.seatCount}
          bookedSeats={trip.bookedSeats}
          onChange={setSelectedSeats}
        />
        {shouldShowError('seats') && errors.seats ? (
          <p className="field-error">{errors.seats}</p>
        ) : null}
      </section>

      <section className="booking-summary">
        <div>
          <p className="eyebrow">Tạm tính</p>
          <h2>{totalPrice.toLocaleString('vi-VN')} đ</h2>
          <p className="muted">
            {selectedSeats.length} ghế x {trip.price.toLocaleString('vi-VN')} đ
          </p>
        </div>
        <div>
          <span className="muted">Ghế đã chọn</span>
          <strong>{selectedSeats.length ? selectedSeats.join(', ') : 'Chưa chọn'}</strong>
        </div>
      </section>

      <section className="card">
        <h2>Thông tin hành khách</h2>
        <div className="passenger-form">
          <label>
            Họ tên
            <input
              aria-invalid={Boolean(errors.name)}
              name="name"
              value={passenger.name}
              onBlur={handleBlur}
              onChange={handleChange}
              placeholder="Trần Trung Kiên"
            />
            {shouldShowError('name') && errors.name ? (
              <span className="field-error">{errors.name}</span>
            ) : null}
          </label>
          <label>
            Số điện thoại
            <input
              aria-invalid={Boolean(errors.phone)}
              name="phone"
              value={passenger.phone}
              onBlur={handleBlur}
              onChange={handleChange}
              placeholder="0901234567"
            />
            {shouldShowError('phone') && errors.phone ? (
              <span className="field-error">{errors.phone}</span>
            ) : null}
          </label>
          <label>
            Email
            <input
              aria-invalid={Boolean(errors.email)}
              name="email"
              type="email"
              value={passenger.email}
              onBlur={handleBlur}
              onChange={handleChange}
              placeholder="kien@example.com"
            />
            {shouldShowError('email') && errors.email ? (
              <span className="field-error">{errors.email}</span>
            ) : null}
          </label>
        </div>
      </section>

      <div>
        <button className="button" type="submit">
          Tiếp tục đặt vé
        </button>
      </div>
    </form>
  );
}
