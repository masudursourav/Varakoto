const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001";

export interface StopItem {
  name_en: string;
  name_bn: string;
}

export interface TransferLeg {
  bus: string;
  route_name_en: string;
  route_name_bn: string;
  origin: string;
  destination: string;
  distance: number;
  fare: number;
}

export interface FareResult {
  bus: string;
  route_name_en: string;
  route_name_bn: string;
  origin_stop: string;
  destination_stop: string;
  distance: number;
  fare: number;
  is_transfer: boolean;
  may_use_elevated_expressway: boolean;
  transfer?: {
    transfer_stop_en: string;
    transfer_stop_bn: string;
    leg1: TransferLeg;
    leg2: TransferLeg;
  };
}

// ─── Stops cache ──────────────────────────────────────────────────────────────

/** How long (ms) the stops list is considered fresh before re-fetching. */
const STOPS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface StopsCache {
  data: StopItem[];
  fetchedAt: number;
}

let stopsCache: StopsCache | null = null;

/**
 * Returns true when the cache exists and has not yet expired.
 */
function isCacheValid(): boolean {
  return (
    stopsCache !== null &&
    Date.now() - stopsCache.fetchedAt < STOPS_CACHE_TTL_MS
  );
}

// ─── Public API helpers ───────────────────────────────────────────────────────

/**
 * Fetch all bus stops.
 *
 * Results are cached in module scope for STOPS_CACHE_TTL_MS (5 min).
 * The cache is language-agnostic: the backend always returns both
 * `name_en` and `name_bn`, so toggling the UI language must NOT
 * trigger a re-fetch.
 *
 * The cache is intentionally stored outside React so that navigating
 * back to the home page reuses the already-fetched list without
 * spinning up a new network request.
 */
export async function fetchStops(): Promise<StopItem[]> {
  if (isCacheValid()) {
    return stopsCache!.data;
  }

  const res = await fetch(`${API_BASE}/api/v1/stops`);
  if (!res.ok) throw new Error("Failed to fetch stops");

  const json = await res.json();
  const data: StopItem[] = json.data;

  stopsCache = { data, fetchedAt: Date.now() };
  return data;
}

/**
 * Manually invalidate the stops cache.
 * Useful in tests or after an admin action that adds new stops.
 */
export function invalidateStopsCache(): void {
  stopsCache = null;
}

/**
 * Calculate bus fares between two stops.
 *
 * @param origin      - Stop name in English or Bengali (as selected by user)
 * @param destination - Stop name in English or Bengali (as selected by user)
 */
export interface NearestStopItem {
  name_en: string;
  name_bn: string;
  distance_km: number;
}

/**
 * Find nearest bus stops to given GPS coordinates.
 */
export async function fetchNearestStops(
  lat: number,
  lng: number,
): Promise<NearestStopItem[]> {
  const res = await fetch(
    `${API_BASE}/api/v1/nearest-stop?lat=${lat}&lng=${lng}`,
  );
  if (!res.ok) throw new Error("Failed to fetch nearest stops");
  const json = await res.json();
  return json.data;
}

export interface PlaceSuggestion {
  place_name: string;
  name_en: string;
  name_bn: string;
  distance_km: number;
}

/**
 * Search places via Barikoi Autocomplete and map to nearest bus stops.
 * Used as a fallback when local stop filtering yields no results.
 */
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const res = await fetch(
    `${API_BASE}/api/v1/search/places?q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

export interface StopCoords {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}

/**
 * Fetch GPS coordinates for two stops (used for map preview).
 */
export async function fetchStopCoords(
  origin: string,
  destination: string,
): Promise<StopCoords | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/stop-coords?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export interface RouteToStop {
  user: { lat: number; lng: number };
  stop: {
    name_en: string;
    name_bn: string;
    lat: number;
    lng: number;
    distance_km: number;
  };
  route: {
    geometry: [number, number][];
    duration_min: number | null;
    distance_km: number | null;
  } | null;
}

/**
 * Fetch walking route from user's GPS position to the nearest bus stop.
 */
export async function fetchRouteToStop(
  lat: number,
  lng: number,
): Promise<RouteToStop | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/route-to-stop?lat=${lat}&lng=${lng}`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export interface NearbyStop {
  name_en: string;
  name_bn: string;
  lat: number;
  lng: number;
  distance_km: number;
}

/**
 * Fetch all bus stops near the user's GPS position (within ~5km).
 */
export async function fetchNearbyStops(
  lat: number,
  lng: number,
): Promise<NearbyStop[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/nearby-stops?lat=${lat}&lng=${lng}`,
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

export interface RouteMapData {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  transfer: { lat: number; lng: number } | null;
  segments: Array<{ geometry: [number, number][] }>; // [lng,lat] pairs
}

/**
 * Fetch stop coordinates and route geometry for the results map.
 */
export async function fetchRouteMap(
  origin: string,
  destination: string,
  transfer?: string,
): Promise<RouteMapData | null> {
  try {
    let url = `${API_BASE}/api/v1/route-map?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
    if (transfer) url += `&transfer=${encodeURIComponent(transfer)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function calculateFare(
  origin: string,
  destination: string,
): Promise<FareResult[]> {
  const res = await fetch(`${API_BASE}/api/v1/fare/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin, destination }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.message || "Failed to calculate fare");
  }

  const json = await res.json();
  return json.data;
}
