import { Router } from "express";

export function createTripRouter(controller) {
  const router = Router();
  router.get("/health", controller.health);
  router.get("/locations", controller.catalog);
  router.route("/stops").get(controller.listStops).post(controller.createStop);
  router.route("/stops/:id").put(controller.updateStop).delete(controller.deleteStop);
  router.route("/vehicles").get(controller.listVehicles).post(controller.createVehicle);
  router.route("/vehicles/:id").put(controller.updateVehicle).delete(controller.deleteVehicle);
  router.route("/routes").get(controller.listRoutes).post(controller.createRoute);
  router.route("/routes/:id").put(controller.updateRoute).delete(controller.deleteRoute);
  router.route("/trips").get(controller.searchTrips).post(controller.createTrip);
  router.route("/trips/:id").get(controller.getTrip).put(controller.updateTrip).delete(controller.deleteTrip);
  router.patch("/trips/:id/status", controller.updateTripStatus);
  return router;
}
