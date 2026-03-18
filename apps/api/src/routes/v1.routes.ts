import { Router } from "express";
import { getStops } from "../controllers/stops.controller.js";
import { calculateFare } from "../controllers/fare.controller.js";
import { getNearestStop } from "../controllers/nearestStop.controller.js";
import { searchPlaces } from "../controllers/searchPlaces.controller.js";
import {
  validateBody,
  FareRequestSchema,
} from "../middleware/validateRequest.js";

const router = Router();

router.get("/stops", getStops);
router.post("/fare/calculate", validateBody(FareRequestSchema), calculateFare);
router.get("/nearest-stop", getNearestStop);
router.get("/search/places", searchPlaces);

export default router;
