/**
 * Distance plausibility checks shared by the consensus engine and the
 * distance-maintenance scripts.
 *
 * Bad Google geocoding produced cache entries such as 66 km for
 * Abdullahpur→Airport (actual driving distance ≈ 5 km) in the past.
 * Every value must pass these checks before it is cached or used,
 * otherwise a single bad entry silently corrupts fares.
 */

import { STOP_COORDS, haversineKm } from "./geo.js";
import { normalizeText } from "./normalizeText.js";

/** Hard bounds for a plausible inter-stop driving distance (km). */
export const MIN_PLAUSIBLE_KM = 0.02;
export const MAX_PLAUSIBLE_KM = 60;

function compact(text: string): string {
  return text.toLowerCase().replace(/[\s\-_.,'()]/g, "");
}

/**
 * Returns true when `km` is a physically plausible driving distance
 * between the two named stops.
 *
 * - Absolute bounds always apply.
 * - When both stops have known coordinates, the value must be at least
 *   90% of the straight-line distance (roads are never shorter than the
 *   great-circle distance) and no more than 4× it plus 5 km (generous
 *   allowance for river crossings and ring-road detours).
 * - A distance between two name variants of the same physical stop must
 *   be ~0.
 */
export function isPlausibleDistance(
  stop1: string,
  stop2: string,
  km: number,
): boolean {
  if (!Number.isFinite(km)) return false;

  // Two names for the same physical stop must resolve to ~0.
  if (compact(stop1) === compact(stop2)) {
    return km >= 0 && km <= 0.5;
  }

  if (km <= MIN_PLAUSIBLE_KM || km > MAX_PLAUSIBLE_KM) return false;

  const coords1 = STOP_COORDS[normalizeText(stop1)];
  const coords2 = STOP_COORDS[normalizeText(stop2)];
  if (!coords1 || !coords2) return true;

  const straightLine = haversineKm(
    coords1[0],
    coords1[1],
    coords2[0],
    coords2[1],
  );

  return km >= straightLine * 0.9 && km <= straightLine * 4 + 5;
}
