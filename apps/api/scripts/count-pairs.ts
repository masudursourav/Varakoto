import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const stopSchema = new mongoose.Schema(
  { name_en: String, name_bn: String, km: Number },
  { _id: false }
);
const busRouteSchema = new mongoose.Schema(
  { route_id: String, route_name_en: String, stops: [stopSchema] },
  { collection: "bus_route" }
);
const BusRoute = mongoose.model("BusRoute", busRouteSchema);

await mongoose.connect(process.env.MONGODB_URI!);

const routes = await BusRoute.find({}).lean();
const uniquePairs = new Set<string>();
const allStops = new Set<string>();

for (const route of routes) {
  const stops = route.stops ?? [];
  for (let i = 0; i < stops.length; i++) {
    allStops.add((stops[i] as any).name_en);
    if (i < stops.length - 1) {
      const a = (stops[i] as any).name_en;
      const b = (stops[i + 1] as any).name_en;
      const key = [a, b].sort().join("||");
      uniquePairs.add(key);
    }
  }
}

console.log(`Total routes: ${routes.length}`);
console.log(`Unique stops: ${allStops.size}`);
console.log(`Unique consecutive pairs: ${uniquePairs.size}`);
console.log(`\nEstimated Google API calls needed: ${uniquePairs.size}`);
console.log(`Estimated cost at ~$0.005/call: $${(uniquePairs.size * 0.005).toFixed(2)}`);

await mongoose.disconnect();
