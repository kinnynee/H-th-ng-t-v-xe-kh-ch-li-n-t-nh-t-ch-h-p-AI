import { httpError } from "@bus-ai/shared/http";

/** Domain/business layer: no Express request or response objects are used here. */
export function createTripService({ stores, locations, operators, cache, repository, publishEvent, now = () => Date.now() }) {
  let cacheEpoch = 0;

  const invalidateSearchCache = () => { cacheEpoch += 1; };
  const fold = (value) => String(value ?? "").trim().toLocaleLowerCase("vi-VN").normalize("NFD").replace(/\p{Diacritic}/gu, "");

  function catalogLocations() {
    const byCity = new Map(locations.map((location) => [location.name, { ...location, stations: [...location.stations] }]));
    for (const stop of stores.stops.values()) {
      const location = byCity.get(stop.city) ?? {
        id: `location-${stop.city.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: stop.city,
        stations: []
      };
      if (!location.stations.includes(stop.name)) location.stations.push(stop.name);
      byCity.set(stop.city, location);
    }
    return [...byCity.values()];
  }

  function matches(trip, query, nowMs) {
    if (query.from && !fold(trip.from).includes(fold(query.from))) return false;
    if (query.to && !fold(trip.to).includes(fold(query.to))) return false;
    if (query.date && trip.date !== query.date) return false;
    if (query.operator && trip.operatorId !== query.operator) return false;
    if (query.busType && !fold(trip.busType).includes(fold(query.busType))) return false;
    if (query.minPrice && trip.price < Number(query.minPrice)) return false;
    if (query.maxPrice && trip.price > Number(query.maxPrice)) return false;
    const hhmm = trip.departureTime.slice(11, 16);
    if (query.timeFrom && hhmm < query.timeFrom) return false;
    if (query.timeTo && hhmm > query.timeTo) return false;
    if (query.includeInactive !== "true" && Date.parse(trip.departureTime) <= nowMs) return false;
    return trip.status === "ACTIVE" || query.includeInactive === "true";
  }

  function sortTrips(items, sort) {
    const sorted = [...items];
    if (sort === "PRICE_ASC") sorted.sort((left, right) => left.price - right.price);
    else if (sort === "DURATION_ASC") sorted.sort((left, right) => left.durationMinutes - right.durationMinutes);
    else sorted.sort((left, right) => left.departureTime.localeCompare(right.departureTime));
    return sorted;
  }

  function suggestion(query, nowMs) {
    return [...stores.trips.values()]
      .filter((trip) => (!query.from || fold(trip.from).includes(fold(query.from))) && (!query.to || fold(trip.to).includes(fold(query.to))))
      .filter((trip) => trip.status === "ACTIVE")
      .filter((trip) => Date.parse(trip.departureTime) > nowMs)
      .sort((left, right) => left.date.localeCompare(right.date))[0]?.date ?? null;
  }

  function requireText(value, label) {
    const text = String(value ?? "").trim();
    if (!text) throw httpError(400, `${label} is required`);
    return text;
  }

  function defaultSeatLayout(seatCount, layout = "standard") {
    const normalizedCount = Number(seatCount);
    const isSleeper = /upper|lower|sleeper|giường|giuong/i.test(String(layout));
    const floors = isSleeper ? 2 : 1;
    const seatsPerFloor = Math.ceil(normalizedCount / floors);
    const columns = /2\s*[-x]\s*2/.test(String(layout)) ? [1, 2, 4, 5] : [1, 3];
    return Array.from({ length: normalizedCount }, (_, index) => {
      const floor = Math.floor(index / seatsPerFloor) + 1;
      const indexOnFloor = index % seatsPerFloor;
      const prefix = floors === 1 ? "A" : (floor === 1 ? "A" : "B");
      const id = `${prefix}${String(indexOnFloor + 1).padStart(2, "0")}`;
      return {
        id,
        label: id,
        floor,
        row: Math.floor(indexOnFloor / columns.length) + 1,
        column: columns[indexOnFloor % columns.length]
      };
    });
  }

  function normalizeSeatLayout(value, seatCount, layout) {
    const source = Array.isArray(value) && value.length ? value : defaultSeatLayout(seatCount, layout);
    if (source.length !== seatCount) {
      throw httpError(400, "Seat layout must contain exactly seatCount seats");
    }
    const ids = new Set();
    return source.map((item, index) => {
      const id = requireText(item?.id, `Seat ${index + 1} ID`).toUpperCase();
      const label = String(item?.label ?? id).trim() || id;
      const floor = Number(item?.floor ?? 1);
      const row = Number(item?.row ?? Math.floor(index / 4) + 1);
      const column = Number(item?.column ?? (index % 4) + 1);
      if (ids.has(id)) throw httpError(400, `Seat layout contains duplicate seat ${id}`);
      if (![floor, row, column].every((number) => Number.isInteger(number) && number > 0)) {
        throw httpError(400, `Seat ${id} has an invalid position`);
      }
      ids.add(id);
      return { id, label, floor, row, column };
    });
  }

  function publicVehicle(vehicle) {
    return {
      ...vehicle,
      seatLayout: normalizeSeatLayout(vehicle.seatLayout, Number(vehicle.seatCount), vehicle.layout)
    };
  }

  return {
    health: () => ({ ok: true, service: "trip-service", routes: stores.routes.size, trips: stores.trips.size }),
    catalog: () => ({ locations: catalogLocations(), operators, vehicles: [...stores.vehicles.values()].map(publicVehicle) }),
    listStops: () => ({ stops: [...stores.stops.values()] }),
    listVehicles: () => ({ vehicles: [...stores.vehicles.values()].map(publicVehicle) }),
    listRoutes: () => ({ routes: [...stores.routes.values()] }),

    async createStop(input) {
      const stop = { id: input.id || `stop-${Date.now()}`, city: requireText(input.city, "Stop city"), name: requireText(input.name, "Stop name") };
      stores.stops.set(stop.id, stop);
      await repository.saveStop(stop);
      await publishEvent("StopCreated", { stopId: stop.id, city: stop.city, name: stop.name });
      return stop;
    },
    async updateStop(id, input) {
      const current = stores.stops.get(id);
      if (!current) throw httpError(404, "Stop not found");
      const stop = { id, city: requireText(input.city ?? current.city, "Stop city"), name: requireText(input.name ?? current.name, "Stop name") };
      stores.stops.set(id, stop);
      await repository.saveStop(stop);
      await publishEvent("StopUpdated", { stopId: id, city: stop.city, name: stop.name });
      return stop;
    },
    async deleteStop(id) {
      const stop = stores.stops.get(id);
      if (!stop) throw httpError(404, "Stop not found");
      if ([...stores.routes.values()].some((route) => route.pickup === stop.name || route.dropoff === stop.name)) {
        throw httpError(409, "Stop is assigned to a route");
      }
      stores.stops.delete(id);
      await repository.deleteStop(id);
      await publishEvent("StopDeleted", { stopId: id });
    },

    async createVehicle(input) {
      const seatCount = Number(input.seatCount ?? 34);
      if (!Number.isInteger(seatCount) || seatCount < 1) throw httpError(400, "seatCount must be a positive integer");
      const vehicle = {
        id: input.id || `VEH-${Date.now()}`,
        plate: requireText(input.plate, "Vehicle plate"),
        type: requireText(input.type, "Vehicle type"),
        seatCount,
        layout: input.layout || "standard",
        seatLayout: normalizeSeatLayout(input.seatLayout, seatCount, input.layout)
      };
      stores.vehicles.set(vehicle.id, vehicle);
      await repository.saveVehicle(vehicle);
      await publishEvent("VehicleCreated", { vehicleId: vehicle.id, plate: vehicle.plate });
      invalidateSearchCache();
      return vehicle;
    },
    async updateVehicle(id, input) {
      const current = stores.vehicles.get(id);
      if (!current) throw httpError(404, "Vehicle not found");
      const seatCount = Number(input.seatCount ?? current.seatCount);
      const layout = input.layout ?? current.layout;
      if (!Number.isInteger(seatCount) || seatCount < 1) throw httpError(400, "seatCount must be a positive integer");
      const vehicle = {
        ...current,
        ...input,
        id,
        seatCount,
        layout,
        seatLayout: normalizeSeatLayout(input.seatLayout ?? current.seatLayout, seatCount, layout)
      };
      stores.vehicles.set(id, vehicle);
      await repository.saveVehicle(vehicle);
      await publishEvent("VehicleUpdated", { vehicleId: id, plate: vehicle.plate });
      invalidateSearchCache();
      return vehicle;
    },
    async deleteVehicle(id) {
      if ([...stores.trips.values()].some((trip) => trip.vehicleId === id)) throw httpError(409, "Vehicle is assigned to a trip");
      if (!stores.vehicles.delete(id)) throw httpError(404, "Vehicle not found");
      await repository.deleteVehicle(id);
      await publishEvent("VehicleDeleted", { vehicleId: id });
      invalidateSearchCache();
    },

    async createRoute(input) {
      const route = { id: input.id || `route-${Date.now()}`, ...input };
      ["from", "to", "pickup", "dropoff", "cancellationPolicy"].forEach((field) => { route[field] = requireText(route[field], `Route ${field}`); });
      route.distanceKm = Number(route.distanceKm);
      route.durationMinutes = Number(route.durationMinutes);
      if (route.distanceKm <= 0 || route.durationMinutes <= 0) throw httpError(400, "Route distance and duration must be positive");
      stores.routes.set(route.id, route);
      await repository.saveRoute(route);
      await publishEvent("RouteCreated", { routeId: route.id, from: route.from, to: route.to });
      invalidateSearchCache();
      return route;
    },
    async updateRoute(id, input) {
      const current = stores.routes.get(id);
      if (!current) throw httpError(404, "Route not found");
      const route = { ...current, ...input, id };
      route.distanceKm = Number(route.distanceKm);
      route.durationMinutes = Number(route.durationMinutes);
      stores.routes.set(id, route);
      await repository.saveRoute(route);
      await publishEvent("RouteUpdated", { routeId: id, from: route.from, to: route.to });
      invalidateSearchCache();
      return route;
    },
    async deleteRoute(id) {
      if (!stores.routes.delete(id)) throw httpError(404, "Route not found");
      await repository.deleteRoute(id);
      await publishEvent("RouteDeleted", { routeId: id });
      invalidateSearchCache();
    },

    async search(query) {
      const nowMs = now();
      const cacheWindow = query.includeInactive === "true" ? "admin" : Math.floor(nowMs / 60_000);
      const cacheKey = `trip-search:${cacheEpoch}:${cacheWindow}:${JSON.stringify(query)}`;
      const cached = await cache.get(cacheKey);
      if (cached) return { ...cached, cache: "HIT" };
      const trips = sortTrips([...stores.trips.values()].filter((trip) => matches(trip, query, nowMs)), query.sort);
      const payload = { trips, suggestionDate: trips.length ? null : suggestion(query, nowMs), cache: "MISS" };
      await cache.set(cacheKey, payload, 60);
      await publishEvent("TripSearchPerformed", { from: query.from ?? "", to: query.to ?? "", date: query.date ?? "", resultCount: trips.length }, "search-events");
      return payload;
    },
    getTrip(id) {
      const trip = stores.trips.get(id);
      if (!trip) throw httpError(404, "Trip not found");
      return { ...trip, route: stores.routes.get(trip.routeId) };
    },
    async saveTrip(id, input) {
      const current = id ? stores.trips.get(id) : null;
      if (id && !current) throw httpError(404, "Trip not found");
      const route = stores.routes.get(input.routeId ?? current?.routeId);
      const vehicle = stores.vehicles.get(input.vehicleId ?? current?.vehicleId);
      const operator = operators.find((item) => item.id === (input.operatorId ?? current?.operatorId));
      if (!route) throw httpError(400, "Route not found");
      if (!vehicle) throw httpError(400, "Vehicle not found");
      if (!operator) throw httpError(400, "Operator not found");
      const departureTime = requireText(input.departureTime ?? current?.departureTime, "Departure time");
      if (Number.isNaN(Date.parse(departureTime))) throw httpError(400, "Departure time is invalid");
      const trip = {
        ...current,
        id: id || input.id || `trip-${Date.now()}`,
        routeId: route.id, from: route.from, to: route.to, pickup: route.pickup, dropoff: route.dropoff,
        operatorId: operator.id, operatorName: operator.name,
        vehicleId: vehicle.id, vehiclePlate: vehicle.plate, busType: vehicle.type, seatCount: vehicle.seatCount,
        seatLayout: normalizeSeatLayout(vehicle.seatLayout, Number(vehicle.seatCount), vehicle.layout),
        date: departureTime.slice(0, 10), departureTime,
        arrivalTime: "",
        durationMinutes: route.durationMinutes, price: Number(input.price ?? current?.price ?? 250000),
        status: input.status ?? current?.status ?? "ACTIVE", cancellationPolicy: route.cancellationPolicy
      };
      if (trip.price < 0) throw httpError(400, "Trip price must not be negative");
      const departureChanged = Boolean(id && input.departureTime && input.departureTime !== current.departureTime);
      const requestedArrival = String(input.arrivalTime ?? "").trim()
        || (!departureChanged ? String(current?.arrivalTime ?? "").trim() : "");
      const fallbackArrival = new Date(new Date(departureTime).getTime() + route.durationMinutes * 60_000).toISOString();
      const arrivalTime = requestedArrival || fallbackArrival;
      if (Number.isNaN(Date.parse(arrivalTime))) throw httpError(400, "Arrival time is invalid");
      if (Date.parse(arrivalTime) <= Date.parse(departureTime)) {
        throw httpError(400, "Arrival time must be after departure time");
      }
      trip.arrivalTime = arrivalTime;
      trip.durationMinutes = Math.round((Date.parse(arrivalTime) - Date.parse(departureTime)) / 60_000);
      stores.trips.set(trip.id, trip);
      await repository.saveTrip(trip);
      await publishEvent(id ? "TripUpdated" : "TripCreated", { tripId: trip.id, routeId: trip.routeId, status: trip.status });
      invalidateSearchCache();
      return trip;
    },
    async deleteTrip(id) {
      if (!stores.trips.delete(id)) throw httpError(404, "Trip not found");
      await repository.deleteTrip(id);
      await publishEvent("TripDeleted", { tripId: id });
      invalidateSearchCache();
    },
    async updateTripStatus(id, status) {
      const trip = stores.trips.get(id);
      if (!trip) throw httpError(404, "Trip not found");
      if (!["ACTIVE", "SUSPENDED", "DEPARTED", "COMPLETED"].includes(status)) throw httpError(400, "Invalid trip status");
      trip.status = status;
      stores.trips.set(id, trip);
      await repository.saveTrip(trip);
      await publishEvent("TripStatusChanged", { tripId: id, status });
      invalidateSearchCache();
      return trip;
    }
  };
}
