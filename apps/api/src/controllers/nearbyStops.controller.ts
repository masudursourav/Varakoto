import type { Request, Response, NextFunction } from "express";
import { normalizeText } from "../utils/normalizeText.js";
import { findNearbyWithCoords } from "../utils/geo.js";
import { getStopMap } from "../utils/stopMap.js";

/** Default search radius in km. */
const DEFAULT_RADIUS_KM = 5;
const MAX_RESULTS = 15;

/**
 * GET /api/v1/nearby-stops?lat=23.78&lng=90.41
 *
 * Returns all bus stops within a radius of the user's GPS position,
 * including their coordinates so the frontend can render them on a map.
 */
export async function getNearbyStops(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({
        success: false,
        message: "lat and lng query parameters are required",
      });
      return;
    }

    const nearby = findNearbyWithCoords(lat, lng, DEFAULT_RADIUS_KM, MAX_RESULTS);
    const stopMap = await getStopMap();

    const data = nearby
      .map((s) => {
        const dbStop = stopMap.get(normalizeText(s.name));
        return {
          name_en: dbStop?.name_en ?? s.name,
          name_bn: dbStop?.name_bn ?? s.name,
          lat: s.lat,
          lng: s.lng,
          distance_km: Math.round(s.distance * 10) / 10,
        };
      })
      .filter((s) => stopMap.has(normalizeText(s.name_en)));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
