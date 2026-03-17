/**
 * Precompute Google direct driving distances for searchable stop pairs.
 *
 * Only fetches pairs where Dijkstra distance < 30km (practical bus routes).
 * Caches results to .direct-distance-cache.json for the consensus system.
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

const { getConsensusDistance } = await import("../src/utils/distanceConsensus.js");
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
      pairSet.add(pairKey(names[i], names[j]));
    }
  }
}

// Filter to pairs within MAX_DISTANCE_KM via Dijkstra
console.log(`Total pairs in routes: ${pairSet.size}`);
console.log(`Filtering to Dijkstra distance < ${MAX_DISTANCE_KM}km...\n`);

const eligiblePairs: [string, string, number][] = []; // [stop1, stop2, dijkstraDist]

let checked = 0;
for (const key of pairSet) {
  const [a, b] = key.split("||");
  const origA = stopNames.get(a) || a;
  const origB = stopNames.get(b) || b;

  const dist = await getConsensusDistance(origA, origB);
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
console.log(`Estimated time: ~${Math.ceil(uncached.length * 0.21 / 60)} minutes`);

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

for (const [a, b] of uncached) {
  const key = pairKey(a, b);
  const origin = `${a}, Dhaka, Bangladesh`;
  const dest = `${b}, Dhaka, Bangladesh`;
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&mode=driving&key=${GOOGLE_API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OK" && data.routes.length > 0) {
      cache[key] = data.routes[0].legs[0].distance.value / 1000;
    } else {
      cache[key] = null;
      failed++;
    }
  } catch {
    cache[key] = null;
    failed++;
  }

  fetched++;
  if (fetched % 100 === 0) {
    console.log(`  ${fetched}/${uncached.length} (${failed} failed)...`);
    saveCache();
  }

  await new Promise((r) => setTimeout(r, 210));
}

saveCache();
console.log(`\nDone! Fetched ${fetched} (${failed} failed).`);
console.log(`Total cached: ${Object.keys(cache).length}`);

await mongoose.disconnect();
