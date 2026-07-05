import path from "node:path";
import { fileURLToPath } from "node:url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { buildTrips } from "@bus-ai/shared/seed";
import { connectRedis, createCacheAdapter } from "@bus-ai/shared/cache";
import { createSeatInventory } from "./core.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const protoPath = path.resolve(__dirname, "../../../proto/seat_inventory.proto");
const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const proto = grpc.loadPackageDefinition(packageDefinition).bus.seat.v1;

const redis = await connectRedis(process.env.REDIS_URL, "seat-service");
const inventory = createSeatInventory({
  cache: createCacheAdapter(redis),
  trips: buildTrips()
});

function callbackify(fn) {
  return async (call, callback) => {
    try {
      callback(null, await fn(call.request));
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        message: error.message
      });
    }
  };
}

const server = new grpc.Server();
server.addService(proto.SeatInventoryService.service, {
  getSeatMap: callbackify((request) => inventory.getSeatMap(request.tripId)),
  holdSeats: callbackify((request) =>
    inventory.holdSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      customerEmail: request.customerEmail,
      idempotencyKey: request.idempotencyKey,
      ttlSeconds: request.ttlSeconds || 300
    })
  ),
  confirmSeats: callbackify((request) =>
    inventory.confirmSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      holdToken: request.holdToken,
      bookingCode: request.bookingCode
    })
  ),
  releaseSeats: callbackify((request) =>
    inventory.releaseSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      holdToken: request.holdToken
    })
  ),
  blockSeats: callbackify((request) =>
    inventory.blockSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      blocked: request.blocked
    })
  )
});

const bindAddress = process.env.SEAT_GRPC_BIND || "0.0.0.0:50051";
server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (error, port) => {
  if (error) throw error;
  console.log(`[seat-service] gRPC listening on ${bindAddress} (${port})`);
});
