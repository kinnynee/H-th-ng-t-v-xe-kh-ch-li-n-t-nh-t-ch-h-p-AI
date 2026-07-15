import { Router } from "express";

export function createTripRouter(controller, { requireRoles }) {
  const router = Router();
  router.get("/health", controller.health);
  router.get("/locations", controller.catalog);
  const admin = requireRoles("ADMIN");
  const operator = requireRoles("ADMIN", "STAFF");
  router.route("/stops").get(controller.listStops).post(admin, controller.createStop);
  router.route("/stops/:id").put(admin, controller.updateStop).delete(admin, controller.deleteStop);
  router.route("/vehicles").get(controller.listVehicles).post(admin, controller.createVehicle);
  router.route("/vehicles/:id").put(admin, controller.updateVehicle).delete(admin, controller.deleteVehicle);
  router.route("/routes").get(controller.listRoutes).post(admin, controller.createRoute);
  router.route("/routes/:id").put(admin, controller.updateRoute).delete(admin, controller.deleteRoute);
  router.route("/trips").get(controller.searchTrips).post(admin, controller.createTrip);
  router.route("/trips/:id").get(controller.getTrip).put(admin, controller.updateTrip).delete(admin, controller.deleteTrip);
  router.patch("/trips/:id/status", operator, controller.updateTripStatus);
  return router;
}
