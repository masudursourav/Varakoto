/**
 * Import legacy Google caches and update route stop distances.
 *
 * Input files:
 *   - src/google_place_cache.json (stop -> lat/lng)
 *   - src/google_distance_cache.json (lat/lng pair -> km)
 *
 * Output:
 *   - Updates .distance-cache.json entries for consecutive route stop pairs
 *   - Rebuilds cumulative route km values and optionally applies DB updates
 *
 * Usage:
 *   npx tsx scripts/update-distances-from-google-cache.ts          # dry run
 *   npx tsx scripts/update-distances-from-google-cache.ts --apply  # write DB
 */

import dotenv from "dotenv";
import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY_RUN = !process.argv.includes("--apply");

const PLACE_CACHE_FILE = path.resolve(
  __dirname,
  "../src/google_place_cache.json",
);
const DIST_CACHE_FILE = path.resolve(
  __dirname,
  "../src/google_distance_cache.json",
);
const EDGE_CACHE_FILE = path.resolve(__dirname, "../.distance-cache.json");

type PlaceCacheRecord = {
  lat: number;
  lng: number;
  name?: string;
};

type StopDoc = {
  name_en: string;
  name_bn: string;
  km: number;
};

type RouteDoc = {
  _id: unknown;
  route_id: string;
  route_name_en: string;
  stops: StopDoc[];
};

const stopSchema = new mongoose.Schema(
  { name_en: String, name_bn: String, km: Number },
  { _id: false },
);

const busRouteSchema = new mongoose.Schema(
  {
    route_id: String,
    route_name_en: String,
    route_name_bn: String,
    rate_per_km: Number,
    min_fare: Number,
    buses: [String],
    stops: [stopSchema],
  },
  { collection: "bus_route" },
);

const BusRoute = mongoose.model("BusRoute", busRouteSchema);

function normName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

function compactName(s: string): string {
  return normName(s).replace(/[\s\-_.',()]/g, "");
}

function roundCoord(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

function coordKey(lat: number, lng: number): string {
  return `${roundCoord(lat)},${roundCoord(lng)}`;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("||");
}

function coordPairKey(c1: string, c2: string): string {
  return c1 < c2 ? `${c1}|${c2}` : `${c2}|${c1}`;
}

function parseCoord(raw: string): string | null {
  const parts = raw.split(",");
  if (parts.length !== 2) return null;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return coordKey(lat, lng);
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function buildStopCoordResolver(placeCache: Record<string, PlaceCacheRecord>) {
  const byNorm = new Map<string, string>();
  const byCompact = new Map<string, string>();

  for (const [name, data] of Object.entries(placeCache)) {
    if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) continue;
    const cKey = coordKey(data.lat, data.lng);
    byNorm.set(normName(name), cKey);
    byCompact.set(compactName(name), cKey);
  }

  return (stopName: string): string | null => {
    const exact = byNorm.get(normName(stopName));
    if (exact) return exact;

    const compact = byCompact.get(compactName(stopName));
    if (compact) return compact;

    return null;
  };
}

function loadCoordDistanceMap(
  raw: Record<string, number>,
): Map<string, number> {
  const map = new Map<string, number>();

  for (const [rawKey, rawDist] of Object.entries(raw)) {
    const parts = rawKey.split("|");
    if (parts.length !== 2) continue;

    const c1 = parseCoord(parts[0]);
    const c2 = parseCoord(parts[1]);
    if (!c1 || !c2) continue;

    const dist = Number(rawDist);
    if (!Number.isFinite(dist) || dist <= 0) continue;

    map.set(coordPairKey(c1, c2), dist);
  }

  return map;
}

async function main() {
  if (!fs.existsSync(PLACE_CACHE_FILE)) {
    throw new Error(`Missing place cache: ${PLACE_CACHE_FILE}`);
  }
  if (!fs.existsSync(DIST_CACHE_FILE)) {
    throw new Error(`Missing distance cache: ${DIST_CACHE_FILE}`);
  }

  const placeCache =
    loadJson<Record<string, PlaceCacheRecord>>(PLACE_CACHE_FILE);
  const googleDistCache = loadJson<Record<string, number>>(DIST_CACHE_FILE);

  const coordDistMap = loadCoordDistanceMap(googleDistCache);
  const resolveStopCoord = buildStopCoordResolver(placeCache);

  let edgeCache: Record<string, number | null> = {};
  if (fs.existsSync(EDGE_CACHE_FILE)) {
    edgeCache = loadJson<Record<string, number | null>>(EDGE_CACHE_FILE);
  }

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log("Connected to MongoDB");
  console.log(
    DRY_RUN ? ">>> DRY RUN — no DB writes <<<" : ">>> APPLY MODE <<<",
  );

  const routes = (await BusRoute.find({}).lean()) as RouteDoc[];
  console.log(`Routes: ${routes.length}`);
  console.log(`Place cache entries: ${Object.keys(placeCache).length}`);
  console.log(`Coordinate distance entries: ${coordDistMap.size}`);

  const uniqueConsecutivePairs = new Set<string>();
  let importedPairs = 0;
  let overwrittenPairs = 0;
  let unresolvedStops = 0;
  let missingCoordPairs = 0;
  const unresolvedExamples = new Set<string>();

  for (const route of routes) {
    const stops = route.stops ?? [];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i].name_en;
      const b = stops[i + 1].name_en;
      const pKey = pairKey(a, b);
      uniqueConsecutivePairs.add(pKey);

      const aCoord = resolveStopCoord(a);
      const bCoord = resolveStopCoord(b);

      if (!aCoord || !bCoord) {
        unresolvedStops++;
        if (unresolvedExamples.size < 10) {
          if (!aCoord) unresolvedExamples.add(a);
          if (!bCoord) unresolvedExamples.add(b);
        }
        continue;
      }

      const dist = coordDistMap.get(coordPairKey(aCoord, bCoord));
      if (dist === undefined) {
        missingCoordPairs++;
        continue;
      }

      const existing = edgeCache[pKey];
      if (
        existing !== undefined &&
        existing !== null &&
        Math.abs(existing - dist) > 0.001
      ) {
        overwrittenPairs++;
      }

      edgeCache[pKey] = dist;
      importedPairs++;
    }
  }

  fs.writeFileSync(EDGE_CACHE_FILE, JSON.stringify(edgeCache, null, 2));

  console.log(`Unique consecutive pairs: ${uniqueConsecutivePairs.size}`);
  console.log(`Pairs imported from coordinate cache: ${importedPairs}`);
  console.log(`Pairs overwritten in edge cache: ${overwrittenPairs}`);
  console.log(`Unresolved stop lookups: ${unresolvedStops}`);
  console.log(`Missing coordinate-pair distances: ${missingCoordPairs}`);
  if (unresolvedExamples.size > 0) {
    console.log(
      `Unresolved stop examples: ${Array.from(unresolvedExamples).join(", ")}`,
    );
  }

  let updatedCount = 0;
  let failedCount = 0;
  let unchangedCount = 0;

  for (const route of routes) {
    const stops = route.stops ?? [];
    if (stops.length < 2) {
      unchangedCount++;
      continue;
    }

    const newKms: number[] = [0];
    let missing = false;

    for (let i = 0; i < stops.length - 1; i++) {
      const k = pairKey(stops[i].name_en, stops[i + 1].name_en);
      const dist = edgeCache[k];
      if (dist === null || dist === undefined || !Number.isFinite(dist)) {
        missing = true;
        break;
      }
      newKms.push(Math.round((newKms[i] + dist) * 10) / 10);
    }

    if (missing) {
      failedCount++;
      continue;
    }

    const changed = stops.some(
      (s, i) => Math.abs((s.km ?? 0) - newKms[i]) > 0.05,
    );
    if (!changed) {
      unchangedCount++;
      continue;
    }

    updatedCount++;
    if (!DRY_RUN) {
      const updatedStops = stops.map((s, i) => ({ ...s, km: newKms[i] }));
      await BusRoute.updateOne(
        { _id: route._id },
        { $set: { stops: updatedStops } },
      );
    }
  }

  console.log("\n=== KM REBUILD RESULTS ===");
  console.log(`Routes updated: ${updatedCount}`);
  console.log(`Routes skipped (missing edge distance): ${failedCount}`);
  console.log(`Routes unchanged: ${unchangedCount}`);

  if (DRY_RUN && updatedCount > 0) {
    console.log(
      "\nDry run complete. Re-run with --apply to persist DB updates.",
    );
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Script failed:", err);
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
