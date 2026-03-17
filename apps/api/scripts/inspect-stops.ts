import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

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

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log("Connected to MongoDB\n");

  // Find routes containing "airport" or "sainik" stops
  const routes = await BusRoute.find({
    $or: [
      { "stops.name_en": { $regex: /airport/i } },
      { "stops.name_en": { $regex: /sainik/i } },
    ],
  }).lean();

  console.log(`Found ${routes.length} routes with airport or sainik stops\n`);

  for (const route of routes) {
    const airportStops = route.stops!.filter((s: any) =>
      /airport/i.test(s.name_en)
    );
    const sainikStops = route.stops!.filter((s: any) =>
      /sainik/i.test(s.name_en)
    );

    if (airportStops.length > 0 || sainikStops.length > 0) {
      console.log(`\n=== Route: ${route.route_name_en} (${route.route_id}) ===`);
      console.log(`  min_fare: ${route.min_fare}, rate_per_km: ${route.rate_per_km}`);

      if (airportStops.length > 0) {
        for (const s of airportStops) {
          console.log(`  Airport stop: "${(s as any).name_en}" at km ${(s as any).km}`);
        }
      }
      if (sainikStops.length > 0) {
        for (const s of sainikStops) {
          console.log(`  Sainik stop: "${(s as any).name_en}" at km ${(s as any).km}`);
        }
      }

      // If both exist on same route, show distance
      if (airportStops.length > 0 && sainikStops.length > 0) {
        for (const a of airportStops) {
          for (const s of sainikStops) {
            const dist = Math.abs((s as any).km - (a as any).km);
            const fare = Math.max(route.min_fare!, dist * 2.41);
            console.log(
              `  >> Distance Airport→Sainik: ${dist.toFixed(2)} km, Fare: ৳${Math.round(fare)}`
            );
          }
        }
      }
    }
  }

  // Also show ALL stops on a route that has both, to understand km structure
  const bothRoutes = routes.filter((r) => {
    const hasAirport = r.stops!.some((s: any) => /airport/i.test(s.name_en));
    const hasSainik = r.stops!.some((s: any) => /sainik/i.test(s.name_en));
    return hasAirport && hasSainik;
  });

  if (bothRoutes.length > 0) {
    console.log("\n\n=== FULL STOP LIST for routes with BOTH stops ===");
    for (const route of bothRoutes) {
      console.log(`\nRoute: ${route.route_name_en} (${route.route_id})`);
      console.log("Stops:");
      for (const s of route.stops!) {
        const marker =
          /airport/i.test((s as any).name_en) || /sainik/i.test((s as any).name_en)
            ? " <<<<<"
            : "";
        console.log(`  km ${String((s as any).km).padStart(6)} | ${(s as any).name_en}${marker}`);
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
