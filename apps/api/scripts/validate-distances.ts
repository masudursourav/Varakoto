/**
 * Distance Validation Script
 *
 * Compares database route distances against Google Maps Directions API
 * (driving distance) to find data entry errors where km values are
 * inflated (e.g., counting both directions of a round-trip).
 *
 * Usage:
 *   GOOGLE_MAPS_API_KEY=your_key npx tsx scripts/validate-distances.ts
 *
 * Without a Google Maps key, it runs in "audit mode" — flagging
 * stop pairs whose distance varies > 50% across routes.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

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

interface StopPairDistance {
  routeId: string;
  routeName: string;
  stop1: string;
  stop2: string;
  distance: number;
}

async function getGoogleMapsDistance(
  origin: string,
  destination: string
): Promise<number | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const originQuery = `${origin}, Dhaka, Bangladesh`;
  const destQuery = `${destination}, Dhaka, Bangladesh`;

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(originQuery)}&destination=${encodeURIComponent(destQuery)}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === "OK" && data.routes.length > 0) {
      const distMeters = data.routes[0].legs[0].distance.value;
      return distMeters / 1000; // km
    }
    console.warn(`  Google Maps returned status: ${data.status} for ${origin} → ${destination}`);
    return null;
  } catch (err) {
    console.warn(`  Google Maps API error: ${err}`);
    return null;
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log("Connected to MongoDB\n");

  const routes = await BusRoute.find({}).lean();
  console.log(`Total routes: ${routes.length}\n`);

  // Build a map of (stop1, stop2) → distances across all routes
  const pairDistances = new Map<string, StopPairDistance[]>();

  for (const route of routes) {
    const stops = route.stops || [];

    for (let i = 0; i < stops.length; i++) {
      for (let j = i + 1; j < stops.length; j++) {
        const s1 = (stops[i] as any).name_en.trim();
        const s2 = (stops[j] as any).name_en.trim();
        const dist = Math.abs((stops[j] as any).km - (stops[i] as any).km);

        // Normalize the pair key so (A,B) and (B,A) are the same
        const key = [s1, s2].sort().join(" <-> ");

        if (!pairDistances.has(key)) {
          pairDistances.set(key, []);
        }
        pairDistances.get(key)!.push({
          routeId: route.route_id!,
          routeName: route.route_name_en!,
          stop1: s1,
          stop2: s2,
          distance: dist,
        });
      }
    }
  }

  // Find pairs with high variance (indicates data errors)
  console.log("=== INCONSISTENT DISTANCES (variance > 50%) ===\n");
  let inconsistentCount = 0;

  const inconsistentPairs: {
    pair: string;
    minDist: number;
    maxDist: number;
    ratio: number;
    entries: StopPairDistance[];
  }[] = [];

  for (const [pair, entries] of pairDistances) {
    if (entries.length < 2) continue;

    const distances = entries.map((e) => e.distance);
    const minDist = Math.min(...distances);
    const maxDist = Math.max(...distances);

    if (minDist === 0) continue; // Skip zero distances

    const ratio = maxDist / minDist;
    if (ratio > 1.5) {
      inconsistentPairs.push({ pair, minDist, maxDist, ratio, entries });
      inconsistentCount++;
    }
  }

  // Sort by ratio descending (worst offenders first)
  inconsistentPairs.sort((a, b) => b.ratio - a.ratio);

  // Show top 30
  for (const { pair, minDist, maxDist, ratio, entries } of inconsistentPairs.slice(0, 30)) {
    console.log(`${pair}`);
    console.log(`  Min: ${minDist.toFixed(1)} km | Max: ${maxDist.toFixed(1)} km | Ratio: ${ratio.toFixed(1)}x`);
    for (const e of entries) {
      const flag = e.distance === maxDist ? " ⚠️" : e.distance === minDist ? " ✓" : "";
      console.log(`    ${e.routeId.padEnd(8)} ${e.distance.toFixed(1).padStart(8)} km  (${e.routeName})${flag}`);
    }
    console.log();
  }

  console.log(`\nTotal inconsistent pairs (>1.5x variance): ${inconsistentCount}`);

  // === Google Maps Validation (if key provided) ===
  if (GOOGLE_MAPS_API_KEY) {
    console.log("\n\n=== GOOGLE MAPS VALIDATION ===\n");

    // Test specific well-known pairs
    const testPairs = [
      ["Airport", "Sainik Club"],
      ["Airport", "Mohakhali"],
      ["Airport", "Farmgate"],
      ["Motijheel", "Airport"],
      ["Sadarghat", "Airport"],
      ["Mirpur 10", "Motijheel"],
      ["Gulistan", "Farmgate"],
      ["Mohakhali", "Uttara"],
      ["Farmgate", "Bangla Motor"],
      ["Shahbag", "Farmgate"],
    ];

    for (const [stop1, stop2] of testPairs) {
      const key = [stop1, stop2].sort().join(" <-> ");
      const dbEntries = pairDistances.get(key);

      const googleDist = await getGoogleMapsDistance(stop1, stop2);

      if (dbEntries && dbEntries.length > 0) {
        const dbDistances = dbEntries.map((e) => e.distance);
        const dbMin = Math.min(...dbDistances);
        const dbMax = Math.max(...dbDistances);
        const dbMedian = dbDistances.sort((a, b) => a - b)[Math.floor(dbDistances.length / 2)];

        console.log(`${stop1} ↔ ${stop2}`);
        console.log(`  Google Maps: ${googleDist ? googleDist.toFixed(1) + " km" : "N/A"}`);
        console.log(`  DB range: ${dbMin.toFixed(1)} - ${dbMax.toFixed(1)} km (median: ${dbMedian.toFixed(1)} km, ${dbEntries.length} routes)`);

        if (googleDist) {
          // Flag if DB distance deviates > 30% from Google
          const closestDb = dbDistances.reduce((prev, curr) =>
            Math.abs(curr - googleDist) < Math.abs(prev - googleDist) ? curr : prev
          );
          const deviation = Math.abs(closestDb - googleDist) / googleDist;
          if (deviation > 0.3) {
            console.log(`  ⚠️  Closest DB distance (${closestDb.toFixed(1)} km) deviates ${(deviation * 100).toFixed(0)}% from Google`);
          } else {
            console.log(`  ✓  Closest DB distance (${closestDb.toFixed(1)} km) is within 30% of Google`);
          }
        }
        console.log();
      } else {
        console.log(`${stop1} ↔ ${stop2}: No DB data found`);
        if (googleDist) {
          console.log(`  Google Maps: ${googleDist.toFixed(1)} km`);
        }
        console.log();
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 200));
    }
  } else {
    console.log("\n💡 To validate against Google Maps, run with:");
    console.log("   GOOGLE_MAPS_API_KEY=your_key npx tsx scripts/validate-distances.ts\n");
  }

  // === Show consensus (minimum) distances for key pairs ===
  console.log("\n=== CONSENSUS DISTANCES (minimum across all routes) ===\n");
  const keyPairs = [
    ["Airport", "Sainik Club"],
    ["Airport", "Mohakhali"],
    ["Airport", "Farmgate"],
    ["Motijheel", "Airport"],
    ["Motijheel", "Farmgate"],
    ["Sadarghat", "Gulistan"],
    ["Shahbag", "Farmgate"],
    ["Airport", "Khilkhet"],
    ["Airport", "Banani"],
    ["Mohakhali", "Farmgate"],
  ];

  for (const [s1, s2] of keyPairs) {
    const key = [s1, s2].sort().join(" <-> ");
    const entries = pairDistances.get(key);
    if (entries) {
      const dists = entries.map((e) => e.distance).filter((d) => d > 0);
      const min = Math.min(...dists);
      const fare = Math.round(Math.max(10, min * 2.41));
      console.log(`${s1} ↔ ${s2}: ${min.toFixed(1)} km → ৳${fare}  (from ${dists.length} routes)`);
    } else {
      console.log(`${s1} ↔ ${s2}: no data`);
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
