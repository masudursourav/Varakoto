import { Router } from "express";
import { getStops } from "../controllers/stops.controller.js";
import { calculateFare } from "../controllers/fare.controller.js";
import {
  validateBody,
  FareRequestSchema,
} from "../middleware/validateRequest.js";

const router = Router();

router.get("/stops", getStops);
router.post("/fare/calculate", validateBody(FareRequestSchema), calculateFare);

export default router;
