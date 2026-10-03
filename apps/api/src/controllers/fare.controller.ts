import type { Request, Response, NextFunction } from "express";
import { BusRoute, type Stop } from "../models/busRoute.model.js";
import { resolveEnglishNames } from "../utils/stopAlias.js";
import { getConsensusDistance } from "../utils/distanceConsensus.js";
import { sanitizeInput, normalizeText } from "../utils/normalizeText.js";
import { matchingIndexes, routeSegmentDistance } from "../utils/routeDistance.js";
import {
  calculateRideFare,
  resolveRatePerKm,
  roundDistance,
  roundFare,
} from "../utils/fare.js";

/** Maximum number of transfer (segmented-journey) options to return. */
const MAX_TRANSFER_RESULTS = 5;

// Elevated expressway corridor stops (Kawla–Farmgate via Banani–Tejgaon)
const ELEVATED_EXPRESSWAY_STOPS = [
  "kawla",
  "khilkhet",
  "kuril",
  "banani",
  "mohakhali",
  "tejgaon",
  "farmgate",
  "bijoy sarani",
  "khejur bagan",
].map((s) => s.toLowerCase());

// Buses that always use the elevated expressway regardless of corridor detection
const ALWAYS_ELEVATED_BUSES = ["azmari", "vip 27", "bikash"];

function isAlwaysElevatedBus(busName: string): boolean {
  const norm = busName.trim().toLowerCase();
  return ALWAYS_ELEVATED_BUSES.some((b) => norm.includes(b));
}

function mayUseElevatedExpressway(
  originEn: string,
  destEn: string,
  routeStops: Stop[],
  busName: string,
): boolean {
  if (isAlwaysElevatedBus(busName)) return true;

  const normOrigin = normalizeText(originEn);
  const normDest = normalizeText(destEn);

  const originOnCorridor = ELEVATED_EXPRESSWAY_STOPS.some((s) =>
    normOrigin.includes(s),
  );
  const destOnCorridor = ELEVATED_EXPRESSWAY_STOPS.some((s) =>
    normDest.includes(s),
  );
  if (!originOnCorridor || !destOnCorridor) return false;

  const routeStopNames = routeStops.map((s) => normalizeText(s.name_en));
  const corridorCount = routeStopNames.filter((name) =>
    ELEVATED_EXPRESSWAY_STOPS.some((s) => name.includes(s)),
  ).length;

  return corridorCount >= 2;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransferLeg {
  bus: string;
  route_name_en: string;
  route_name_bn: string;
  origin: string;
  destination: string;
  distance: number;
  fare: number;
}

interface FareResult {
  bus: string;
  route_name_en: string;
  route_name_bn: string;
  origin_stop: string;
  destination_stop: string;
  distance: number;
  fare: number;
  rate_per_km: number;
  is_transfer: boolean;
  may_use_elevated_expressway: boolean;
  /** "route" = measured along the bus's stop sequence; "point-to-point" = fallback. */
  alignment: "route" | "point-to-point";
  transfer?: {
    transfer_stop_en: string;
    transfer_stop_bn: string;
    leg1: TransferLeg;
    leg2: TransferLeg;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildStopMatcher(
  canonicalNames: string[],
): { name_en: { $regex: RegExp } }[] {
  return canonicalNames.map((name) => ({
    name_en: { $regex: new RegExp(`^${escapeForRegex(name)}$`, "i") },
  }));
}

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Point-to-point distance between two stops (consensus engine, with the
 * route's own cumulative kilometre marks as a last resort).
 */
async function getPointDistance(stop1: Stop, stop2: Stop): Promise<number> {
  const consensus = await getConsensusDistance(stop1.name_en, stop2.name_en);
  if (consensus !== null) return consensus;

  return Math.abs(stop2.km - stop1.km);
}

/**
 * Best distance for a specific route segment: prefer the route-aligned
 * distance (what the bus actually drives) and fall back to point-to-point
 * only when the segment cannot be reconstructed from verified hop data.
 *
 * The aligned sum is not re-checked against the straight line: every hop
 * in the sum is individually validated, and legitimate bus detours (e.g.
 * Ansar Camp → Banani via ECB) are exactly the cases that exceed a
 * straight-line bound.
 */
async function getRouteSegmentDistance(
  routeStops: Stop[],
  fromIdx: number,
  toIdx: number,
  from: Stop,
  to: Stop,
): Promise<{ distance: number; alignment: "route" | "point-to-point" }> {
  return routeSegmentDistance(
    routeStops,
    fromIdx,
    toIdx,
    getConsensusDistance,
    () => getPointDistance(from, to),
  );
}

// ─── Controller ───────────────────────────────────────────────────────────────

export async function calculateFare(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // req.body is already validated by the validateBody(FareRequestSchema)
    // middleware mounted in the router, so origin/destination are guaranteed
    // to be non-empty strings ≤ 200 chars.
    const { origin, destination } = req.body as {
      origin: string;
      destination: string;
    };

    const sanitizedOrigin = sanitizeInput(origin);
    const sanitizedDestination = sanitizeInput(destination);

    const [originNames, destinationNames] = await Promise.all([
      resolveEnglishNames(sanitizedOrigin),
      resolveEnglishNames(sanitizedDestination),
    ]);

    if (originNames.length === 0) {
      res.status(404).json({
        success: false,
        message: "Origin stop not found",
      });
      return;
    }

    if (destinationNames.length === 0) {
      res.status(404).json({
        success: false,
        message: "Destination stop not found",
      });
      return;
    }

    const originKeys = new Set(originNames.map(normalizeText));
    const destinationKeys = new Set(destinationNames.map(normalizeText));

    // Reject same-stop queries at the API level (the UI also blocks them).
    if (
      destinationNames.every((name) => originKeys.has(normalizeText(name)))
    ) {
      res.status(400).json({
        success: false,
        message: "Origin and destination must be different stops",
      });
      return;
    }

    const originMatchers = buildStopMatcher(originNames);
    const destinationMatchers = buildStopMatcher(destinationNames);

    // ── Fetch routes ──────────────────────────────────────────────────────────
    // Direct routes (both stops), routes from the origin, routes to the
    // destination. All three queries run in parallel; the origin/destination
    // route sets are also the basis for segmented-journey alternatives.

    const [directRoutes, originRoutes, destRoutes] = await Promise.all([
      BusRoute.find({
        stops: {
          $all: [
            { $elemMatch: { $or: originMatchers } },
            { $elemMatch: { $or: destinationMatchers } },
          ],
        },
      }).lean(),
      BusRoute.find({
        stops: { $elemMatch: { $or: originMatchers } },
      }).lean(),
      BusRoute.find({
        stops: { $elemMatch: { $or: destinationMatchers } },
      }).lean(),
    ]);

    const results: FareResult[] = [];

    // ── Pass 1: Direct routes ─────────────────────────────────────────────────
    // For each route, choose the origin/destination occurrence pair with the
    // shortest travelled distance, measured along the route's own alignment.

    for (const route of directRoutes) {
      const stops = route.stops;

      let best: {
        distance: number;
        alignment: "route" | "point-to-point";
        originIdx: number;
        destIdx: number;
      } | null = null;

      for (let oi = 0; oi < stops.length; oi++) {
        if (!originKeys.has(normalizeText(stops[oi].name_en))) continue;

        for (let di = 0; di < stops.length; di++) {
          if (oi === di) continue;
          if (!destinationKeys.has(normalizeText(stops[di].name_en))) continue;

          const segment = await getRouteSegmentDistance(
            stops,
            oi,
            di,
            stops[oi],
            stops[di],
          );

          if (!best || segment.distance < best.distance) {
            best = {
              distance: segment.distance,
              alignment: segment.alignment,
              originIdx: oi,
              destIdx: di,
            };
          }
        }
      }

      if (!best) continue;

      const originStop = stops[best.originIdx];
      const destStop = stops[best.destIdx];
      const distance = roundDistance(best.distance);
      const rate = resolveRatePerKm(route.rate_per_km);
      const fare = calculateRideFare(distance, route.min_fare, rate);

      const buses =
        route.buses.length > 0 ? route.buses : [route.route_name_en];

      for (const bus of buses) {
        const elevated = mayUseElevatedExpressway(
          originStop.name_en,
          destStop.name_en,
          stops,
          bus,
        );

        results.push({
          bus,
          route_name_en: route.route_name_en,
          route_name_bn: route.route_name_bn,
          origin_stop: originStop.name_en,
          destination_stop: destStop.name_en,
          distance,
          fare,
          rate_per_km: rate,
          is_transfer: false,
          may_use_elevated_expressway: elevated,
          alignment: best.alignment,
        });
      }
    }

    // ── Pass 2: Segmented journeys (one transfer) ─────────────────────────────
    // Always computed, even when direct routes exist, so users can compare
    // alternatives (e.g. Ansar Camp → Mirpur 14 → Banani vs a slow direct
    // bus). A transfer point is a stop shared by a route from the origin
    // and a route to the destination.

    if (originRoutes.length > 0 && destRoutes.length > 0) {
      // Normalised stop names per route (computed once per route).
      const routeStopNames = new Map<string, string[]>();
      for (const route of [...originRoutes, ...destRoutes]) {
        if (!routeStopNames.has(route.route_id)) {
          routeStopNames.set(
            route.route_id,
            route.stops.map((s) => normalizeText(s.name_en)),
          );
        }
      }

      // Collect valid transfers keyed by route-pair + transfer point; for
      // each key keep only the option with the lowest total fare.
      const transferMap = new Map<
        string,
        { fare: number; distance: number; result: FareResult }
      >();

      for (const route1 of originRoutes) {
        const r1Names = routeStopNames.get(route1.route_id)!;
        const r1OriginIdxs = matchingIndexes(r1Names, originKeys);
        if (r1OriginIdxs.length === 0) continue;

        for (const route2 of destRoutes) {
          if (route1.route_id === route2.route_id) continue;

          const r2Names = routeStopNames.get(route2.route_id)!;
          const r2DestIdxs = matchingIndexes(r2Names, destinationKeys);
          if (r2DestIdxs.length === 0) continue;

          const r2NameSet = new Set(r2Names);
          const commonNames = Array.from(
            new Set(r1Names.filter((name) => r2NameSet.has(name))),
          );
          if (commonNames.length === 0) continue;

          const bus1s =
            route1.buses.length > 0 ? route1.buses : [route1.route_name_en];
          const bus2s =
            route2.buses.length > 0 ? route2.buses : [route2.route_name_en];

          const rate1 = resolveRatePerKm(route1.rate_per_km);
          const rate2 = resolveRatePerKm(route2.rate_per_km);

          for (const transferName of commonNames) {
            const r1TransferIdxs = matchingIndexes(r1Names, new Set([transferName]));
            const r2TransferIdxs = matchingIndexes(r2Names, new Set([transferName]));

            for (const oi of r1OriginIdxs) {
              for (const ti1 of r1TransferIdxs) {
                for (const ti2 of r2TransferIdxs) {
                  for (const di of r2DestIdxs) {
                    const [leg1, leg2] = await Promise.all([
                      getRouteSegmentDistance(
                        route1.stops,
                        oi,
                        ti1,
                        route1.stops[oi],
                        route1.stops[ti1],
                      ),
                      getRouteSegmentDistance(
                        route2.stops,
                        ti2,
                        di,
                        route2.stops[ti2],
                        route2.stops[di],
                      ),
                    ]);

                    const leg1Dist = leg1.distance;
                    const leg2Dist = leg2.distance;

                    // Fares per leg (each bus charges separately), then round
                    // the summed total exactly once.
                    const leg1Fare = calculateRideFare(
                      leg1Dist,
                      route1.min_fare,
                      rate1,
                    );
                    const leg2Fare = calculateRideFare(
                      leg2Dist,
                      route2.min_fare,
                      rate2,
                    );
                    const totalFare = leg1Fare + leg2Fare;
                    const totalDistance = roundDistance(leg1Dist + leg2Dist);

                    // Reasonableness cap: skip if the transfer costs more than
                    // 1.5× what a hypothetical direct trip would cost.
                    const hypotheticalDirect = roundFare(
                      Math.max(
                        Math.max(
                          route1.min_fare ?? 0,
                          route2.min_fare ?? 0,
                        ),
                        totalDistance * Math.max(rate1, rate2),
                      ),
                    );

                    if (totalFare > hypotheticalDirect * 1.5) continue;

                    const busPairKey = `${bus1s.join("/")}|||${bus2s.join("/")}`;
                    const optionKey = `${busPairKey}|||${transferName}`;
                    const existing = transferMap.get(optionKey);

                    if (
                      existing &&
                      (existing.fare < totalFare ||
                        (existing.fare === totalFare &&
                          existing.distance <= totalDistance))
                    ) {
                      continue;
                    }

                    const ts1 = route1.stops[ti1];
                    const ts2 = route2.stops[ti2];
                    const alignment: "route" | "point-to-point" =
                      leg1.alignment === "route" && leg2.alignment === "route"
                        ? "route"
                        : "point-to-point";

                    for (const bus1 of bus1s) {
                      for (const bus2 of bus2s) {
                        transferMap.set(optionKey, {
                          fare: totalFare,
                          distance: totalDistance,
                          result: {
                            bus: `${bus1} → ${bus2}`,
                            route_name_en: `${route1.route_name_en} → ${route2.route_name_en}`,
                            route_name_bn: `${route1.route_name_bn} → ${route2.route_name_bn}`,
                            origin_stop: route1.stops[oi].name_en,
                            destination_stop: route2.stops[di].name_en,
                            distance: totalDistance,
                            fare: totalFare,
                            rate_per_km: Math.max(rate1, rate2),
                            is_transfer: true,
                            may_use_elevated_expressway: false,
                            alignment,
                            transfer: {
                              transfer_stop_en: ts1.name_en,
                              transfer_stop_bn: ts1.name_bn,
                              leg1: {
                                bus: bus1,
                                route_name_en: route1.route_name_en,
                                route_name_bn: route1.route_name_bn,
                                origin: route1.stops[oi].name_en,
                                destination: ts1.name_en,
                                distance: leg1Dist,
                                fare: leg1Fare,
                              },
                              leg2: {
                                bus: bus2,
                                route_name_en: route2.route_name_en,
                                route_name_bn: route2.route_name_bn,
                                origin: ts2.name_en,
                                destination: route2.stops[di].name_en,
                                distance: leg2Dist,
                                fare: leg2Fare,
                              },
                            },
                          },
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Sort transfer options by fare (then distance) and return the best few.
      const sortedTransfers = Array.from(transferMap.values())
        .sort((a, b) => {
          if (a.fare !== b.fare) return a.fare - b.fare;
          return a.distance - b.distance;
        })
        .slice(0, MAX_TRANSFER_RESULTS)
        .map((t) => t.result);

      results.push(...sortedTransfers);
    }

    // ── Deduplicate & sort results ────────────────────────────────────────────
    // Group by bus + route so distinct routes operated by the same company
    // survive as separate options; keep the shortest distance per group.

    const deduped = new Map<string, FareResult>();
    for (const result of results) {
      const key = `${result.bus}|||${result.route_name_en}`;
      const existing = deduped.get(key);
      if (
        !existing ||
        result.distance < existing.distance ||
        (result.distance === existing.distance && result.fare < existing.fare)
      ) {
        deduped.set(key, result);
      }
    }

    // Sort: fare ascending, tiebreak by distance
    const sorted = Array.from(deduped.values()).sort((a, b) => {
      if (a.fare !== b.fare) return a.fare - b.fare;
      return a.distance - b.distance;
    });

    res.json({ success: true, data: sorted });
  } catch (error) {
    next(error);
  }
}
