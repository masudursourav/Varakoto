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
