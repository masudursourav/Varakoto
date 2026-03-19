import type { Request, Response, NextFunction } from "express";
import { normalizeText } from "../utils/normalizeText.js";
import { findNearestByCoords, STOP_COORDS } from "../utils/geo.js";
import { getStopMap } from "../utils/stopMap.js";
import { env } from "../config/env.js";

/**
 * GET /api/v1/route-to-stop?lat=23.78&lng=90.41
 *
 * Finds the nearest bus stop, then fetches a walking route from
 * the user's position to that stop via the Barikoi Routing API.
 */
export async function getRouteToStop(
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

    // Find nearest stop
    const nearest = findNearestByCoords(lat, lng, 1);
    if (nearest.length === 0) {
      res.json({ success: true, data: null });
      return;
    }

    const stopName = nearest[0].name;
    const stopCoords = STOP_COORDS[stopName];
    if (!stopCoords) {
      res.json({ success: true, data: null });
      return;
    }

    // Look up Bengali name from cached stop map
    const stopMap = await getStopMap();
    const dbStop = stopMap.get(normalizeText(stopName));
    const stopNameBn = dbStop?.name_bn ?? stopName;

    const [stopLat, stopLng] = stopCoords;

    // Fetch walking route from Barikoi Routing API
    let routeGeometry: [number, number][] | null = null;
    let durationMin: number | null = null;
    let distanceKm: number | null = null;

    if (env.BARIKOI_API_KEY) {
      try {
        const url = `https://barikoi.xyz/v2/api/route/foot/${lng},${lat};${stopLng},${stopLat}?api_key=${env.BARIKOI_API_KEY}&overview=full&geometries=geojson`;
        const routeRes = await fetch(url);
        const routeData = await routeRes.json();

        if (routeData.routes && routeData.routes.length > 0) {
          const route = routeData.routes[0];
          // GeoJSON coordinates are [lng, lat] — convert to [lat, lng] for Leaflet
          routeGeometry = route.geometry.coordinates.map(
            (c: [number, number]) => [c[1], c[0]] as [number, number],
          );
          durationMin = Math.round(route.duration / 60);
          distanceKm = Math.round((route.distance / 1000) * 10) / 10;
        }
      } catch {
        // Routing failed — we still return stop info without route
      }
    }

    res.json({
      success: true,
      data: {
        user: { lat, lng },
        stop: {
          name_en: stopName,
          name_bn: stopNameBn,
          lat: stopLat,
          lng: stopLng,
          distance_km: Math.round(nearest[0].distance * 10) / 10,
        },
        route: routeGeometry
          ? {
              geometry: routeGeometry,
              duration_min: durationMin,
              distance_km: distanceKm,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
}
