import { buildTrips } from "@bus-ai/shared/seed";
import { connectRedis, createCacheAdapter } from "@bus-ai/shared/cache";
import { connectPostgres } from "@bus-ai/shared/postgres";
import { bindGrpcServer, createServiceGrpcServer, loadGrpcProto } from "@bus-ai/shared/grpc";
import { createSeatInventory } from "./core.js";
import { loadSeatState, saveSeatState } from "./repository.js";
import { createSeatGrpcController } from "./controllers/seat-grpc-controller.js";
import { createHealthCheck } from "./health.js";

const proto = loadGrpcProto("seat_inventory.proto").bus.seat.v1;

const redis = await connectRedis(process.env.REDIS_URL, "seat-service");
const database = await connectPostgres(process.env.DATABASE_URL, "seat-service");
const initialState = await loadSeatState(database);
const inventory = createSeatInventory({
  cache: createCacheAdapter(redis),
  trips: buildTrips(),
  initialState,
  persistState: (state) => saveSeatState(database, state)
});

const server = createServiceGrpcServer({
  serviceName: "seat-service",
  health: createHealthCheck({ database, redis, inventory })
});
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
