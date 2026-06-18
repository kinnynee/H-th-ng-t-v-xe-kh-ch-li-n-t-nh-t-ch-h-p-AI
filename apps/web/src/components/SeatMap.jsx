'use client';

import { useState } from 'react';

const seats = Array.from({ length: 20 }, (_, index) => {
  const seatNumber = index + 1;
  return {
    id: `S${String(seatNumber).padStart(2, '0')}`,
    booked: seatNumber % 5 === 0,
  };
});

export default function SeatMap() {
  const [selectedSeats, setSelectedSeats] = useState([]);

  const toggleSeat = (seat) => {
    if (seat.booked) return;

    setSelectedSeats((current) =>
      current.includes(seat.id)
        ? current.filter((seatId) => seatId !== seat.id)
        : [...current, seat.id]
    );
  };

  return (
    <div>
      <div className="seat-map">
        {seats.map((seat) => {
          const isSelected = selectedSeats.includes(seat.id);
          const className = seat.booked
            ? 'seat seat--booked'
            : isSelected
              ? 'seat seat--selected'
              : 'seat seat--available';

          return (
            <button
              key={seat.id}
              type="button"
              className={className}
              onClick={() => toggleSeat(seat)}
              disabled={seat.booked}
            >
              {seat.id}
            </button>
          );
        })}
      </div>
      <p className="seat-note">
        TODO: Ghế đã chọn: {selectedSeats.length ? selectedSeats.join(', ') : 'chưa có'}
      </p>
      <p className="seat-note">TODO: kết nối holdSeat sau.</p>
    </div>
  );
}
