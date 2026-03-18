import type { Request, Response, NextFunction } from "express";
import { STOP_COORDS, isWithinDhaka } from "../utils/geo.js";
import { normalizeText } from "../utils/normalizeText.js";
import { resolveEnglishNames } from "../utils/stopAlias.js";
import { sanitizeInput } from "../utils/normalizeText.js";
import { env } from "../config/env.js";

/**
 * In-memory cache for Barikoi geocoding results so we don't re-fetch
 * the same stop coordinates repeatedly.
 */
const geocodeCache = new Map<string, [number, number] | null>();

/**
 * Forward-geocode a stop name via Barikoi Autocomplete.
 * Returns [lat, lng] or null.
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
 * Find coordinates for a stop — first from STOP_COORDS, then via Barikoi.
 */
async function resolveCoords(
  canonicalNames: string[],
): Promise<[number, number] | null> {
  // 1. Check hardcoded STOP_COORDS
  for (const name of canonicalNames) {
    const norm = normalizeText(name);
    if (STOP_COORDS[norm]) return STOP_COORDS[norm];
  }

  // 2. Fallback: Barikoi forward geocoding
  for (const name of canonicalNames) {
    const coords = await barikoiGeocode(name);
    if (coords) return coords;
  }

  return null;
}

/**
 * GET /api/v1/stop-coords?origin=Airport&destination=Farmgate
 *
 * Returns lat/lng for the two stops so the frontend can render a map preview.
 */
export async function getStopCoords(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const origin = (req.query.origin as string || "").trim();
    const destination = (req.query.destination as string || "").trim();

    if (!origin || !destination) {
      res.status(400).json({
        success: false,
        message: "Both origin and destination query parameters are required",
      });
      return;
    }

    const [originNames, destNames] = await Promise.all([
      resolveEnglishNames(sanitizeInput(origin)),
      resolveEnglishNames(sanitizeInput(destination)),
    ]);

    const [originCoords, destCoords] = await Promise.all([
      resolveCoords(originNames),
      resolveCoords(destNames),
    ]);

    if (!originCoords || !destCoords) {
      res.json({ success: true, data: null });
      return;
    }

    res.json({
      success: true,
      data: {
        origin: { lat: originCoords[0], lng: originCoords[1] },
        destination: { lat: destCoords[0], lng: destCoords[1] },
      },
    });
  } catch (error) {
    next(error);
  }
}
