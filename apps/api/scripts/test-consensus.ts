/**
 * Test consensus distances with Google Maps calibration.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { getConsensusDistance } = await import("../src/utils/distanceConsensus.js");
const { connectDatabase } = await import("../src/config/database.js");

await connectDatabase();

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
  ["Mirpur 10", "Farmgate"],
  ["Motijheel", "Mohakhali"],
];

// Google Maps reference distances (from previous validation)
const googleRef: Record<string, number> = {
  "Airport ↔ Sainik Club": 12.0,
  "Airport ↔ Mohakhali": 13.2,
  "Airport ↔ Farmgate": 15.9,
  "Motijheel ↔ Airport": 17.1,
  "Sadarghat ↔ Airport": 20.2,
  "Motijheel ↔ Farmgate": 5.5,
  "Gulistan ↔ Farmgate": 6.3,
  "Shahbag ↔ Farmgate": 3.1,
  "Farmgate ↔ Bangla Motor": 2.9,
  "Airport ↔ Khilkhet": 6.0,
  "Airport ↔ Banani": 11.1,
  "Mohakhali ↔ Farmgate": 5.1,
  "Mirpur 10 ↔ Farmgate": 6.4,
  "Motijheel ↔ Mohakhali": 7.9,
};

console.log("=== CONSENSUS DISTANCES (with Google calibration) ===\n");
console.log(
  "Stop Pair".padEnd(30) +
  "Consensus".padStart(11) +
  "Google Ref".padStart(12) +
  "Dev%".padStart(7) +
  "Fare".padStart(6)
);
console.log("-".repeat(66));

for (const [a, b] of pairs) {
  const dist = await getConsensusDistance(a, b);
  const label = `${a} ↔ ${b}`;
  const gRef = googleRef[label];
  const fare = dist ? Math.round(Math.max(10, dist * 2.41)) : "N/A";
  const dev = dist && gRef ? `${((dist - gRef) / gRef * 100).toFixed(0)}%` : "N/A";

  console.log(
    label.padEnd(30) +
    (dist ? `${dist.toFixed(1)}km` : "N/A").padStart(11) +
    (gRef ? `${gRef.toFixed(1)}km` : "N/A").padStart(12) +
    dev.padStart(7) +
    String(fare).padStart(6)
  );
}

await mongoose.disconnect();
