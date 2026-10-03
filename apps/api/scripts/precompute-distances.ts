/**
 * Precompute Google direct driving distances for searchable stop pairs.
 *
 * Only fetches pairs where the graph distance is < 30km (practical bus
 * routes). Caches results to .direct-distance-cache.json for the consensus
 * system. Every value is validated with `isPlausibleDistance` before it is
 * cached, so a bad Google geocode can never enter the fare pipeline.
 *
 * Transient API failures are NOT cached (they are retried on the next
 * run); only definitive ZERO_RESULTS answers are recorded as null.
 *
 * Usage:
 *   npx tsx scripts/precompute-distances.ts --count    # just count
 *   npx tsx scripts/precompute-distances.ts --fetch    # fetch from Google
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const CACHE_FILE = path.resolve(__dirname, "../.direct-distance-cache.json");
const MAX_DISTANCE_KM = 30;
const MODE = process.argv.includes("--fetch") ? "fetch" : "count";
const FETCH_DELAY_MS = 210;

const { getRawDijkstraDistance, DIJKSTRA_FACTOR } = await import(
  "../src/utils/distanceConsensus.js"
);
const { isPlausibleDistance } = await import(
  "../src/utils/distanceValidation.js"
);
const { connectDatabase } = await import("../src/config/database.js");

await connectDatabase();

// Load existing cache
let cache: Record<string, number | null> = {};
if (fs.existsSync(CACHE_FILE)) {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
}
function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
/** Normalise, then sort, so key order never depends on input casing. */
function pairKey(a: string, b: string): string {
  const na = norm(a);
  const nb = norm(b);
  return na < nb ? `${na}||${nb}` : `${nb}||${na}`;
}

// Get all unique stops from DB
const BusRouteModel = mongoose.connection.collection("bus_route");
const routes = await BusRouteModel.find({}).toArray();

const stopNames = new Map<string, string>(); // norm → original
const routeStops: string[][] = [];

for (const route of routes) {
  const stops = (route.stops || []) as any[];
  const names: string[] = [];
  for (const s of stops) {
    const name = s.name_en as string;
    stopNames.set(norm(name), name);
    names.push(name);
  }
  routeStops.push(names);
}

// Collect unique pairs within routes
const pairSet = new Set<string>();
for (const names of routeStops) {
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (norm(names[i]) === norm(names[j])) continue;
      pairSet.add(pairKey(names[i], names[j]));
    }
  }
}

// Filter to pairs within MAX_DISTANCE_KM via the raw graph distance.
// (Raw Dijkstra avoids thousands of Barikoi calls that the full
// consensus engine would trigger for uncached pairs.)
console.log(`Total pairs in routes: ${pairSet.size}`);
console.log(`Filtering to graph distance < ${MAX_DISTANCE_KM}km...\n`);

const eligiblePairs: [string, string, number][] = []; // [stop1, stop2, graphDist]

let checked = 0;
for (const key of pairSet) {
  const [a, b] = key.split("||");
  const origA = stopNames.get(a) || a;
  const origB = stopNames.get(b) || b;

  const raw = await getRawDijkstraDistance(origA, origB);
  const dist = raw !== null ? raw * DIJKSTRA_FACTOR : null;

  if (dist !== null && dist < MAX_DISTANCE_KM) {
    eligiblePairs.push([origA, origB, dist]);
  }

  checked++;
  if (checked % 2000 === 0) {
    console.log(`  Checked ${checked}/${pairSet.size}...`);
  }
}

const uncached = eligiblePairs.filter(([a, b]) => !(pairKey(a, b) in cache));

console.log(`Eligible pairs (< ${MAX_DISTANCE_KM}km): ${eligiblePairs.length}`);
console.log(`Already cached: ${eligiblePairs.length - uncached.length}`);
console.log(`Need to fetch: ${uncached.length}`);
console.log(`Estimated cost: ~$${(uncached.length * 0.005).toFixed(2)}`);
console.log(`Estimated time: ~${Math.ceil(uncached.length * FETCH_DELAY_MS / 60000)} minutes`);

if (MODE === "count") {
  console.log("\nRun with --fetch to start fetching.");
  await mongoose.disconnect();
  process.exit(0);
}

if (!GOOGLE_API_KEY) {
  console.error("\nSet GOOGLE_MAPS_API_KEY in .env");
  await mongoose.disconnect();
  process.exit(1);
}

console.log(`\nFetching ${uncached.length} distances...\n`);

let fetched = 0;
let failed = 0;
let skipped = 0;

for (const [a, b] of uncached) {
  const key = pairKey(a, b);
  const origin = `${a}, Dhaka, Bangladesh`;
  const dest = `${b}, Dhaka, Bangladesh`;
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&mode=driving&key=${GOOGLE_API_KEY}`;

  let stored = false;

  for (let attempt = 0; attempt < 2 && !stored; attempt++) {
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.status === "OK" && data.routes.length > 0) {
        const km = data.routes[0].legs[0].distance.value / 1000;
        if (isPlausibleDistance(a, b, km)) {
          cache[key] = km;
          stored = true;
        } else {
          console.warn(
            `  Implausible distance for "${a}" → "${b}": ${km.toFixed(1)}km — skipped`,
          );
          skipped++;
          stored = true; // don't retry a bad geocode forever
        }
      } else if (data.status === "ZERO_RESULTS") {
        // Definitive: no driving route exists between these points.
        cache[key] = null;
        failed++;
        stored = true;
      } else if (
        data.status === "OVER_QUERY_LIMIT" ||
        data.status === "UNKNOWN_ERROR"
      ) {
        // Transient — back off and retry; never cache as null.
        await new Promise((r) => setTimeout(r, 500));
      } else {
        // Other definitive API answers (NOT_FOUND, INVALID_REQUEST…)
        cache[key] = null;
        failed++;
        stored = true;
      }
    } catch {
      // Network failure — retry, never cache as null.
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!stored) {
    console.warn(`  Giving up on "${a}" → "${b}" (will retry next run)`);
  }

  fetched++;
  if (fetched % 100 === 0) {
    console.log(`  ${fetched}/${uncached.length} (${failed} failed, ${skipped} skipped)...`);
    saveCache();
  }

  await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
}

saveCache();
console.log(
  `\nDone! Fetched ${fetched} (${failed} no-route, ${skipped} implausible).`,
);
console.log(`Total cached: ${Object.keys(cache).length}`);

await mongoose.disconnect();
