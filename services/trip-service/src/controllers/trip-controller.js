import { asyncHandler } from "@bus-ai/shared/http";

/** HTTP controller layer: maps Express input/output to service calls only. */
export function createTripController(service) {
  const respond = (work, status = 200, key) => asyncHandler(async (req, res) => {
    const result = await work(req);
    res.status(status).json(key ? { [key]: result } : result ?? { ok: true });
  });

  return {
    health: respond(() => service.health()),
    catalog: respond(() => service.catalog()),
    listStops: respond(() => service.listStops()),
    createStop: respond((req) => service.createStop(req.body), 201, "stop"),
    updateStop: respond((req) => service.updateStop(req.params.id, req.body), 200, "stop"),
    deleteStop: respond(async (req) => { await service.deleteStop(req.params.id); }),
    listVehicles: respond(() => service.listVehicles()),
    createVehicle: respond((req) => service.createVehicle(req.body), 201, "vehicle"),
    updateVehicle: respond((req) => service.updateVehicle(req.params.id, req.body), 200, "vehicle"),
    deleteVehicle: respond(async (req) => { await service.deleteVehicle(req.params.id); }),
    listRoutes: respond(() => service.listRoutes()),
    createRoute: respond((req) => service.createRoute(req.body), 201, "route"),
    updateRoute: respond((req) => service.updateRoute(req.params.id, req.body), 200, "route"),
    deleteRoute: respond(async (req) => { await service.deleteRoute(req.params.id); }),
    searchTrips: respond((req) => service.search(req.query)),
    getTrip: respond((req) => ({ trip: service.getTrip(req.params.id) })),
    createTrip: respond((req) => service.saveTrip(null, req.body), 201, "trip"),
    updateTrip: respond((req) => service.saveTrip(req.params.id, req.body), 200, "trip"),
    deleteTrip: respond(async (req) => { await service.deleteTrip(req.params.id); }),
    updateTripStatus: respond((req) => service.updateTripStatus(req.params.id, req.body.status), 200, "trip")
  };
}
