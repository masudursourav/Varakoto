import type { Request, Response, NextFunction } from "express";
import { STOP_COORDS, isWithinDhaka } from "../utils/geo.js";
import { normalizeText, sanitizeInput } from "../utils/normalizeText.js";
import { resolveEnglishNames } from "../utils/stopAlias.js";
import { env } from "../config/env.js";

/**
 * In-memory cache for Barikoi geocoding results.
 */
const geocodeCache = new Map<string, [number, number] | null>();

/**
 * Forward-geocode a stop name via Barikoi Autocomplete.
 */
async function barikoiGeocode(
  stopName: string,
): Promise<[number, number] | null> {
  if (!env.BARIKOI_API_KEY) return null;

  const cached = geocodeCache.get(stopName);
  if (cached !== undefined) return cached;

  try {
    const url = `https://barikoi.xyz/v2/api/search/autocomplete/place?api_key=${env.BARIKOI_API_KEY}&q=${encodeURIComponent(stopName + " Dhaka")}&city=dhaka&bangla=true&longitude=90.4125&latitude=23.8103&scale=0.5`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.places && data.places.length > 0) {
      for (const place of data.places) {
        const lat = parseFloat(place.latitude);
        const lng = parseFloat(place.longitude);
        if (!isNaN(lat) && !isNaN(lng) && isWithinDhaka(lat, lng)) {
          const coords: [number, number] = [lat, lng];
          geocodeCache.set(stopName, coords);
          return coords;
        }
      }
    }

    geocodeCache.set(stopName, null);
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve coordinates for a stop — first from STOP_COORDS, then via Barikoi.
 */
async function resolveCoords(
  canonicalNames: string[],
): Promise<[number, number] | null> {
  for (const name of canonicalNames) {
    const norm = normalizeText(name);
    if (STOP_COORDS[norm]) return STOP_COORDS[norm];
  }

  for (const name of canonicalNames) {
    const coords = await barikoiGeocode(name);
    if (coords) return coords;
  }

  return null;
}

/**
 * Fetch driving route geometry between two points via Barikoi Routing API.
 * Returns GeoJSON coordinates as [lng, lat][] for MapLibre GL.
 */
async function fetchRouteGeometry(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<[number, number][] | null> {
  if (!env.BARIKOI_API_KEY) return null;

  try {
    const url = `https://barikoi.xyz/v2/api/route/${fromLng},${fromLat};${toLng},${toLat}?api_key=${env.BARIKOI_API_KEY}&overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      // Already [lng, lat] from GeoJSON — keep as-is for MapLibre GL
      return data.routes[0].geometry.coordinates as [number, number][];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/route-map?origin=...&destination=...&transfer=...
 *
 * Returns stop coordinates and route geometry for the results map.
 */
export async function getRouteMap(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const origin = ((req.query.origin as string) || "").trim();
    const destination = ((req.query.destination as string) || "").trim();
    const transfer = ((req.query.transfer as string) || "").trim();

    if (!origin || !destination) {
      res.status(400).json({
        success: false,
        message: "Both origin and destination query parameters are required",
      });
      return;
    }

    // Resolve all stop names to coordinates in parallel
    const resolveNames = [
      resolveEnglishNames(sanitizeInput(origin)),
      resolveEnglishNames(sanitizeInput(destination)),
    ];
    if (transfer) {
      resolveNames.push(resolveEnglishNames(sanitizeInput(transfer)));
    }
    const allNames = await Promise.all(resolveNames);

    const coordPromises = allNames.map((names) => resolveCoords(names));
    const allCoords = await Promise.all(coordPromises);

    const originCoords = allCoords[0];
    const destCoords = allCoords[1];
    const transferCoords = transfer ? allCoords[2] : null;

    if (!originCoords || !destCoords) {
      res.json({ success: true, data: null });
      return;
    }

    // Fetch route geometry
    const segments: { geometry: [number, number][] }[] = [];

    if (transferCoords) {
      // Two segments: origin → transfer, transfer → destination
      const [seg1, seg2] = await Promise.all([
        fetchRouteGeometry(
          originCoords[0],
          originCoords[1],
          transferCoords[0],
          transferCoords[1],
        ),
        fetchRouteGeometry(
          transferCoords[0],
          transferCoords[1],
          destCoords[0],
          destCoords[1],
        ),
      ]);
      if (seg1) segments.push({ geometry: seg1 });
      if (seg2) segments.push({ geometry: seg2 });
    } else {
      // Single segment: origin → destination
      const geom = await fetchRouteGeometry(
        originCoords[0],
        originCoords[1],
        destCoords[0],
        destCoords[1],
      );
      if (geom) segments.push({ geometry: geom });
    }

    res.json({
      success: true,
      data: {
        origin: { lat: originCoords[0], lng: originCoords[1] },
        destination: { lat: destCoords[0], lng: destCoords[1] },
        transfer: transferCoords
          ? { lat: transferCoords[0], lng: transferCoords[1] }
          : null,
        segments,
      },
    });
  } catch (error) {
    next(error);
  }
}
