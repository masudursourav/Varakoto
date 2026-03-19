import { BusRoute } from "../models/busRoute.model.js";
import { normalizeText } from "./normalizeText.js";

/**
 * Cached map of normalised English stop name → { name_en, name_bn }.
 * Rebuilt at most once per CACHE_TTL_MS from MongoDB.
 */

let cache: Map<string, { name_en: string; name_bn: string }> | null = null;
let cacheBuiltAt: number | null = null;

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function buildStopMap(): Promise<
  Map<string, { name_en: string; name_bn: string }>
> {
  const routes = await BusRoute.find({}, { stops: 1 }).lean();
  const map = new Map<string, { name_en: string; name_bn: string }>();

  for (const route of routes) {
    for (const stop of route.stops) {
      const key = normalizeText(stop.name_en);
      if (!map.has(key)) {
        map.set(key, { name_en: stop.name_en, name_bn: stop.name_bn });
      }
    }
  }

  return map;
}

/**
 * Returns the cached stop map, rebuilding it if stale (>10 min).
 */
export async function getStopMap(): Promise<
  Map<string, { name_en: string; name_bn: string }>
> {
  const now = Date.now();
  const isStale =
    !cache || cacheBuiltAt === null || now - cacheBuiltAt > CACHE_TTL_MS;

  if (isStale) {
    cache = await buildStopMap();
    cacheBuiltAt = now;
  }

  return cache!;
}

/**
 * Force the stop map to be rebuilt on the next request.
 */
export function invalidateStopMap(): void {
  cache = null;
  cacheBuiltAt = null;
}
