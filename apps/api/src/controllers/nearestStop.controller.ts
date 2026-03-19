import type { Request, Response, NextFunction } from "express";
import { normalizeText } from "../utils/normalizeText.js";
import { env } from "../config/env.js";
import { findNearestByCoords } from "../utils/geo.js";
import { getStopMap } from "../utils/stopMap.js";

/**
 * Try Barikoi reverse geocoding to get area name, then match to stops.
 */
async function barikoiReverse(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (!env.BARIKOI_API_KEY) return null;

  try {
    const url = `https://barikoi.xyz/v2/api/search/reverse/geocode?api_key=${env.BARIKOI_API_KEY}&longitude=${lng}&latitude=${lat}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 200 && data.place) {
      // Barikoi returns area, sub_district, city etc.
      return data.place.area || data.place.sub_district || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/nearest-stop?lat=23.8513&lng=90.4089
 *
 * Returns the nearest bus stops to the given coordinates.
 */
export async function getNearestStop(
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

    // Strategy 1: Find nearest by known coordinates
    const nearestByCoords = findNearestByCoords(lat, lng, 5);

    // Strategy 2: Try Barikoi reverse geocoding for area name matching
    const areaName = await barikoiReverse(lat, lng);

    const stopMap = await getStopMap();

    // Build final suggestions
    const suggestions: { name_en: string; name_bn: string; distance_km: number | null }[] = [];
    const seen = new Set<string>();

    // Add coordinate-based matches
    for (const nearest of nearestByCoords) {
      const key = normalizeText(nearest.name);
      const stop = stopMap.get(key);
      if (stop && !seen.has(key)) {
        seen.add(key);
        suggestions.push({
          name_en: stop.name_en,
          name_bn: stop.name_bn,
          distance_km: Math.round(nearest.distance * 10) / 10,
        });
      }
    }

    // If Barikoi returned an area name, try to match it to stops
    if (areaName) {
      const normArea = normalizeText(areaName);
      for (const [key, stop] of stopMap) {
        if (!seen.has(key) && (key.includes(normArea) || normArea.includes(key))) {
          seen.add(key);
          suggestions.push({
            name_en: stop.name_en,
            name_bn: stop.name_bn,
            distance_km: null, // unknown exact distance
          });
        }
      }
    }

    res.json({
      success: true,
      area: areaName,
      data: suggestions.slice(0, 5),
    });
  } catch (error) {
    next(error);
  }
}
