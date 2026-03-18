import { Router } from "express";
import { getStops } from "../controllers/stops.controller.js";
import { calculateFare } from "../controllers/fare.controller.js";
import { getNearestStop } from "../controllers/nearestStop.controller.js";
import { searchPlaces } from "../controllers/searchPlaces.controller.js";
import { getStopCoords } from "../controllers/stopCoords.controller.js";
import { getRouteToStop } from "../controllers/routeToStop.controller.js";
import { getNearbyStops } from "../controllers/nearbyStops.controller.js";
import {
  validateBody,
  FareRequestSchema,
} from "../middleware/validateRequest.js";

const router = Router();

router.get("/stops", getStops);
router.post("/fare/calculate", validateBody(FareRequestSchema), calculateFare);
router.get("/nearest-stop", getNearestStop);
router.get("/search/places", searchPlaces);
router.get("/stop-coords", getStopCoords);
router.get("/route-to-stop", getRouteToStop);
router.get("/nearby-stops", getNearbyStops);

export default router;
