/**
 * Shared geography utilities — stop coordinates, Haversine distance,
 * and Barikoi geocoding with in-memory cache.
 */

import { normalizeText } from "./normalizeText.js";
import { env } from "../config/env.js";

/** Known GPS coordinates for major Dhaka bus stops. */
export const STOP_COORDS: Record<string, [number, number]> = {
  airport: [23.8513, 90.4089],
  uttara: [23.8759, 90.3995],
  abdullahpur: [23.892, 90.3989],
  azampur: [23.8685, 90.3964],
  "house building": [23.8783, 90.3978],
  rajlakshmi: [23.8623, 90.3997],
  jashimuddin: [23.8677, 90.4015],
  "jashimuddin (uttara)": [23.8677, 90.4015],
  khilkhet: [23.8295, 90.4228],
  kuril: [23.8206, 90.4243],
  banani: [23.7942, 90.4035],
  mohakhali: [23.7786, 90.4039],
  farmgate: [23.7569, 90.3878],
  "kawran bazar": [23.7512, 90.393],
  shahbag: [23.7387, 90.3957],
  "bangla motor": [23.7475, 90.3932],
  motijheel: [23.7288, 90.4196],
  gulistan: [23.7237, 90.4133],
  sadarghat: [23.7083, 90.4071],
  gabtoli: [23.7789, 90.3467],
  "mirpur 10": [23.8073, 90.3686],
  "mirpur-10": [23.8073, 90.3686],
  "mirpur 1": [23.7955, 90.3522],
  "mirpur-1": [23.7955, 90.3522],
  "mirpur 11": [23.8191, 90.3686],
  "mirpur-11": [23.8191, 90.3686],
  "mirpur 12": [23.8285, 90.3651],
  "mirpur-12": [23.8285, 90.3651],
  "mirpur 2": [23.8028, 90.3573],
  dhanmondi: [23.7465, 90.3748],
  "science lab": [23.7364, 90.383],
  "new market": [23.7325, 90.3845],
  paltan: [23.7338, 90.4137],
  jatrabari: [23.7098, 90.4332],
  sayedabad: [23.713, 90.4281],
  kamalapur: [23.7322, 90.4273],
  rampura: [23.7621, 90.4338],
  badda: [23.786, 90.4278],
  tongi: [23.9015, 90.4048],
  "tongi bazar": [23.8985, 90.4072],
  gazipur: [23.9906, 90.4244],
  agargaon: [23.7779, 90.3684],
  shewrapara: [23.7913, 90.3638],
  kalshi: [23.8162, 90.3703],
  tejgaon: [23.7618, 90.3928],
  fulbaria: [23.7192, 90.4012],
  azimpur: [23.7293, 90.383],
  nilkhet: [23.7333, 90.387],
  mouchak: [23.7505, 90.4131],
  malibagh: [23.7485, 90.4159],
  kakrail: [23.7379, 90.4106],
  "press club": [23.7282, 90.4099],
  "bijoy sarani": [23.7635, 90.3908],
  nawabpur: [23.7163, 90.4061],
  postogola: [23.6964, 90.4299],
  demra: [23.729, 90.4843],
  "uttara sector 3": [23.8735, 90.3942],
  diabari: [23.8898, 90.3815],
  "chairman bari": [23.7876, 90.4038],
  nabisco: [23.7714, 90.4074],
  "sainik club": [23.7961, 90.4045],
};

/**
 * Dhaka metropolitan bounding box.
 * Covers the greater Dhaka area including Gazipur, Tongi, Savar, and Narayanganj.
 */
export const DHAKA_BOUNDS = {
  minLat: 23.65,
  maxLat: 24.02,
  minLng: 90.30,
  maxLng: 90.55,
} as const;

/** Returns true if the given coordinates fall within the Dhaka metro area. */
export function isWithinDhaka(lat: number, lng: number): boolean {
  return (
    lat >= DHAKA_BOUNDS.minLat &&
    lat <= DHAKA_BOUNDS.maxLat &&
    lng >= DHAKA_BOUNDS.minLng &&
    lng <= DHAKA_BOUNDS.maxLng
  );
}

/** Haversine great-circle distance in km. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Find the `limit` nearest stops by coordinate distance. */
export function findNearestByCoords(
  lat: number,
  lng: number,
  limit: number,
): { name: string; distance: number }[] {
  const results: { name: string; distance: number }[] = [];

  for (const [name, [sLat, sLng]] of Object.entries(STOP_COORDS)) {
    results.push({ name, distance: haversineKm(lat, lng, sLat, sLng) });
  }

  results.sort((a, b) => a.distance - b.distance);
  return results.slice(0, limit);
}

/**
 * Find stops within `radiusKm` of the given point, including their coordinates.
 * Returns at most `limit` results sorted by distance ascending.
 * Deduplicates stops that share the same coordinates (e.g. "mirpur 10" / "mirpur-10").
 */
export function findNearbyWithCoords(
  lat: number,
  lng: number,
  radiusKm: number,
  limit: number,
): { name: string; lat: number; lng: number; distance: number }[] {
  const results: { name: string; lat: number; lng: number; distance: number }[] = [];
  const seen = new Set<string>();

  for (const [name, [sLat, sLng]] of Object.entries(STOP_COORDS)) {
    const dist = haversineKm(lat, lng, sLat, sLng);
    if (dist > radiusKm) continue;

    // Deduplicate by coordinate key (e.g. "mirpur 10" and "mirpur-10")
    const coordKey = `${sLat},${sLng}`;
    if (seen.has(coordKey)) continue;
    seen.add(coordKey);

    results.push({ name, lat: sLat, lng: sLng, distance: dist });
  }

  results.sort((a, b) => a.distance - b.distance);
  return results.slice(0, limit);
}

// ─── Barikoi Geocoding ────────────────────────────────────────────────────────

/** In-memory cache for Barikoi geocoding results. */
const geocodeCache = new Map<string, [number, number] | null>();

/**
 * Forward-geocode a stop name via Barikoi Autocomplete.
 * Results are cached in-memory so repeated lookups are free.
 * Returns [lat, lng] or null.
 */
export async function barikoiGeocode(
  stopName: string,
): Promise<[number, number] | null> {
  if (!env.BARIKOI_API_KEY) return null;

  const cached = geocodeCache.get(stopName);
  if (cached !== undefined) return cached;

  try {
    const url = `https://barikoi.xyz/v2/api/search/autocomplete/place?api_key=${env.BARIKOI_API_KEY}&q=${encodeURIComponent(stopName + " Dhaka")}&city=dhaka&bangla=true&longitude=90.4125&latitude=23.8103&scale=0.5`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.places && data.places.length > 0) {
      for (const place of data.places) {
        const lat = parseFloat(place.latitude);
        const lng = parseFloat(place.longitude);
        if (!isNaN(lat) && !isNaN(lng) && isWithinDhaka(lat, lng)) {
          const coords: [number, number] = [lat, lng];
          geocodeCache.set(stopName, coords);
          return coords;
        }
      }
    }

    geocodeCache.set(stopName, null);
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve coordinates for a stop — first from STOP_COORDS, then via Barikoi.
 * Accepts an array of canonical English names (from alias resolution).
 */
export async function resolveStopCoords(
  canonicalNames: string[],
): Promise<[number, number] | null> {
  for (const name of canonicalNames) {
    const norm = normalizeText(name);
    if (STOP_COORDS[norm]) return STOP_COORDS[norm];
  }

  for (const name of canonicalNames) {
    const coords = await barikoiGeocode(name);
    if (coords) return coords;
  }

  return null;
}
