function normalizedVehicleType(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function layoutForVehicle(busType) {
  const type = normalizedVehicleType(busType);
  if (type.includes("giuong nam")) return { kind: "sleeper", label: "Giường nằm", pattern: [1, 3] };
  if (type.includes("limousine")) return { kind: "premium", label: "Limousine", pattern: [1, 3] };
  return { kind: "seater", label: "Ghế ngồi", pattern: [1, 2, 4, 5] };
}

function statusLabel(status) {
  return {
    AVAILABLE: "Trống",
    HELD: "Đang giữ",
    BOOKED: "Đã đặt",
    BLOCKED: "Đã khóa"
  }[status] ?? status;
}

function seatGroups(seats, layout) {
  const ordered = [...seats].sort((left, right) => (
    Number(left.floor) - Number(right.floor)
    || Number(left.row) - Number(right.row)
    || Number(left.column) - Number(right.column)
    || left.label.localeCompare(right.label, "en")
  ));
  const floors = [...new Set(ordered.map((seat) => Number(seat.floor) || 1))].sort((left, right) => left - right);
  if (floors.length < 2) return [{ id: "main", label: layout.label, seats: ordered }];
  return floors.map((floor) => ({
    id: `floor-${floor}`,
    label: floor === 1 ? "Tầng dưới" : `Tầng ${floor}`,
    seats: ordered.filter((seat) => (Number(seat.floor) || 1) === floor)
  }));
}

/** Visual seat layout while the service remains the source of truth for availability. */
export default function SeatMap({ busType, seats = [], selected = [], onToggle, disabled = false }) {
  const layout = layoutForVehicle(busType);
  const groups = seatGroups(seats, layout);

  return (
    <section className="seat-map" aria-label={`Sơ đồ ghế ${layout.label}`}>
      <div className="seat-map__legend" aria-label="Chú thích trạng thái ghế">
        {["AVAILABLE", "HELD", "BOOKED", "BLOCKED"].map((status) => (
          <span className={`seat-legend seat-legend--${status.toLowerCase()}`} key={status}>
            {statusLabel(status)}
          </span>
        ))}
      </div>
      <div className={`seat-layout seat-layout--${layout.kind}`}>
        <div className="seat-layout__front">Đầu xe</div>
        {groups.map((group) => (
          <section className="seat-layout__section" key={group.id} aria-label={group.label}>
            <h3>{group.label}</h3>
            <div
              className={`seat-grid seat-grid--${layout.kind}`}
              style={{ gridTemplateColumns: `repeat(${Math.max(...group.seats.map((seat) => Number(seat.column) || 1))}, minmax(42px, 76px))` }}
            >
              {group.seats.map((seat, index) => {
                const isSelected = selected.includes(seat.id);
                const selectable = !disabled && (seat.status === "AVAILABLE" || isSelected);
                return (
                  <button
                    className={`seat-button ${seat.status.toLowerCase()} ${isSelected ? "selected" : ""}`}
                    key={seat.id}
                    onClick={() => onToggle(seat)}
                    disabled={!selectable}
                    aria-pressed={isSelected}
                    title={`${seat.label} — ${statusLabel(seat.status)}`}
                    style={{
                      gridColumn: Number(seat.column) || layout.pattern[index % layout.pattern.length],
                      gridRow: Number(seat.row) || Math.floor(index / layout.pattern.length) + 1
                    }}
                  >
                    {seat.label}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
