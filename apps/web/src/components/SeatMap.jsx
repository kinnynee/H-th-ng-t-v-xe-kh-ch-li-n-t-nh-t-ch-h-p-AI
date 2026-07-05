'use client';

import { useEffect, useMemo, useState } from 'react';

const MAX_SELECTED_SEATS = 4;

function buildSeats(seatCount, bookedSeats) {
  return Array.from({ length: seatCount }, (_, index) => {
    const seatNumber = index + 1;
    const id = `S${String(seatNumber).padStart(2, '0')}`;

    return {
      id,
      status: bookedSeats.includes(id) ? 'booked' : 'available',
    };
  });
}

export default function SeatMap({ seatCount = 20, bookedSeats = [], onChange }) {
  const [selectedSeats, setSelectedSeats] = useState([]);
  const seats = useMemo(() => buildSeats(seatCount, bookedSeats), [seatCount, bookedSeats]);

  useEffect(() => {
    onChange?.(selectedSeats);
  }, [onChange, selectedSeats]);

  const toggleSeat = (seat) => {
    if (seat.status === 'booked') return;

    setSelectedSeats((current) => {
      if (current.includes(seat.id)) {
        return current.filter((seatId) => seatId !== seat.id);
      }

      if (current.length >= MAX_SELECTED_SEATS) {
        return current;
      }

      return [...current, seat.id];
    });
  };

  return (
    <div>
      <div className="seat-legend" aria-label="Chú thích trạng thái ghế">
        <span>
          <i className="seat-dot seat-dot--available" /> Trống
        </span>
        <span>
          <i className="seat-dot seat-dot--selected" /> Đang chọn
        </span>
        <span>
          <i className="seat-dot seat-dot--booked" /> Đã đặt
        </span>
      </div>

      <div className="seat-map">
        {seats.map((seat) => {
          const isSelected = selectedSeats.includes(seat.id);
          const isBooked = seat.status === 'booked';
          const className = isBooked
            ? 'seat seat--booked'
            : isSelected
              ? 'seat seat--selected'
              : 'seat seat--available';
          const isSelectionFull = selectedSeats.length >= MAX_SELECTED_SEATS && !isSelected;

          return (
            <button
              key={seat.id}
              type="button"
              className={className}
              onClick={() => toggleSeat(seat)}
              disabled={isBooked || isSelectionFull}
              aria-pressed={isSelected}
            >
              {seat.id}
            </button>
          );
        })}
      </div>

      <p className="seat-note">
        Ghế đã chọn: <strong>{selectedSeats.length ? selectedSeats.join(', ') : 'chưa có'}</strong>
      </p>
      <p className="seat-note">Bạn có thể chọn tối đa {MAX_SELECTED_SEATS} ghế.</p>
    </div>
  );
}
