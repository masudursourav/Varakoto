/**
 * Calibrate the Dijkstra correction factor.
 *
 * The factor is the median of `googleDirect / rawDijkstra` across every
 * verified pair in .direct-distance-cache.json. The median is used (not
 * the minimum) so the factor is unbiased: roughly half the estimated
 * distances land slightly under Google and half slightly over, instead
 * of systematically undercharging every fare.
 *
 * IMPORTANT: this script measures RAW Dijkstra distance, never the
 * consensus value — consensus already includes the correction factor and
 * the Google cache, so calibrating against it would be circular.
 *
 * Finding a fresh factor (requires GOOGLE_MAPS_API_KEY only when the
 * cache is empty; normally it reads existing verified pairs):
 *   npx tsx scripts/calibrate-factor.ts
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

const { getRawDijkstraDistance } = await import(
  "../src/utils/distanceConsensus.js"
);
const { isPlausibleDistance } = await import(
  "../src/utils/distanceValidation.js"
);
const { connectDatabase } = await import("../src/config/database.js");

// Load/init cache
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

await connectDatabase();

// Sample pairs used only when the direct cache is missing/empty.
const samplePairs = [
  ["Airport", "Sainik Club"],
  ["Airport", "Mohakhali"],
  ["Airport", "Farmgate"],
  ["Motijheel", "Airport"],
  ["Sadarghat", "Airport"],
  ["Motijheel", "Farmgate"],
  ["Gulistan", "Farmgate"],
  ["Shahbag", "Farmgate"],
  ["Farmgate", "Bangla Motor"],
  ["Airport", "Khilkhet"],
  ["Airport", "Banani"],
  ["Mohakhali", "Farmgate"],
  ["Mirpur 10", "Farmgate"],
  ["Motijheel", "Mohakhali"],
];

async function fetchGoogle(s1: string, s2: string): Promise<number | null> {
  const key = pairKey(s1, s2);
  if (key in cache) return cache[key];
  if (!GOOGLE_API_KEY) return null;

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(s1 + ", Dhaka, Bangladesh")}&destination=${encodeURIComponent(s2 + ", Dhaka, Bangladesh")}&mode=driving&key=${GOOGLE_API_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OK" && data.routes.length > 0) {
      const km = data.routes[0].legs[0].distance.value / 1000;
      if (isPlausibleDistance(s1, s2, km)) {
        cache[key] = km;
        return km;
      }
      console.warn(`  Implausible Google distance for ${s1} → ${s2}: ${km} km`);
      return null;
    }
    cache[key] = null;
    return null;
  } catch {
    return null;
  }
}

// Build the (pair → googleKm) list from the cache; fall back to the
// sample list + API when the cache is empty.
type PairEntry = { pair: string; s1: string; s2: string; google: number };

const entries: PairEntry[] = [];

if (Object.keys(cache).length > 0) {
  console.log(
    `Calibrating from ${Object.keys(cache).length} cached Google pairs...\n`,
  );
  for (const [key, value] of Object.entries(cache)) {
    if (value === null || !Number.isFinite(value)) continue;
    const [s1, s2] = key.split("||");
    if (!s1 || !s2) continue;
    if (!isPlausibleDistance(s1, s2, value)) continue;
    entries.push({ pair: `${s1} ↔ ${s2}`, s1, s2, google: value });
  }
} else {
  console.log("Direct cache is empty — fetching sample pairs from Google...\n");
  for (const [s1, s2] of samplePairs) {
    const google = await fetchGoogle(s1, s2);
    if (google !== null && isPlausibleDistance(s1, s2, google)) {
      entries.push({ pair: `${s1} ↔ ${s2}`, s1, s2, google });
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  saveCache();
}

const data: { pair: string; rawDijkstra: number; google: number; ratio: number }[] = [];

for (const entry of entries) {
  const raw = await getRawDijkstraDistance(entry.s1, entry.s2);
  if (raw === null || raw <= 0.3) continue;
  data.push({
    pair: entry.pair,
    rawDijkstra: raw,
    google: entry.google,
    ratio: entry.google / raw,
  });
}

if (data.length === 0) {
  console.error(
    "No pairs with both a verified Google distance and a Dijkstra path.",
  );
  await mongoose.disconnect();
  process.exit(1);
}

data.sort((a, b) => a.ratio - b.ratio);

const ratios = data.map((d) => d.ratio);
const pct = (p: number) => ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * p))];
const median = pct(0.5);

console.log(
  "Samples".padEnd(10) + "P10".padStart(8) + "P25".padStart(8) +
    "Median".padStart(9) + "P75".padStart(8) + "P90".padStart(8),
);
console.log("-".repeat(51));
console.log(
  String(data.length).padEnd(10) +
    pct(0.1).toFixed(3).padStart(8) +
    pct(0.25).toFixed(3).padStart(8) +
    median.toFixed(3).padStart(9) +
    pct(0.75).toFixed(3).padStart(8) +
    pct(0.9).toFixed(3).padStart(8),
);

console.log(`\nWorst (most overestimated) 5 pairs:`);
for (const d of data.slice(0, 5)) {
  console.log(
    `  ${d.pair.padEnd(34)} dijkstra ${d.rawDijkstra.toFixed(1)}km  ` +
      `google ${d.google.toFixed(1)}km  ratio ${d.ratio.toFixed(3)}`,
  );
}
console.log(`\nBest (most underestimated) 5 pairs:`);
for (const d of data.slice(-5)) {
  console.log(
    `  ${d.pair.padEnd(34)} dijkstra ${d.rawDijkstra.toFixed(1)}km  ` +
      `google ${d.google.toFixed(1)}km  ratio ${d.ratio.toFixed(3)}`,
  );
}

console.log(
  `\nRecommended DIJKSTRA_FACTOR (median): ${median.toFixed(3)}` +
    `\nUse P10 (${pct(0.1).toFixed(3)}) only if you deliberately want the` +
    ` fare to err on the low side.`,
);

await mongoose.disconnect();
