/**
 * Fare rules — single source of truth for BRTA city-bus pricing.
 *
 * Current gazette (Road Transport and Highways Division, effective
 * 2026-09-22): diesel buses/minibuses in the Dhaka and Chattogram
 * metropolitan areas cost ৳2.70 per kilometre; the Dhaka minimum fare
 * is ৳10 (Chattogram ৳8). This app covers Dhaka, so ৳10 is the floor.
 */

/** Current BRTA rate per kilometre for Dhaka metropolitan buses (৳). */
export const BRTA_RATE_PER_KM = 2.7;

/** Minimum fare for a ride in the Dhaka metropolitan area (৳). */
export const BRTA_MIN_FARE_DHAKA = 10;

/**
 * Resolve the effective per-kilometre rate for a route.
 *
 * The database may still hold an older gazette rate (it is not updated
 * when BRTA revises fares). Route-specific premium rates are honoured
 * when they are *above* the current floor, but a ride is never billed
 * below the gazette rate.
 */
export function resolveRatePerKm(routeRate?: number | null): number {
  if (
    typeof routeRate === "number" &&
    Number.isFinite(routeRate) &&
    routeRate > BRTA_RATE_PER_KM
  ) {
    return routeRate;
  }
  return BRTA_RATE_PER_KM;
}

/** Round a distance to 2 decimal places (kilometres). */
export function roundDistance(distance: number): number {
  return Math.round(distance * 100) / 100;
}

/**
 * Round a raw fare to whole taka (BRTA publishes whole-taka fares).
 * A tiny epsilon counters binary floating-point representation error,
 * e.g. 42.005 computing as 42.004999... .
 */
export function roundFare(fare: number): number {
  return Math.round(fare + 1e-9);
}

/**
 * Fare for one ride, in whole taka:
 *   max(route minimum, BRTA metro minimum, distance × rate)
 *
 * The BRTA metro minimum is enforced on top of the stored route
 * minimum so stale database values can never produce a fare below the
 * current gazette floor.
 */
export function calculateRideFare(
  distanceKm: number,
  minFare?: number | null,
  ratePerKm: number = BRTA_RATE_PER_KM,
): number {
  const routeMinimum =
    typeof minFare === "number" && Number.isFinite(minFare) && minFare > 0
      ? minFare
      : 0;

  return roundFare(
    Math.max(routeMinimum, BRTA_MIN_FARE_DHAKA, distanceKm * ratePerKm),
  );
}
