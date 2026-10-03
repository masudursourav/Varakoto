/**
 * Route-aligned distance helpers.
 *
 * Fare distances for a bus route must follow the path the bus actually
 * drives, not the straight line between origin and destination. Example:
 * a Rabrab bus from Ansar Camp to Banani runs via the ECB corridor, so
 * its travelled distance (and fare) is higher than the point-to-point
 * distance.
 *
 * `alignedDistance` sums the verified distances of the consecutive hops
 * between two positions on the route's own stop sequence. Every hop is
 * measured through the injected `measure` function (normally the
 * consensus engine) and must be a finite positive number; if any hop is
 * unavailable the function returns null and the caller falls back to
 * point-to-point measurement.
 */

import type { Stop } from "../models/busRoute.model.js";
import { normalizeText } from "./normalizeText.js";
import { roundDistance } from "./fare.js";

/** Async distance measurement between two stops in km, or null. */
export type MeasureFn = (stop1: string, stop2: string) => Promise<number | null>;

/** All indexes in `names` whose normalised form is in `keys`. */
export function matchingIndexes(names: string[], keys: Set<string>): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < names.length; i++) {
    if (keys.has(normalizeText(names[i]))) indexes.push(i);
  }
  return indexes;
}

/**
 * Distance travelled along the route between two positions, as the sum
 * of the verified consecutive hops between them.
 *
 * Returns 0 for the same position, null when any hop is unavailable or
 * implausible (so the caller can fall back).
 */
export async function alignedDistance(
  stops: Stop[],
  fromIdx: number,
  toIdx: number,
  measure: MeasureFn,
): Promise<number | null> {
  if (fromIdx === toIdx) return 0;
  if (
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= stops.length ||
    toIdx >= stops.length
  ) {
    return null;
  }

  const start = Math.min(fromIdx, toIdx);
  const end = Math.max(fromIdx, toIdx);

  let total = 0;
  for (let i = start; i < end; i++) {
    const hop = await measure(stops[i].name_en, stops[i + 1].name_en);
    if (hop === null || !Number.isFinite(hop) || hop <= 0) return null;
    total += hop;
  }

  return roundDistance(total);
}

/**
 * Best distance for a route segment: the route-aligned sum when it can
 * be reconstructed from verified hop data, otherwise point-to-point.
 */
export async function routeSegmentDistance(
  stops: Stop[],
  fromIdx: number,
  toIdx: number,
  measure: MeasureFn,
  pointToPoint: () => Promise<number>,
): Promise<{ distance: number; alignment: "route" | "point-to-point" }> {
  const aligned = await alignedDistance(stops, fromIdx, toIdx, measure);

  if (aligned !== null && aligned > 0) {
    return { distance: aligned, alignment: "route" };
  }

  return { distance: await pointToPoint(), alignment: "point-to-point" };
}
