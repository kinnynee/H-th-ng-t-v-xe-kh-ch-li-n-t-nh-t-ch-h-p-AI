import express from "express";
import cors from "cors";
import { buildTrips, locations, operators, routes as seedRoutes, vehicles } from "@bus-ai/shared/seed";
import { connectRedis, createCacheAdapter } from "@bus-ai/shared/cache";
import { publishKafka } from "@bus-ai/shared/broker";
import { connectPostgres } from "@bus-ai/shared/postgres";
import { errorHandler, notFoundHandler } from "@bus-ai/shared/http";
import { bindGrpcServer, createServiceGrpcServer } from "@bus-ai/shared/grpc";
import { assertAuthConfiguration, authenticate, authorize } from "@bus-ai/shared/auth";
import * as tripRepository from "./repository.js";
import { createTripService } from "./services/trip-service.js";
import { createTripController } from "./controllers/trip-controller.js";
import { createTripRouter } from "./routes/trip-routes.js";
import { createHealthCheck } from "./health.js";

const app = express();
app.use(cors());
app.use(express.json());
assertAuthConfiguration();

function requireRoles(...roles) {
  return (req, res, next) => {
    try {
      req.user = authorize(authenticate(req.headers), roles);
      next();
    } catch (error) {
      res.status(error.status ?? 401).json({ error: error.message });
    }
  };
}

const redis = await connectRedis(process.env.REDIS_URL, "trip-service");
const database = await connectPostgres(process.env.DATABASE_URL, "trip-service");
const stores = {
  routes: new Map(seedRoutes.map((route) => [route.id, { ...route }])),
  vehicles: new Map(vehicles.map((vehicle) => [vehicle.id, { ...vehicle }])),
  trips: new Map(buildTrips().map((trip) => [trip.id, { ...trip }])),
  stops: new Map(locations.flatMap((location) => location.stations.map((name, index) => {
    const id = `stop-${location.id}-${index + 1}`;
    return [id, { id, city: location.name, name }];
  })))
};

if (database) {
  const stored = await tripRepository.loadTripRepository(database);
  stores.routes = stored.routes;
  stores.vehicles = stored.vehicles;
  stores.trips = stored.trips;
  stores.stops = stored.stops;
}

const persistence = {
  saveRoute: (route) => tripRepository.saveRoute(database, route),
  deleteRoute: (id) => tripRepository.deleteRoute(database, id),
  saveVehicle: (vehicle) => tripRepository.saveVehicle(database, vehicle),
  deleteVehicle: (id) => tripRepository.deleteVehicle(database, id),
  saveTrip: (trip) => tripRepository.saveTrip(database, trip),
  deleteTrip: (id) => tripRepository.deleteTrip(database, id),
  saveStop: (stop) => tripRepository.saveStop(database, stop),
  deleteStop: (id) => tripRepository.deleteStop(database, id)
};

const service = createTripService({
  stores,
  locations,
  operators,
  cache: createCacheAdapter(redis),
  repository: persistence,
  publishEvent: (eventType, payload, topic = "operation-events") => publishKafka(topic, eventType, payload)
});

const operationalHealth = createHealthCheck({ database, redis, stores });

app.get("/live", (_req, res) => {
  res.json({ ok: true, service: "trip-service", status: "LIVE" });
});
app.get("/ready", async (_req, res) => {
  const health = await operationalHealth();
  res.status(health.ok ? 200 : 503).json({ service: "trip-service", ...health });
});
app.use(createTripRouter(createTripController(service), { requireRoles }));
app.use(notFoundHandler);
app.use(errorHandler);

const grpcServer = createServiceGrpcServer({
  serviceName: "trip-service",
  health: operationalHealth
});
await bindGrpcServer(grpcServer, process.env.TRIP_GRPC_BIND || "0.0.0.0:50052", "trip-service");

const port = Number(process.env.PORT || 4010);
const httpServer = app.listen(port, () => {
  console.log(`[trip-service] listening on http://localhost:${port}`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const force = setTimeout(() => {
    grpcServer.forceShutdown();
    process.exit(1);
  }, 10_000);
  force.unref();
  grpcServer.tryShutdown(() => httpServer.close(() => process.exit(0)));
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
