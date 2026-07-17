import { buildTrips } from "@bus-ai/shared/seed";
import { connectRedis, createCacheAdapter } from "@bus-ai/shared/cache";
import { connectPostgres } from "@bus-ai/shared/postgres";
import { publishRabbit, seatChangedRoutingKey } from "@bus-ai/shared/broker";
import { bindGrpcServer, createServiceGrpcServer, loadGrpcProto } from "@bus-ai/shared/grpc";
import { createSeatInventory } from "./core.js";
import {
  confirmSeatAssignments,
  ensureSeatCatalog,
  loadSeatCatalog,
  loadSeatState,
  releaseSeatAssignments,
  setSeatAssignmentsBlocked
} from "./repository.js";
import { createSeatGrpcController } from "./controllers/seat-grpc-controller.js";
import { createHealthCheck } from "./health.js";
import { assertAuthConfiguration } from "@bus-ai/shared/auth";

const proto = loadGrpcProto("seat_inventory.proto").bus.seat.v1;
assertAuthConfiguration();

const redis = await connectRedis(process.env.REDIS_URL, "seat-service");
const database = await connectPostgres(process.env.DATABASE_URL, "seat-service");
const [initialState, seatCatalog] = await Promise.all([
  loadSeatState(database),
  loadSeatCatalog(database)
]);
const inventory = createSeatInventory({
  cache: createCacheAdapter(redis),
  trips: buildTrips(),
  seatCatalog,
  initialState,
  loadState: database ? () => loadSeatState(database) : null,
  confirmAssignments: (input) => confirmSeatAssignments(database, input),
  releaseAssignments: (input) => releaseSeatAssignments(database, input),
  setAssignmentsBlocked: (input) => setSeatAssignmentsBlocked(database, input),
  persistCatalog: (tripId, seats) => ensureSeatCatalog(database, tripId, seats),
  onSeatChanged: ({ tripId, seats, message }) => publishRabbit(
    "SeatChanged",
    { tripId, seats, message },
    seatChangedRoutingKey(tripId)
  )
});

const server = createServiceGrpcServer({
  serviceName: "seat-service",
  health: createHealthCheck({ database, redis, inventory })
});
// Booking service sends a short-lived SERVICE token with every state-changing call.
server.addService(proto.SeatInventoryService.service, createSeatGrpcController(inventory));

const bindAddress = process.env.SEAT_GRPC_BIND || "0.0.0.0:50051";
await bindGrpcServer(server, bindAddress, "seat-service");

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const force = setTimeout(() => {
    server.forceShutdown();
    process.exit(1);
  }, 10_000);
  force.unref();
  server.tryShutdown(() => process.exit(0));
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
