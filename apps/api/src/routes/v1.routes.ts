import { Router } from "express";
import { getStops } from "../controllers/stops.controller.js";
import { calculateFare } from "../controllers/fare.controller.js";

const router = Router();

router.get("/stops", getStops);
router.post("/fare/calculate", calculateFare);

export default router;
