/**
 * Validate consensus distances against Google Maps Directions API.
 *
 * Usage:
 *   GOOGLE_MAPS_API_KEY=key npx tsx scripts/validate-with-google.ts
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

if (!GOOGLE_API_KEY) {
  console.error("Set GOOGLE_MAPS_API_KEY env var");
  process.exit(1);
}

const { getConsensusDistance } =
  await import("../src/utils/distanceConsensus.js");
const { connectDatabase } = await import("../src/config/database.js");

await connectDatabase();

async function googleDistance(
  origin: string,
  dest: string,
): Promise<number | null> {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin + "bus stand" + ", Dhaka, Bangladesh")}&destination=${encodeURIComponent(dest + "bus stand" + ", Dhaka, Bangladesh")}&mode=driving&key=${GOOGLE_API_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OK" && data.routes.length > 0) {
      return data.routes[0].legs[0].distance.value / 1000;
    }
    return null;
  } catch {
    return null;
  }
}

const pairs = [
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
  ["Sadarghat", "Motijheel"],
  ["Mirpur 10", "Farmgate"],
  ["Motijheel", "Mohakhali"],
];

console.log("=== CONSENSUS vs GOOGLE MAPS ===\n");
console.log(
  "Stop Pair".padEnd(30) +
    "Google".padStart(8) +
    "Consensus".padStart(11) +
    "Dev%".padStart(7) +
    "Fare".padStart(6),
);
console.log("-".repeat(62));

for (const [s1, s2] of pairs) {
  const [google, consensus] = await Promise.all([
    googleDistance(s1, s2),
    getConsensusDistance(s1, s2),
  ]);

  const pair = `${s1} ↔ ${s2}`;
  const gStr = google ? `${google.toFixed(1)}km` : "N/A";
  const cStr = consensus ? `${consensus.toFixed(1)}km` : "N/A";
  const dev =
    google && consensus
      ? `${(((consensus - google) / google) * 100).toFixed(0)}%`
      : "N/A";
  const fare = consensus
    ? `৳${Math.round(Math.max(10, consensus * 2.42))}`
    : "N/A";

  console.log(
    pair.padEnd(30) +
      gStr.padStart(8) +
      cStr.padStart(11) +
      dev.padStart(7) +
      fare.padStart(6),
  );

  await new Promise((r) => setTimeout(r, 200));
}

await mongoose.disconnect();
