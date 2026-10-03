/**
 * Update all route km values using Google Maps driving distances.
 *
 * 1. Collects all unique consecutive stop pairs across routes
 * 2. Fetches Google driving distance for each pair (cached, rate-limited,
 *    plausibility-checked before caching)
 * 3. Rebuilds cumulative km for each route (full precision; rounded to
 *    0.1 km only when written)
 * 4. Updates the DB
 *
 * Cache keys are normalised (trim + collapse whitespace + lowercase) and
 * then sorted, matching the runtime consensus engine, so "Farmgate||Khamar
 * Bari" and "khamar bari||farmgate" are the same entry.
 *
 * Usage:
 *   npx tsx scripts/update-distances.ts          # dry-run (default)
 *   npx tsx scripts/update-distances.ts --apply   # actually update DB
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const DRY_RUN = !process.argv.includes("--apply");
const CACHE_FILE = path.resolve(__dirname, "../.distance-cache.json");

const { isPlausibleDistance } = await import(
  "../src/utils/distanceValidation.js"
);

if (!GOOGLE_API_KEY) {
  console.error("Set GOOGLE_MAPS_API_KEY in .env");
  process.exit(1);
}

const stopSchema = new mongoose.Schema(
  { name_en: String, name_bn: String, km: Number },
  { _id: false }
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
  { collection: "bus_route" }
);
const BusRoute = mongoose.model("BusRoute", busRouteSchema);

// --- Distance cache (persisted to disk to survive restarts) ---
let distCache: Record<string, number | null> = {};
if (fs.existsSync(CACHE_FILE)) {
  distCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  console.log(`Loaded ${Object.keys(distCache).length} cached distances\n`);
}

function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(distCache, null, 2));
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

async function fetchGoogleDist(
  stop1: string,
  stop2: string
): Promise<number | null> {
  const key = pairKey(stop1, stop2);
  if (key in distCache) return distCache[key];

  const origin = `${stop1}, Dhaka, Bangladesh`;
  const dest = `${stop2}, Dhaka, Bangladesh`;
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&mode=driving&key=${GOOGLE_API_KEY}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "OK" && data.routes.length > 0) {
        const km = data.routes[0].legs[0].distance.value / 1000;
        if (!isPlausibleDistance(stop1, stop2, km)) {
          console.warn(
            `  Implausible Google distance for "${stop1}" → "${stop2}": ${km.toFixed(1)}km — skipped`
          );
          return null; // do not poison the cache
        }
        distCache[key] = km;
        return km;
      }
      if (data.status === "ZERO_RESULTS") {
        console.warn(`  Google has no route for "${stop1}" → "${stop2}"`);
        distCache[key] = null;
        return null;
      }
      if (
        data.status === "OVER_QUERY_LIMIT" ||
        data.status === "UNKNOWN_ERROR"
      ) {
        // Transient — back off, retry, never cache as null.
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      console.warn(`  Google returned ${data.status} for "${stop1}" → "${stop2}"`);
      distCache[key] = null;
      return null;
    } catch (err) {
      // Network failure — retry, never cache as null.
      await new Promise((r) => setTimeout(r, 500));
      if (attempt === 1) {
        console.warn(`  Fetch error for "${stop1}" → "${stop2}":`, err);
      }
    }
  }

  return null;
}

// --- Main ---
await mongoose.connect(process.env.MONGODB_URI!);
console.log("Connected to MongoDB");
console.log(DRY_RUN ? ">>> DRY RUN — no DB changes <<<\n" : ">>> APPLYING CHANGES <<<\n");

const routes = await BusRoute.find({}).lean();
console.log(`Total routes: ${routes.length}`);

// Step 1: Collect all unique consecutive pairs
const uniquePairs = new Set<string>();
for (const route of routes) {
  const stops = route.stops ?? [];
  for (let i = 0; i < stops.length - 1; i++) {
    uniquePairs.add(pairKey((stops[i] as any).name_en, (stops[i + 1] as any).name_en));
  }
}

// Step 2: Fetch Google distances for all pairs (skip cached)
const uncached = [...uniquePairs].filter((k) => !(k in distCache));
console.log(`Unique consecutive pairs: ${uniquePairs.size}`);
console.log(`Already cached: ${uniquePairs.size - uncached.length}`);
console.log(`Need to fetch: ${uncached.length}\n`);

let fetched = 0;
for (const key of uncached) {
  const [a, b] = key.split("||");
  await fetchGoogleDist(a, b);
  fetched++;

  if (fetched % 50 === 0) {
    console.log(`  Fetched ${fetched}/${uncached.length}...`);
    saveCache();
  }

  // Rate limit: ~5 requests/sec
  await new Promise((r) => setTimeout(r, 200));
}
saveCache();
console.log(`Fetched ${fetched} distances from Google Maps\n`);

// Step 3: Rebuild routes (full precision, round on write)
let updatedCount = 0;
let failedCount = 0;
const sampleChanges: string[] = [];

for (const route of routes) {
  const stops = route.stops ?? [];
  if (stops.length < 2) continue;

  const newKms: number[] = [0]; // first stop is always 0
  let failed = false;

  for (let i = 0; i < stops.length - 1; i++) {
    const a = (stops[i] as any).name_en;
    const b = (stops[i + 1] as any).name_en;
    const key = pairKey(a, b);
    const dist = distCache[key];

    if (dist === null || dist === undefined) {
      failed = true;
      break;
    }

    newKms.push(newKms[i] + dist);
  }

  if (failed) {
    failedCount++;
    continue;
  }

  // Round only for comparison and storage (0.1 km precision).
  const roundedKms = newKms.map((k) => Math.round(k * 10) / 10);

  // Check if anything actually changed
  const changed = stops.some(
    (s: any, i: number) => Math.abs(s.km - roundedKms[i]) > 0.05
  );

  if (!changed) continue;

  updatedCount++;

  if (sampleChanges.length < 5) {
    const lines = [`Route ${route.route_id} (${route.route_name_en}):`];
    for (let i = 0; i < stops.length; i++) {
      const oldKm = (stops[i] as any).km;
      const newKm = roundedKms[i];
      const diff = Math.abs(newKm - oldKm) > 0.5 ? " <<<" : "";
      lines.push(
        `  ${(stops[i] as any).name_en.padEnd(25)} ${String(oldKm).padStart(7)} → ${String(newKm).padStart(7)}${diff}`
      );
    }
    sampleChanges.push(lines.join("\n"));
  }

  if (!DRY_RUN) {
    const updateStops = stops.map((s: any, i: number) => ({
      ...s,
      km: roundedKms[i],
    }));
    await BusRoute.updateOne(
      { _id: route._id },
      { $set: { stops: updateStops } }
    );
  }
}

console.log("=== RESULTS ===");
console.log(`Routes updated: ${updatedCount}`);
console.log(`Routes skipped (missing Google data): ${failedCount}`);
console.log(`Routes unchanged: ${routes.length - updatedCount - failedCount}`);

if (sampleChanges.length > 0) {
  console.log(`\n=== SAMPLE CHANGES (${Math.min(5, updatedCount)} of ${updatedCount}) ===\n`);
  console.log(sampleChanges.join("\n\n"));
}

if (DRY_RUN && updatedCount > 0) {
  console.log("\n>>> This was a DRY RUN. Run with --apply to update DB <<<");
}

await mongoose.disconnect();
