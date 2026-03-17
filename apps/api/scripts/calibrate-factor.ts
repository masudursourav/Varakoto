/**
 * Find the optimal correction factor by testing against known Google reference distances.
 * Fetches Google direct distances for a large sample of pairs and finds
 * the relationship between Dijkstra distance and Google direct distance.
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

// Load/init cache
let cache: Record<string, number | null> = {};
if (fs.existsSync(CACHE_FILE)) {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
}
function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

const { getConsensusDistance } = await import("../src/utils/distanceConsensus.js");
const { connectDatabase } = await import("../src/config/database.js");

await connectDatabase();

// Sample pairs — mix of short, medium, long distances
const samplePairs = [
  // Known reference pairs
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
  // Additional pairs for calibration
  ["Gulistan", "Mohakhali"],
  ["Gulistan", "Shahbag"],
  ["Mirpur 10", "Mohakhali"],
  ["Mirpur 10", "Gulistan"],
  ["Airport", "Uttara"],
  ["Gabtoli", "Farmgate"],
  ["Gabtoli", "Mirpur 10"],
  ["Gabtoli", "Gulistan"],
  ["Jatrabari", "Farmgate"],
  ["Jatrabari", "Gulistan"],
  ["Uttara", "Farmgate"],
  ["Uttara", "Mohakhali"],
  ["Uttara", "Banani"],
  ["Banani", "Farmgate"],
  ["Banani", "Gulistan"],
  ["Rampura Bridge", "Farmgate"],
  ["Rampura Bridge", "Motijheel"],
  ["Abdullahpur", "Airport"],
  ["Abdullahpur", "Uttara"],
  ["Mirpur 1", "Farmgate"],
  ["Mirpur 1", "Gulistan"],
  ["Kalshi", "Farmgate"],
  ["Agargaon", "Farmgate"],
  ["Kawran Bazar", "Gulistan"],
  ["Sadarghat", "Farmgate"],
  ["Sadarghat", "Gulistan"],
];

async function fetchGoogle(s1: string, s2: string): Promise<number | null> {
  const key = [s1, s2].sort().map(s => s.trim().toLowerCase().replace(/\s+/g, " ")).join("||");
  if (key in cache) return cache[key];
  if (!GOOGLE_API_KEY) return null;

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(s1 + ", Dhaka, Bangladesh")}&destination=${encodeURIComponent(s2 + ", Dhaka, Bangladesh")}&mode=driving&key=${GOOGLE_API_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OK" && data.routes.length > 0) {
      const km = data.routes[0].legs[0].distance.value / 1000;
      cache[key] = km;
      return km;
    }
    cache[key] = null;
    return null;
  } catch {
    cache[key] = null;
    return null;
  }
}

console.log("Fetching Google distances for calibration sample...\n");

const data: { pair: string; dijkstra: number; google: number; ratio: number }[] = [];

for (const [s1, s2] of samplePairs) {
  const [consensus, google] = await Promise.all([
    getConsensusDistance(s1, s2),
    fetchGoogle(s1, s2),
  ]);

  if (consensus && google) {
    const ratio = google / consensus;
    data.push({ pair: `${s1} ↔ ${s2}`, dijkstra: consensus, google, ratio });
  }

  await new Promise((r) => setTimeout(r, 200));
}

saveCache();

// Sort by ratio
data.sort((a, b) => a.ratio - b.ratio);

console.log("Pair".padEnd(30) + "Dijkstra".padStart(10) + "Google".padStart(10) + "Ratio".padStart(8));
console.log("-".repeat(58));
for (const d of data) {
  console.log(
    d.pair.padEnd(30) +
    `${d.dijkstra.toFixed(1)}km`.padStart(10) +
    `${d.google.toFixed(1)}km`.padStart(10) +
    d.ratio.toFixed(3).padStart(8)
  );
}

const ratios = data.map(d => d.ratio);
const minRatio = Math.min(...ratios);
const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;

console.log(`\nMin ratio (Google/Dijkstra): ${minRatio.toFixed(3)}`);
console.log(`Avg ratio: ${avgRatio.toFixed(3)}`);
console.log(`\nTo guarantee never >0% over Google, use factor: ${minRatio.toFixed(3)}`);
console.log(`With 5% safety margin, use factor: ${(minRatio * 0.95).toFixed(3)}`);

await mongoose.disconnect();
