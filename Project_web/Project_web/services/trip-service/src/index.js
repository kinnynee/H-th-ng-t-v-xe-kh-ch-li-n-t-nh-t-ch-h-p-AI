import express from "express";
import cors from "cors";
import { buildTrips, locations, operators, routes as seedRoutes, vehicles } from "@bus-ai/shared/seed";
import { connectRedis, createCacheAdapter } from "@bus-ai/shared/cache";
import { publishKafka } from "@bus-ai/shared/broker";

const app = express();
app.use(cors());
app.use(express.json());

const redis = await connectRedis(process.env.REDIS_URL, "trip-service");
const cache = createCacheAdapter(redis);
const routes = new Map(seedRoutes.map((route) => [route.id, { ...route }]));
const vehicleStore = new Map(vehicles.map((vehicle) => [vehicle.id, { ...vehicle }]));
const trips = new Map(buildTrips().map((trip) => [trip.id, { ...trip }]));

function fold(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function tripMatches(trip, query) {
  if (query.from && !fold(trip.from).includes(fold(query.from))) return false;
  if (query.to && !fold(trip.to).includes(fold(query.to))) return false;
  if (query.date && trip.date !== query.date) return false;
  if (query.operator && trip.operatorId !== query.operator) return false;
  if (query.busType && !fold(trip.busType).includes(fold(query.busType))) return false;
  if (query.minPrice && trip.price < Number(query.minPrice)) return false;
  if (query.maxPrice && trip.price > Number(query.maxPrice)) return false;
  if (query.timeFrom || query.timeTo) {
    const hhmm = trip.departureTime.slice(11, 16);
    if (query.timeFrom && hhmm < query.timeFrom) return false;
    if (query.timeTo && hhmm > query.timeTo) return false;
  }
  return trip.status === "ACTIVE" || query.includeInactive === "true";
}

function sortTrips(items, sort) {
  const sorted = [...items];
  if (sort === "PRICE_ASC") sorted.sort((a, b) => a.price - b.price);
  else if (sort === "DEPARTURE_ASC") sorted.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  else if (sort === "DURATION_ASC") sorted.sort((a, b) => a.durationMinutes - b.durationMinutes);
  else sorted.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  return sorted;
}

function nearestSuggestion(query) {
  const candidates = [...trips.values()]
    .filter((trip) => (!query.from || fold(trip.from).includes(fold(query.from))) && (!query.to || fold(trip.to).includes(fold(query.to))))
    .filter((trip) => trip.status === "ACTIVE")
    .sort((a, b) => a.date.localeCompare(b.date));
  return candidates[0]?.date ?? null;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "trip-service", routes: routes.size, trips: trips.size });
});

app.get("/locations", (_req, res) => {
  res.json({ locations, operators, vehicles: [...vehicleStore.values()] });
});

app.get("/vehicles", (_req, res) => {
  res.json({ vehicles: [...vehicleStore.values()] });
});

app.post("/vehicles", (req, res) => {
  const id = req.body.id || `VEH-${Date.now()}`;
  const vehicle = {
    id,
    plate: req.body.plate,
    type: req.body.type,
    seatCount: Number(req.body.seatCount ?? 34),
    layout: req.body.layout || "standard"
  };
  vehicleStore.set(id, vehicle);
  res.status(201).json({ vehicle });
});

app.put("/vehicles/:id", (req, res) => {
  const current = vehicleStore.get(req.params.id);
  if (!current) return res.status(404).json({ error: "Vehicle not found" });
  const vehicle = {
    ...current,
    ...req.body,
    id: req.params.id,
    seatCount: Number(req.body.seatCount ?? current.seatCount)
  };
  vehicleStore.set(vehicle.id, vehicle);
  res.json({ vehicle });
});

app.delete("/vehicles/:id", (req, res) => {
  const inUse = [...trips.values()].some((trip) => trip.vehicleId === req.params.id);
  if (inUse) return res.status(409).json({ error: "Vehicle is assigned to a trip" });
  vehicleStore.delete(req.params.id);
  res.json({ ok: true });
});

app.get("/routes", (_req, res) => {
  res.json({ routes: [...routes.values()] });
});

app.post("/routes", (req, res) => {
  const id = req.body.id || `route-${Date.now()}`;
  const route = { id, ...req.body };
  routes.set(id, route);
  res.status(201).json({ route });
});

app.put("/routes/:id", (req, res) => {
  const current = routes.get(req.params.id);
  if (!current) return res.status(404).json({ error: "Route not found" });
  const route = { ...current, ...req.body, id: req.params.id };
  routes.set(route.id, route);
  res.json({ route });
});

app.delete("/routes/:id", (req, res) => {
  routes.delete(req.params.id);
  res.json({ ok: true });
});

app.get("/trips", async (req, res) => {
  const cacheKey = `trip-search:${JSON.stringify(req.query)}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.json({ ...cached, cache: "HIT" });

  const matched = sortTrips([...trips.values()].filter((trip) => tripMatches(trip, req.query)), req.query.sort);
  const payload = {
    trips: matched,
    suggestionDate: matched.length === 0 ? nearestSuggestion(req.query) : null,
    cache: "MISS"
  };
  await cache.set(cacheKey, payload, 60);
  await publishKafka("search-events", "TripSearchPerformed", {
    from: req.query.from ?? "",
    to: req.query.to ?? "",
    date: req.query.date ?? "",
    resultCount: matched.length
  });
  res.json(payload);
});

app.get("/trips/:id", (req, res) => {
  const trip = trips.get(req.params.id);
  if (!trip) return res.status(404).json({ error: "Trip not found" });
  const route = routes.get(trip.routeId);
  res.json({ trip: { ...trip, route } });
});

app.post("/trips", (req, res) => {
  const route = routes.get(req.body.routeId);
  const vehicle = vehicleStore.get(req.body.vehicleId) ?? [...vehicleStore.values()][0];
  const operator = operators.find((item) => item.id === req.body.operatorId) ?? operators[0];
  if (!route) return res.status(400).json({ error: "Route not found" });
  const departureTime = req.body.departureTime;
  const arrivalTime = new Date(new Date(departureTime).getTime() + route.durationMinutes * 60_000).toISOString();
  const id = req.body.id || `trip-${Date.now()}`;
  const trip = {
    id,
    routeId: route.id,
    from: route.from,
    to: route.to,
    pickup: route.pickup,
    dropoff: route.dropoff,
    operatorId: operator.id,
    operatorName: operator.name,
    vehicleId: vehicle.id,
    vehiclePlate: vehicle.plate,
    busType: vehicle.type,
    seatCount: vehicle.seatCount,
    date: departureTime.slice(0, 10),
    departureTime,
    arrivalTime,
    durationMinutes: route.durationMinutes,
    price: Number(req.body.price ?? 250000),
    status: req.body.status ?? "ACTIVE",
    cancellationPolicy: route.cancellationPolicy
  };
  trips.set(id, trip);
  res.status(201).json({ trip });
});

app.put("/trips/:id", (req, res) => {
  const current = trips.get(req.params.id);
  if (!current) return res.status(404).json({ error: "Trip not found" });
  const route = routes.get(req.body.routeId ?? current.routeId);
  const vehicle = vehicleStore.get(req.body.vehicleId ?? current.vehicleId) ?? [...vehicleStore.values()][0];
  const operator = operators.find((item) => item.id === (req.body.operatorId ?? current.operatorId)) ?? operators[0];
  if (!route) return res.status(400).json({ error: "Route not found" });
  const departureTime = req.body.departureTime ?? current.departureTime;
  const arrivalTime = new Date(new Date(departureTime).getTime() + route.durationMinutes * 60_000).toISOString();
  const trip = {
    ...current,
    routeId: route.id,
    from: route.from,
    to: route.to,
    pickup: route.pickup,
    dropoff: route.dropoff,
    operatorId: operator.id,
    operatorName: operator.name,
    vehicleId: vehicle.id,
    vehiclePlate: vehicle.plate,
    busType: vehicle.type,
    seatCount: vehicle.seatCount,
    date: departureTime.slice(0, 10),
    departureTime,
    arrivalTime,
    durationMinutes: route.durationMinutes,
    price: Number(req.body.price ?? current.price),
    status: req.body.status ?? current.status,
    cancellationPolicy: route.cancellationPolicy
  };
  trips.set(trip.id, trip);
  res.json({ trip });
});

app.delete("/trips/:id", (req, res) => {
  trips.delete(req.params.id);
  res.json({ ok: true });
});

app.patch("/trips/:id/status", (req, res) => {
  const trip = trips.get(req.params.id);
  if (!trip) return res.status(404).json({ error: "Trip not found" });
  trip.status = req.body.status ?? trip.status;
  trips.set(trip.id, trip);
  res.json({ trip });
});

const port = Number(process.env.PORT || 4010);
app.listen(port, () => {
  console.log(`[trip-service] listening on http://localhost:${port}`);
});
