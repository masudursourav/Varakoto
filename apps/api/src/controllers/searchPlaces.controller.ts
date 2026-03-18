import type { Request, Response, NextFunction } from "express";
import { BusRoute } from "../models/busRoute.model.js";
import { normalizeText } from "../utils/normalizeText.js";
import { env } from "../config/env.js";
import { findNearestByCoords } from "../utils/geo.js";

/**
 * GET /api/v1/search/places?q=জাতীয় সংসদ
 *
 * Proxies the Barikoi Autocomplete API, then maps each result's lat/lng
 * to the nearest known bus stop so the user can select it for fare lookup.
 */
export async function searchPlaces(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = (req.query.q as string || "").trim();

    if (!q || q.length < 2) {
      res.status(400).json({
        success: false,
        message: "Query parameter 'q' must be at least 2 characters",
      });
      return;
    }

    if (!env.BARIKOI_API_KEY) {
      res.status(503).json({
        success: false,
        message: "Place search is not configured",
      });
      return;
    }

    // Call Barikoi Autocomplete API
    const barikoiUrl = `https://barikoi.xyz/v2/api/search/autocomplete/place?api_key=${env.BARIKOI_API_KEY}&q=${encodeURIComponent(q)}&city=dhaka&bangla=true`;
    const barikoiRes = await fetch(barikoiUrl);
    const barikoiData = await barikoiRes.json();

    if (!barikoiData.places || !Array.isArray(barikoiData.places)) {
      res.json({ success: true, data: [] });
      return;
    }

    // Load all stops from DB to resolve Bengali names
    const routes = await BusRoute.find({}, { stops: 1 }).lean();
    const stopMap = new Map<string, { name_en: string; name_bn: string }>();

    for (const route of routes) {
      for (const stop of route.stops) {
        const key = normalizeText(stop.name_en);
        if (!stopMap.has(key)) {
          stopMap.set(key, { name_en: stop.name_en, name_bn: stop.name_bn });
        }
      }
    }

    // Map each Barikoi result to the nearest known bus stop
    const seen = new Set<string>();
    const suggestions: {
      place_name: string;
      name_en: string;
      name_bn: string;
      distance_km: number;
    }[] = [];

    for (const place of barikoiData.places) {
      const lat = parseFloat(place.latitude);
      const lng = parseFloat(place.longitude);

      if (isNaN(lat) || isNaN(lng)) continue;

      const nearest = findNearestByCoords(lat, lng, 1);
      if (nearest.length === 0) continue;

      const key = normalizeText(nearest[0].name);
      if (seen.has(key)) continue;
      seen.add(key);

      const stop = stopMap.get(key);
      if (!stop) continue;

      suggestions.push({
        place_name: place.address || place.name || q,
        name_en: stop.name_en,
        name_bn: stop.name_bn,
        distance_km: Math.round(nearest[0].distance * 10) / 10,
      });
    }

    res.json({ success: true, data: suggestions.slice(0, 5) });
  } catch (error) {
    next(error);
  }
}
