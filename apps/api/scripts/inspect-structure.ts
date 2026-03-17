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
  {
    route_id: String,
    route_name_en: String,
    stops: [stopSchema],
  },
  { collection: "bus_route" }
);
const BusRoute = mongoose.model("BusRoute", busRouteSchema);

await mongoose.connect(process.env.MONGODB_URI!);

const routes = await BusRoute.find({}).limit(3).lean();
for (const r of routes) {
  console.log(`Route: ${r.route_id} — ${r.route_name_en}`);
  for (const s of r.stops || []) {
    console.log(`  km ${String((s as any).km).padStart(6)} | ${(s as any).name_en}`);
  }
  console.log();
}

const total = await BusRoute.countDocuments();
console.log(`Total routes: ${total}`);

await mongoose.disconnect();
