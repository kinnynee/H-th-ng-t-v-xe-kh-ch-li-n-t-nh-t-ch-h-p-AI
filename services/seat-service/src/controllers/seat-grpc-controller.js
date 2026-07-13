import grpc from "@grpc/grpc-js";

/** gRPC controller: converts protobuf calls to SeatInventory domain-service calls. */
export function createSeatGrpcController(inventory) {
  const invoke = (work) => async (call, callback) => {
    try {
      callback(null, await work(call.request));
    } catch (error) {
      callback({ code: grpc.status.INTERNAL, message: error.message });
    }
  };

  return {
    getSeatMap: invoke((request) => inventory.getSeatMap(request.tripId)),
    holdSeats: invoke((request) => inventory.holdSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      customerEmail: request.customerEmail,
      idempotencyKey: request.idempotencyKey,
      ttlSeconds: request.ttlSeconds || 300
    })),
    confirmSeats: invoke((request) => inventory.confirmSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      holdToken: request.holdToken,
      bookingCode: request.bookingCode
    })),
    releaseSeats: invoke((request) => inventory.releaseSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      holdToken: request.holdToken
    })),
    blockSeats: invoke((request) => inventory.blockSeats({
      tripId: request.tripId,
      seatIds: request.seatIds,
      blocked: request.blocked
    }))
  };
}
