export const locations = [
  { id: "hcm", name: "TP.HCM", stations: ["Bến xe Miền Đông", "Bến xe Miền Tây"] },
  { id: "dalat", name: "Đà Lạt", stations: ["Bến xe Liên tỉnh Đà Lạt"] },
  { id: "nhatrang", name: "Nha Trang", stations: ["Bến xe Nha Trang phía Nam"] },
  { id: "cantho", name: "Cần Thơ", stations: ["Bến xe Trung tâm Cần Thơ"] },
  { id: "danang", name: "Đà Nẵng", stations: ["Bến xe Trung tâm Đà Nẵng"] },
  { id: "hanoi", name: "Hà Nội", stations: ["Bến xe Mỹ Đình"] }
];

export const operators = [
  { id: "futademo", name: "Phương Trang Demo", hotline: "1900 6067" },
  { id: "thanhbuoidemo", name: "Thành Bưởi Demo", hotline: "1900 6079" },
  { id: "kumhodemo", name: "Kumho Demo", hotline: "1900 1122" }
];

export const vehicles = [
  { id: "BUS-29-01", plate: "51B-123.45", type: "Ghế ngồi 29 chỗ", seatCount: 29, layout: "2-2" },
  { id: "SLEEP-34-02", plate: "51B-678.90", type: "Giường nằm 34 chỗ", seatCount: 34, layout: "upper-lower" },
  { id: "LIMO-22-03", plate: "51B-222.88", type: "Limousine 22 chỗ", seatCount: 22, layout: "premium" }
];

export const routes = [
  {
    id: "route-hcm-dalat",
    from: "TP.HCM",
    to: "Đà Lạt",
    distanceKm: 310,
    durationMinutes: 420,
    pickup: "Bến xe Miền Đông",
    dropoff: "Bến xe Liên tỉnh Đà Lạt",
    cancellationPolicy: "Hủy miễn phí trước giờ khởi hành 12 tiếng. Sau thời điểm này phí hủy là 30%."
  },
  {
    id: "route-hcm-nhatrang",
    from: "TP.HCM",
    to: "Nha Trang",
    distanceKm: 430,
    durationMinutes: 540,
    pickup: "Bến xe Miền Đông",
    dropoff: "Bến xe Nha Trang phía Nam",
    cancellationPolicy: "Hủy trước 24 tiếng hoàn 90%, trước 6 tiếng hoàn 60%."
  },
  {
    id: "route-hcm-cantho",
    from: "TP.HCM",
    to: "Cần Thơ",
    distanceKm: 170,
    durationMinutes: 220,
    pickup: "Bến xe Miền Tây",
    dropoff: "Bến xe Trung tâm Cần Thơ",
    cancellationPolicy: "Hủy trước 4 tiếng hoàn 80%."
  },
  {
    id: "route-danang-hanoi",
    from: "Đà Nẵng",
    to: "Hà Nội",
    distanceKm: 770,
    durationMinutes: 900,
    pickup: "Bến xe Trung tâm Đà Nẵng",
    dropoff: "Bến xe Mỹ Đình",
    cancellationPolicy: "Hủy trước 24 tiếng hoàn 85%."
  },
  {
    id: "route-dalat-hcm",
    from: "Đà Lạt",
    to: "TP.HCM",
    distanceKm: 310,
    durationMinutes: 420,
    pickup: "Bến xe Liên tỉnh Đà Lạt",
    dropoff: "Bến xe Miền Đông",
    cancellationPolicy: "Hủy miễn phí trước giờ khởi hành 12 tiếng. Sau thời điểm này phí hủy là 30%."
  },
  {
    id: "route-nhatrang-hcm",
    from: "Nha Trang",
    to: "TP.HCM",
    distanceKm: 430,
    durationMinutes: 540,
    pickup: "Bến xe Nha Trang phía Nam",
    dropoff: "Bến xe Miền Đông",
    cancellationPolicy: "Hủy trước 24 tiếng hoàn 90%, trước 6 tiếng hoàn 60%."
  },
  {
    id: "route-cantho-hcm",
    from: "Cần Thơ",
    to: "TP.HCM",
    distanceKm: 170,
    durationMinutes: 220,
    pickup: "Bến xe Trung tâm Cần Thơ",
    dropoff: "Bến xe Miền Tây",
    cancellationPolicy: "Hủy trước 4 tiếng hoàn 80%."
  },
  {
    id: "route-hanoi-danang",
    from: "Hà Nội",
    to: "Đà Nẵng",
    distanceKm: 770,
    durationMinutes: 900,
    pickup: "Bến xe Mỹ Đình",
    dropoff: "Bến xe Trung tâm Đà Nẵng",
    cancellationPolicy: "Hủy trước 24 tiếng hoàn 85%."
  },
  {
    id: "route-hcm-danang",
    from: "TP.HCM",
    to: "Đà Nẵng",
    distanceKm: 960,
    durationMinutes: 1080,
    pickup: "Bến xe Miền Đông",
    dropoff: "Bến xe Trung tâm Đà Nẵng",
    cancellationPolicy: "Hủy trước 24 tiếng hoàn 85%, trước 12 tiếng hoàn 60%."
  }
];

export function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeOnDate(date, hhmm) {
  return `${date}T${hhmm}:00+07:00`;
}

export function buildTrips() {
  const d0 = isoDate(0);
  const d1 = isoDate(1);
  const d2 = isoDate(2);
  const d3 = isoDate(3);
  const templates = [
    ["trip-hcm-dalat-dawn", "route-hcm-dalat", "kumhodemo", "BUS-29-01", d0, "05:30", 280000],
    ["trip-hcm-dalat-early", "route-hcm-dalat", "futademo", "SLEEP-34-02", d0, "07:00", 320000],
    ["trip-hcm-dalat-morning", "route-hcm-dalat", "thanhbuoidemo", "LIMO-22-03", d0, "09:30", 390000],
    ["trip-hcm-dalat-afternoon", "route-hcm-dalat", "futademo", "BUS-29-01", d0, "14:00", 300000],
    ["trip-hcm-dalat-evening", "route-hcm-dalat", "kumhodemo", "SLEEP-34-02", d0, "18:00", 340000],
    ["trip-hcm-dalat-night", "route-hcm-dalat", "thanhbuoidemo", "LIMO-22-03", d0, "21:30", 420000],
    ["trip-hcm-dalat-next", "route-hcm-dalat", "kumhodemo", "SLEEP-34-02", d1, "19:00", 350000],
    ["trip-hcm-dalat-next-morning", "route-hcm-dalat", "futademo", "LIMO-22-03", d1, "08:00", 410000],
    ["trip-hcm-dalat-day2", "route-hcm-dalat", "thanhbuoidemo", "SLEEP-34-02", d2, "20:30", 360000],

    ["trip-hcm-nhatrang-today", "route-hcm-nhatrang", "futademo", "SLEEP-34-02", d0, "07:30", 380000],
    ["trip-hcm-nhatrang-today-night", "route-hcm-nhatrang", "thanhbuoidemo", "LIMO-22-03", d0, "20:00", 460000],
    ["trip-hcm-nhatrang-morning", "route-hcm-nhatrang", "kumhodemo", "SLEEP-34-02", d1, "08:30", 390000],
    ["trip-hcm-nhatrang-next-night", "route-hcm-nhatrang", "thanhbuoidemo", "LIMO-22-03", d1, "21:00", 450000],
    ["trip-hcm-nhatrang-night", "route-hcm-nhatrang", "futademo", "SLEEP-34-02", d2, "22:00", 410000],

    ["trip-hcm-cantho-morning", "route-hcm-cantho", "kumhodemo", "BUS-29-01", d0, "06:00", 140000],
    ["trip-hcm-cantho-late-morning", "route-hcm-cantho", "thanhbuoidemo", "LIMO-22-03", d0, "09:45", 210000],
    ["trip-hcm-cantho-noon", "route-hcm-cantho", "futademo", "BUS-29-01", d0, "12:15", 160000],
    ["trip-hcm-cantho-late", "route-hcm-cantho", "kumhodemo", "SLEEP-34-02", d0, "17:30", 190000],
    ["trip-hcm-cantho-evening", "route-hcm-cantho", "kumhodemo", "LIMO-22-03", d1, "18:30", 220000],
    ["trip-hcm-cantho-next-morning", "route-hcm-cantho", "futademo", "BUS-29-01", d1, "07:15", 150000],

    ["trip-dalat-hcm-morning", "route-dalat-hcm", "futademo", "SLEEP-34-02", d0, "08:00", 330000],
    ["trip-dalat-hcm-night", "route-dalat-hcm", "thanhbuoidemo", "LIMO-22-03", d0, "22:00", 420000],
    ["trip-dalat-hcm-next", "route-dalat-hcm", "kumhodemo", "BUS-29-01", d1, "13:30", 290000],

    ["trip-nhatrang-hcm-morning", "route-nhatrang-hcm", "kumhodemo", "SLEEP-34-02", d0, "09:00", 390000],
    ["trip-nhatrang-hcm-night", "route-nhatrang-hcm", "futademo", "LIMO-22-03", d0, "21:00", 460000],
    ["trip-nhatrang-hcm-next", "route-nhatrang-hcm", "thanhbuoidemo", "SLEEP-34-02", d1, "10:30", 400000],

    ["trip-cantho-hcm-morning", "route-cantho-hcm", "futademo", "BUS-29-01", d0, "07:00", 150000],
    ["trip-cantho-hcm-afternoon", "route-cantho-hcm", "kumhodemo", "LIMO-22-03", d0, "15:00", 220000],
    ["trip-cantho-hcm-next", "route-cantho-hcm", "thanhbuoidemo", "BUS-29-01", d1, "11:00", 160000],

    ["trip-danang-hanoi-today", "route-danang-hanoi", "thanhbuoidemo", "SLEEP-34-02", d0, "17:00", 520000],
    ["trip-danang-hanoi", "route-danang-hanoi", "futademo", "LIMO-22-03", d3, "17:00", 590000],
    ["trip-hanoi-danang-next", "route-hanoi-danang", "kumhodemo", "SLEEP-34-02", d1, "16:30", 540000],
    ["trip-hcm-danang-next", "route-hcm-danang", "futademo", "SLEEP-34-02", d1, "18:00", 650000]
  ];

  return templates.map(([id, routeId, operatorId, vehicleId, date, departAt, price]) => {
    const route = routes.find((item) => item.id === routeId);
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    const operator = operators.find((item) => item.id === operatorId);
    const departure = timeOnDate(date, departAt);
    const arrival = new Date(new Date(departure).getTime() + route.durationMinutes * 60_000).toISOString();
    return {
      id,
      routeId,
      from: route.from,
      to: route.to,
      pickup: route.pickup,
      dropoff: route.dropoff,
      operatorId,
      operatorName: operator.name,
      vehicleId,
      vehiclePlate: vehicle.plate,
      busType: vehicle.type,
      seatCount: vehicle.seatCount,
      date,
      departureTime: departure,
      arrivalTime: arrival,
      durationMinutes: route.durationMinutes,
      price,
      status: "ACTIVE",
      cancellationPolicy: route.cancellationPolicy
    };
  });
}

export function buildSeatLabels(seatCount = 34) {
  const seats = [];
  for (let i = 1; i <= seatCount; i += 1) {
    const prefix = i <= Math.ceil(seatCount / 2) ? "A" : "B";
    const number = prefix === "A" ? i : i - Math.ceil(seatCount / 2);
    seats.push({
      id: `${prefix}${String(number).padStart(2, "0")}`,
      label: `${prefix}${String(number).padStart(2, "0")}`,
      floor: prefix === "A" ? 1 : 2,
      status: "AVAILABLE",
      holdExpiresIn: 0
    });
  }
  return seats;
}
