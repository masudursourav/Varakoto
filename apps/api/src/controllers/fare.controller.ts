import type { Request, Response, NextFunction } from "express";
import { BusRoute, type Stop } from "../models/busRoute.model.js";
import { resolveEnglishNames } from "../utils/stopAlias.js";
import { getConsensusDistance } from "../utils/distanceConsensus.js";
import { sanitizeInput, normalizeText } from "../utils/normalizeText.js";

const RATE_PER_KM = 2.41;
const FARE_DISCOUNT = 0.95; // 5% discount applied to calculated fare
const AIRPORT_REDUCTION_KM = 1.5; // Reduce distance by 1.5km when airport is involved

// Elevated expressway corridor stops (Uttara–Farmgate via Kawla-Banani-Tejgaon)
const ELEVATED_EXPRESSWAY_STOPS = [
  "uttara", "jasimuddin", "jasimuddin road", "kawla", "khilkhet",
  "kuril", "banani", "mohakhali", "tejgaon", "farmgate",
  "bijoy sarani", "khejur bagan",
].map(s => s.toLowerCase());

// Buses that always use the elevated expressway
const ALWAYS_ELEVATED_BUSES = ["azmari", "vip 27", "bikash"];

function isAlwaysElevatedBus(busName: string): boolean {
  const norm = busName.trim().toLowerCase();
  return ALWAYS_ELEVATED_BUSES.some(b => norm.includes(b));
}

function mayUseElevatedExpressway(
  originEn: string,
  destEn: string,
  routeStops: Stop[],
  busName: string
): boolean {
  // These buses always get the elevated tag
  if (isAlwaysElevatedBus(busName)) return true;

  const normOrigin = normalizeText(originEn);
  const normDest = normalizeText(destEn);

  // Both origin and destination must be on the elevated corridor
  const originOnCorridor = ELEVATED_EXPRESSWAY_STOPS.some(s => normOrigin.includes(s));
  const destOnCorridor = ELEVATED_EXPRESSWAY_STOPS.some(s => normDest.includes(s));
  if (!originOnCorridor || !destOnCorridor) return false;

  // The route must pass through at least one intermediate corridor stop
  const routeStopNames = routeStops.map(s => normalizeText(s.name_en));
  const corridorCount = routeStopNames.filter(name =>
    ELEVATED_EXPRESSWAY_STOPS.some(s => name.includes(s))
  ).length;

  return corridorCount >= 2;
}

interface FareResult {
  bus: string;
  route_name_en: string;
  route_name_bn: string;
  origin_stop: string;
  destination_stop: string;
  distance: number;
  fare: number;
  is_transfer: boolean;
  may_use_elevated_expressway: boolean;
  transfer?: {
    transfer_stop_en: string;
    transfer_stop_bn: string;
    leg1: {
      bus: string;
      route_name_en: string;
      route_name_bn: string;
      origin: string;
      destination: string;
      distance: number;
      fare: number;
    };
    leg2: {
      bus: string;
      route_name_en: string;
      route_name_bn: string;
      origin: string;
      destination: string;
      distance: number;
      fare: number;
    };
  };
}

function roundFare(fare: number): number {
  return Math.round(fare);
}

function roundDistance(distance: number): number {
  return Math.round(distance * 100) / 100;
}

function isAirport(stopName: string): boolean {
  return normalizeText(stopName) === "airport";
}

function findAllStops(stops: Stop[], canonicalNames: string[]): Stop[] {
  return stops.filter((stop) =>
    canonicalNames.includes(normalizeText(stop.name_en))
  );
}

function buildStopMatcher(
  canonicalNames: string[]
): { name_en: { $regex: RegExp } }[] {
  return canonicalNames.map((name) => ({
    name_en: { $regex: new RegExp(`^${escapeForRegex(name)}$`, "i") },
  }));

  function escapeForRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

/**
 * Get the best distance between two stops:
 * Use consensus (median across all routes) if available,
 * otherwise fall back to the route's own km difference.
 */
async function getBestDistance(
  stop1: Stop,
  stop2: Stop
): Promise<number> {
  const consensus = await getConsensusDistance(stop1.name_en, stop2.name_en);
  const routeDistance = Math.abs(stop2.km - stop1.km);

  let distance = consensus !== null ? consensus : routeDistance;

  if (isAirport(stop1.name_en) || isAirport(stop2.name_en)) {
    distance = Math.max(0, distance - AIRPORT_REDUCTION_KM);
  }

  return distance;
}

export async function calculateFare(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { origin, destination } = req.body;

    if (!origin || !destination) {
      res.status(400).json({
        success: false,
        message: "Both origin and destination are required",
      });
      return;
    }

    const sanitizedOrigin = sanitizeInput(origin);
    const sanitizedDestination = sanitizeInput(destination);

    const originNames = await resolveEnglishNames(sanitizedOrigin);
    const destinationNames = await resolveEnglishNames(sanitizedDestination);

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

    // Find direct routes containing both origin and destination stops
    const originMatchers = buildStopMatcher(originNames);
    const destinationMatchers = buildStopMatcher(destinationNames);

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
        const fare = roundFare(
          Math.max(route.min_fare, distance * RATE_PER_KM) * FARE_DISCOUNT
        );

        const buses =
          route.buses.length > 0 ? route.buses : [route.route_name_en];

        for (const bus of buses) {
          const elevated = mayUseElevatedExpressway(
            bestOrigin.name_en,
            bestDest.name_en,
            route.stops,
            bus
          );

          results.push({
            bus,
            route_name_en: route.route_name_en,
            route_name_bn: route.route_name_bn,
            origin_stop: bestOrigin.name_en,
            destination_stop: bestDest.name_en,
            distance,
            fare,
            is_transfer: false,
            may_use_elevated_expressway: elevated,
          });
        }
      }
    } else {
      // Multi-bus transfer logic
      const originRoutes = await BusRoute.find({
        stops: { $elemMatch: { $or: originMatchers } },
      }).lean();

      const destRoutes = await BusRoute.find({
        stops: { $elemMatch: { $or: destinationMatchers } },
      }).lean();

      let bestTransfer: FareResult | null = null;
      let bestTransferFare = Infinity;
      let bestTransferDistance = Infinity;

      for (const route1 of originRoutes) {
        for (const route2 of destRoutes) {
          if (route1.route_id === route2.route_id) continue;

          const route1StopNames = route1.stops.map((s) =>
            normalizeText(s.name_en)
          );
          const route2StopNames = route2.stops.map((s) =>
            normalizeText(s.name_en)
          );
          const commonNames = route1StopNames.filter((name) =>
            route2StopNames.includes(name)
          );

          if (commonNames.length === 0) continue;

          for (const transferName of commonNames) {
            const originStops = findAllStops(route1.stops, originNames);
            const transferStopsR1 = route1.stops.filter(
              (s) => normalizeText(s.name_en) === transferName
            );
            const transferStopsR2 = route2.stops.filter(
              (s) => normalizeText(s.name_en) === transferName
            );
            const destStops = findAllStops(route2.stops, destinationNames);

            for (const os of originStops) {
              for (const ts1 of transferStopsR1) {
                for (const ts2 of transferStopsR2) {
                  for (const ds of destStops) {
                    const leg1Dist = roundDistance(
                      await getBestDistance(os, ts1)
                    );
                    const leg2Dist = roundDistance(
                      await getBestDistance(ts2, ds)
                    );
                    const leg1Fare = roundFare(
                      Math.max(route1.min_fare, leg1Dist * RATE_PER_KM) * FARE_DISCOUNT
                    );
                    const leg2Fare = roundFare(
                      Math.max(route2.min_fare, leg2Dist * RATE_PER_KM) * FARE_DISCOUNT
                    );
                    const totalFare = leg1Fare + leg2Fare;
                    const totalDistance = roundDistance(leg1Dist + leg2Dist);

                    // Check if transfer fare is reasonable
                    const hypothetical = roundFare(
                      Math.max(
                        Math.max(route1.min_fare, route2.min_fare),
                        totalDistance * RATE_PER_KM
                      ) * FARE_DISCOUNT
                    );

                    if (totalFare > hypothetical * 1.5) continue;

                    if (
                      totalFare < bestTransferFare ||
                      (totalFare === bestTransferFare &&
                        totalDistance < bestTransferDistance)
                    ) {
                      bestTransferFare = totalFare;
                      bestTransferDistance = totalDistance;

                      const bus1 =
                        route1.buses.length > 0
                          ? route1.buses[0]
                          : route1.route_name_en;
                      const bus2 =
                        route2.buses.length > 0
                          ? route2.buses[0]
                          : route2.route_name_en;

                      bestTransfer = {
                        bus: `${bus1} → ${bus2}`,
                        route_name_en: `${route1.route_name_en} → ${route2.route_name_en}`,
                        route_name_bn: `${route1.route_name_bn} → ${route2.route_name_bn}`,
                        origin_stop: os.name_en,
                        destination_stop: ds.name_en,
                        distance: totalDistance,
                        fare: totalFare,
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
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (bestTransfer) {
        results.push(bestTransfer);
      }
    }

    // Deduplicate: group by bus identifier, keep shortest distance per bus
    const deduped = new Map<string, FareResult>();
    for (const result of results) {
      const key = result.bus;
      const existing = deduped.get(key);
      if (!existing || result.distance < existing.distance) {
        deduped.set(key, result);
      }
    }

    // Sort by fare ascending, tiebreak by distance
    const sorted = Array.from(deduped.values()).sort((a, b) => {
      if (a.fare !== b.fare) return a.fare - b.fare;
      return a.distance - b.distance;
    });

    res.json({ success: true, data: sorted });
  } catch (error) {
    next(error);
  }
}
