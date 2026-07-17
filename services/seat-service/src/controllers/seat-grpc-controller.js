import grpc from "@grpc/grpc-js";
import { AuthError, authenticate, authorize } from "@bus-ai/shared/auth";

/** gRPC controller: converts protobuf calls to SeatInventory domain-service calls. */
export function createSeatGrpcController(inventory) {
  const serviceIdentity = (call) => {
    const authorization = call.metadata.get("authorization")[0];
    return authorize(authenticate({ authorization }), ["SERVICE"]);
  };

  const invoke = (work, { serviceOnly = false } = {}) => async (call, callback) => {
    try {
      if (serviceOnly) serviceIdentity(call);
      callback(null, await work(call.request));
    } catch (error) {
      const code = error instanceof AuthError
        ? (error.status === 403 ? grpc.status.PERMISSION_DENIED : grpc.status.UNAUTHENTICATED)
        : grpc.status.INTERNAL;
      callback({ code, message: error.message });
    }
  };

  return {
    getSeatMap: invoke((request) => inventory.getSeatMap(request.tripId)),
    ensureTripInventory: invoke((request) => inventory.ensureTripInventory({
      tripId: request.tripId,
      seatCount: request.seatCount,
      seats: request.seats
    }), { serviceOnly: true }),
    holdSeats: invoke((request) => inventory.holdSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      customerEmail: request.customerEmail,
      idempotencyKey: request.idempotencyKey,
      ttlSeconds: request.ttlSeconds || 300
    }), { serviceOnly: true }),
    verifyHold: invoke((request) => inventory.verifyHold({
      tripId: request.tripId,
      seatIds: request.seatIds,
      holdToken: request.holdToken,
      customerEmail: request.customerEmail
    }), { serviceOnly: true }),
    extendHold: invoke((request) => inventory.extendHold({
      tripId: request.tripId,
      seatIds: request.seatIds,
      holdToken: request.holdToken,
      customerEmail: request.customerEmail,
      ttlSeconds: request.ttlSeconds || 900
    }), { serviceOnly: true }),
    confirmSeats: invoke((request) => inventory.confirmSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      holdToken: request.holdToken,
      bookingCode: request.bookingCode
    }), { serviceOnly: true }),
    releaseSeats: invoke((request) => inventory.releaseSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      holdToken: request.holdToken
    }), { serviceOnly: true }),
    blockSeats: invoke((request) => inventory.blockSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      blocked: request.blocked
    }), { serviceOnly: true })
  };
}
