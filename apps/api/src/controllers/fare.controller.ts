import type { Request, Response, NextFunction } from "express";
import { BusRoute, type Stop } from "../models/busRoute.model.js";
import { resolveEnglishNames } from "../utils/stopAlias.js";
import { getConsensusDistance } from "../utils/distanceConsensus.js";
import { sanitizeInput, normalizeText } from "../utils/normalizeText.js";
import {
  calculateRideFare,
  resolveRatePerKm,
  roundDistance,
  roundFare,
} from "../utils/fare.js";

/** Maximum number of transfer suggestions to return when no direct route exists. */
const MAX_TRANSFER_RESULTS = 3;

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
  transfer?: {
    transfer_stop_en: string;
    transfer_stop_bn: string;
    leg1: TransferLeg;
    leg2: TransferLeg;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findAllStops(stops: Stop[], canonicalNames: string[]): Stop[] {
  return stops.filter((stop) =>
    canonicalNames.includes(normalizeText(stop.name_en)),
  );
}

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
 * Get the best distance between two stops using the consensus engine.
 * Falls back to the route's own cumulative kilometre marks when the
 * consensus engine has no data for the pair.
 */
async function getBestDistance(stop1: Stop, stop2: Stop): Promise<number> {
  const consensus = await getConsensusDistance(stop1.name_en, stop2.name_en);
  if (consensus !== null) return consensus;

  return Math.abs(stop2.km - stop1.km);
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

    // Reject same-stop queries at the API level (the UI also blocks them).
    const originKeys = new Set(originNames.map(normalizeText));
    if (destinationNames.every((name) => originKeys.has(normalizeText(name)))) {
      res.status(400).json({
        success: false,
        message: "Origin and destination must be different stops",
      });
      return;
    }

    const originMatchers = buildStopMatcher(originNames);
    const destinationMatchers = buildStopMatcher(destinationNames);

    // ── Pass 1: Direct routes ─────────────────────────────────────────────────

    const directRoutes = await BusRoute.find({
      stops: {
        $all: [
          { $elemMatch: { $or: originMatchers } },
          { $elemMatch: { $or: destinationMatchers } },
        ],
      },
    }).lean();

    const results: FareResult[] = [];

    if (directRoutes.length > 0) {
      for (const route of directRoutes) {
        const originStops = findAllStops(route.stops, originNames);
        const destStops = findAllStops(route.stops, destinationNames);

        let minDistance = Infinity;
        let bestOrigin: Stop | null = null;
        let bestDest: Stop | null = null;

        for (const os of originStops) {
          for (const ds of destStops) {
            const dist = await getBestDistance(os, ds);
            if (dist < minDistance) {
              minDistance = dist;
              bestOrigin = os;
              bestDest = ds;
            }
          }
        }

        if (!bestOrigin || !bestDest) continue;

        const distance = roundDistance(minDistance);
        const rate = resolveRatePerKm(route.rate_per_km);
        const fare = calculateRideFare(distance, route.min_fare, rate);

        const buses =
          route.buses.length > 0 ? route.buses : [route.route_name_en];

        for (const bus of buses) {
          const elevated = mayUseElevatedExpressway(
            bestOrigin.name_en,
            bestDest.name_en,
            route.stops,
            bus,
          );

          results.push({
            bus,
            route_name_en: route.route_name_en,
            route_name_bn: route.route_name_bn,
            origin_stop: bestOrigin.name_en,
            destination_stop: bestDest.name_en,
            distance,
            fare,
            rate_per_km: rate,
            is_transfer: false,
            may_use_elevated_expressway: elevated,
          });
        }
      }
    } else {
      // ── Pass 2: Multi-bus transfers ─────────────────────────────────────────
      //
      // When no single route covers both stops we look for a transfer point —
      // a stop shared by a route from the origin and a route to the destination.
      //
      // We collect ALL valid transfer options, deduplicate them by
      // bus-pair + transfer-stop key, sort by fare, and return the top
      // MAX_TRANSFER_RESULTS options so the user can compare alternatives.

      const [originRoutes, destRoutes] = await Promise.all([
        BusRoute.find({
          stops: { $elemMatch: { $or: originMatchers } },
        }).lean(),
        BusRoute.find({
          stops: { $elemMatch: { $or: destinationMatchers } },
        }).lean(),
      ]);

      // Collect valid transfers in a map keyed by the full option so distinct
      // bus pairs *and* distinct transfer points both survive deduplication.
      const transferMap = new Map<
        string,
        { fare: number; distance: number; result: FareResult }
      >();

      for (const route1 of originRoutes) {
        for (const route2 of destRoutes) {
          if (route1.route_id === route2.route_id) continue;

          const route1StopNames = route1.stops.map((s) =>
            normalizeText(s.name_en),
          );
          const route2StopNames = route2.stops.map((s) =>
            normalizeText(s.name_en),
          );

          const commonNames = Array.from(
            new Set(
              route1StopNames.filter((name) =>
                route2StopNames.includes(name),
              ),
            ),
          );

          if (commonNames.length === 0) continue;

          const bus1s =
            route1.buses.length > 0 ? route1.buses : [route1.route_name_en];
          const bus2s =
            route2.buses.length > 0 ? route2.buses : [route2.route_name_en];

          const originStops = findAllStops(route1.stops, originNames);
          const destStops = findAllStops(route2.stops, destinationNames);

          for (const transferName of commonNames) {
            const transferStopsR1 = route1.stops.filter(
              (s) => normalizeText(s.name_en) === transferName,
            );
            const transferStopsR2 = route2.stops.filter(
              (s) => normalizeText(s.name_en) === transferName,
            );

            for (const os of originStops) {
              for (const ts1 of transferStopsR1) {
                for (const ts2 of transferStopsR2) {
                  for (const ds of destStops) {
                    const [leg1Dist, leg2Dist] = await Promise.all([
                      getBestDistance(os, ts1).then(roundDistance),
                      getBestDistance(ts2, ds).then(roundDistance),
                    ]);

                    const rate1 = resolveRatePerKm(route1.rate_per_km);
                    const rate2 = resolveRatePerKm(route2.rate_per_km);

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
                    // 1.5× what a hypothetical direct trip would cost. The
                    // hypothetical trip crosses both routes, so a traveller
                    // would be charged the higher of the two minimums.
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

                    for (const bus1 of bus1s) {
                      for (const bus2 of bus2s) {
                        const candidate: FareResult = {
                          bus: `${bus1} → ${bus2}`,
                          route_name_en: `${route1.route_name_en} → ${route2.route_name_en}`,
                          route_name_bn: `${route1.route_name_bn} → ${route2.route_name_bn}`,
                          origin_stop: os.name_en,
                          destination_stop: ds.name_en,
                          distance: totalDistance,
                          fare: totalFare,
                          rate_per_km: Math.max(rate1, rate2),
                          is_transfer: true,
                          may_use_elevated_expressway: false,
                          transfer: {
                            transfer_stop_en: ts1.name_en,
                            transfer_stop_bn: ts1.name_bn,
                            leg1: {
                              bus: bus1,
                              route_name_en: route1.route_name_en,
                              route_name_bn: route1.route_name_bn,
                              origin: os.name_en,
                              destination: ts1.name_en,
                              distance: leg1Dist,
                              fare: leg1Fare,
                            },
                            leg2: {
                              bus: bus2,
                              route_name_en: route2.route_name_en,
                              route_name_bn: route2.route_name_bn,
                              origin: ts2.name_en,
                              destination: ds.name_en,
                              distance: leg2Dist,
                              fare: leg2Fare,
                            },
                          },
                        };

                        // Keep only the cheapest option per bus-pair and
                        // transfer point.
                        const optionKey = `${busPairKey}|||${transferName}`;
                        const existing = transferMap.get(optionKey);
                        if (
                          !existing ||
                          totalFare < existing.fare ||
                          (totalFare === existing.fare &&
                            totalDistance < existing.distance)
                        ) {
                          transferMap.set(optionKey, {
                            fare: totalFare,
                            distance: totalDistance,
                            result: candidate,
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
      }

      // Sort all valid transfer options by fare (then distance) and return
      // the top MAX_TRANSFER_RESULTS so users can compare alternatives.
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
