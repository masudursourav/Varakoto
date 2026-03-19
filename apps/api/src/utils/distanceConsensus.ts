/**
 * Distance Consensus — multi-source distance resolution.
 *
 * Priority order:
 * 1. Precomputed Google direct distance (from .direct-distance-cache.json)
 *    → Most accurate, covers all pairs within 30 km
 * 2. Dijkstra shortest path through Google-verified edges (O((V+E) log V) binary heap)
 *    → Fallback for uncached pairs, applies 0.90 correction factor
 * 3. Barikoi driving distance (real road routing via Barikoi API)
 *    → Uses stop coordinates + Barikoi Routing API, cached in-memory
 * 4. DB minimum km difference
 *    → Last resort fallback
 *
 * Final result: minimum of all available sources, ensuring fare is
 * never higher than any verified source.
 */

import fs from "fs";
import path from "path";
import { BusRoute } from "../models/busRoute.model.js";
import { normalizeText } from "./normalizeText.js";
import { STOP_COORDS, barikoiGeocode } from "./geo.js";
import { env } from "../config/env.js";

// ─── Cache file paths ─────────────────────────────────────────────────────────

const EDGE_CACHE = path.resolve(process.cwd(), ".distance-cache.json");
const DIRECT_CACHE = path.resolve(process.cwd(), ".direct-distance-cache.json");

// ─── Constants ────────────────────────────────────────────────────────────────

/** Dijkstra correction: hop-by-hop routes tend to overestimate ~10%. */
const DIJKSTRA_FACTOR = 0.9;

/** How long (ms) to keep the DB-derived distance map before rebuilding. */
const DB_MIN_MAP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Types ────────────────────────────────────────────────────────────────────

type Graph = Map<string, Map<string, number>>;

// ─── Module-level singletons ─────────────────────────────────────────────────

let graph: Graph | null = null;
let dijkstraCache: Map<string, number> | null = null;

let dbMinMap: Map<string, number> | null = null;
let dbMinMapBuiltAt: number | null = null;

let directCache: Record<string, number | null> | null = null;

/** In-memory cache for Barikoi routing distances. */
const barikoiDistCache = new Map<string, number | null>();

// ─── Pair key ────────────────────────────────────────────────────────────────

function pairKey(stop1: string, stop2: string): string {
  const a = normalizeText(stop1);
  const b = normalizeText(stop2);
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

// ─── Binary Min-Heap ─────────────────────────────────────────────────────────

/**
 * A generic min-heap keyed on a numeric priority.
 * Reduces Dijkstra's per-step complexity from O(n) to O(log n),
 * giving an overall O((V + E) log V) algorithm.
 */
class MinHeap {
  private readonly heap: [number, string][] = [];

  get size(): number {
    return this.heap.length;
  }

  push(priority: number, value: string): void {
    this.heap.push([priority, value]);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): [number, string] | undefined {
    if (this.heap.length === 0) return undefined;

    const top = this.heap[0];
    const last = this.heap.pop()!;

    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }

    return top;
  }

  private swap(i: number, j: number): void {
    const tmp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = tmp;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >>> 1;
      if (this.heap[parent][0] <= this.heap[i][0]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;

      if (left < n && this.heap[left][0] < this.heap[smallest][0]) {
        smallest = left;
      }
      if (right < n && this.heap[right][0] < this.heap[smallest][0]) {
        smallest = right;
      }

      if (smallest === i) break;

      this.swap(smallest, i);
      i = smallest;
    }
  }
}

// ─── Dijkstra (O((V+E) log V)) ───────────────────────────────────────────────

/**
 * Find the shortest path distance between `start` and `end` in `g`.
 * Uses a binary min-heap priority queue for O((V+E) log V) performance.
 * Returns `null` when no path exists.
 */
function dijkstra(g: Graph, start: string, end: string): number | null {
  const dist = new Map<string, number>();
  const visited = new Set<string>();
  const heap = new MinHeap();

  dist.set(start, 0);
  heap.push(0, start);

  while (heap.size > 0) {
    const entry = heap.pop();
    if (!entry) break;

    const [d, node] = entry;

    if (node === end) return d;
    if (visited.has(node)) continue;
    visited.add(node);

    const neighbors = g.get(node);
    if (!neighbors) continue;

    for (const [neighbor, weight] of neighbors) {
      if (visited.has(neighbor)) continue;

      const newDist = d + weight;
      const knownDist = dist.get(neighbor);

      if (knownDist === undefined || newDist < knownDist) {
        dist.set(neighbor, newDist);
        heap.push(newDist, neighbor);
      }
    }
  }

  return null;
}

// ─── Graph loader ─────────────────────────────────────────────────────────────

function loadDirectCache(): Record<string, number | null> {
  if (!fs.existsSync(DIRECT_CACHE)) return {};

  const data: Record<string, number | null> = JSON.parse(
    fs.readFileSync(DIRECT_CACHE, "utf-8"),
  );
  const validCount = Object.values(data).filter((v) => v !== null).length;
  console.log(`Direct distance cache: ${validCount} pairs`);
  return data;
}

function buildGraph(): Graph {
  const g: Graph = new Map();

  if (!fs.existsSync(EDGE_CACHE)) {
    console.warn("Edge cache not found at", EDGE_CACHE);
    return g;
  }

  const cache: Record<string, number | null> = JSON.parse(
    fs.readFileSync(EDGE_CACHE, "utf-8"),
  );

  for (const [key, dist] of Object.entries(cache)) {
    if (dist === null || dist <= 0) continue;

    const parts = key.split("||");
    if (parts.length !== 2) continue;

    const na = normalizeText(parts[0]);
    const nb = normalizeText(parts[1]);

    if (!g.has(na)) g.set(na, new Map());
    if (!g.has(nb)) g.set(nb, new Map());

    const existing = g.get(na)!.get(nb);
    if (existing === undefined || dist < existing) {
      g.get(na)!.set(nb, dist);
      g.get(nb)!.set(na, dist);
    }
  }

  console.log(
    `Distance graph: ${g.size} stops, ${Object.keys(cache).length} edges`,
  );
  return g;
}

async function buildDbMinMap(): Promise<Map<string, number>> {
  const routes = await BusRoute.find({}, { stops: 1 }).lean();
  const result = new Map<string, number>();

  for (const route of routes) {
    const stops = route.stops ?? [];
    for (let i = 0; i < stops.length; i++) {
      for (let j = i + 1; j < stops.length; j++) {
        const dist = Math.abs(stops[j].km - stops[i].km);
        if (dist === 0) continue;

        const key = pairKey(stops[i].name_en, stops[j].name_en);
        const current = result.get(key);
        if (current === undefined || dist < current) {
          result.set(key, dist);
        }
      }
    }
  }

  return result;
}

// ─── Barikoi Routing Distance ─────────────────────────────────────────────────

/**
 * Resolve GPS coordinates for a stop name.
 * Checks hardcoded STOP_COORDS first, then falls back to Barikoi geocoding.
 */
async function resolveCoords(stopName: string): Promise<[number, number] | null> {
  const norm = normalizeText(stopName);
  if (STOP_COORDS[norm]) return STOP_COORDS[norm];
  return barikoiGeocode(stopName);
}

/**
 * Fetch driving distance (km) between two stops via the Barikoi Routing API.
 * Results are cached in-memory. Returns null if unavailable.
 */
async function getBarikoiRoutingDistance(
  stop1En: string,
  stop2En: string,
): Promise<number | null> {
  if (!env.BARIKOI_API_KEY) return null;

  const key = pairKey(stop1En, stop2En);

  const cached = barikoiDistCache.get(key);
  if (cached !== undefined) return cached;

  const [coords1, coords2] = await Promise.all([
    resolveCoords(stop1En),
    resolveCoords(stop2En),
  ]);

  if (!coords1 || !coords2) {
    barikoiDistCache.set(key, null);
    return null;
  }

  try {
    const url = `https://barikoi.xyz/v2/api/route/${coords1[1]},${coords1[0]};${coords2[1]},${coords2[0]}?api_key=${env.BARIKOI_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const distKm = Math.round((data.routes[0].distance / 1000) * 10) / 10;
      barikoiDistCache.set(key, distKm);
      return distKm;
    }

    barikoiDistCache.set(key, null);
    return null;
  } catch {
    return null;
  }
}

// ─── Ensure caches are ready ──────────────────────────────────────────────────

async function ensureReady(): Promise<void> {
  // Direct Google cache — loaded once from disk, no expiry needed
  // (updated only by the precompute script, not at runtime).
  if (!directCache) {
    directCache = loadDirectCache();
  }

  // Edge graph and Dijkstra memo — also disk-sourced, no runtime expiry.
  if (!graph) {
    graph = buildGraph();
    dijkstraCache = new Map();
  }

  // DB min-map — derived from live DB data, so we apply a TTL.
  const now = Date.now();
  const isStale =
    !dbMinMap ||
    dbMinMapBuiltAt === null ||
    now - dbMinMapBuiltAt > DB_MIN_MAP_TTL_MS;

  if (isStale) {
    dbMinMap = await buildDbMinMap();
    dbMinMapBuiltAt = now;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the best distance (km) between two stops.
 *
 * Returns the *minimum* of all available sources so that the calculated
 * fare is never higher than what Google Maps would suggest.
 *
 * Returns `null` when no distance information is available at all.
 */
export async function getConsensusDistance(
  stop1En: string,
  stop2En: string,
): Promise<number | null> {
  await ensureReady();

  const key = pairKey(stop1En, stop2En);

  // Source 1: Precomputed Google direct distance (most accurate)
  const googleDirect = directCache![key];

  // Source 2: Dijkstra shortest path + correction factor
  let dijkstraDist: number | null = null;

  if (dijkstraCache!.has(key)) {
    dijkstraDist = dijkstraCache!.get(key)!;
  } else {
    const na = normalizeText(stop1En);
    const nb = normalizeText(stop2En);

    if (graph!.has(na) && graph!.has(nb)) {
      const raw = dijkstra(graph!, na, nb);
      dijkstraDist = raw !== null ? raw * DIJKSTRA_FACTOR : null;

      // Cache result (null included) to avoid recomputing
      dijkstraCache!.set(key, dijkstraDist ?? -1);
    }
  }

  // Normalise the sentinel value used to cache "no path found"
  if (dijkstraDist === -1) dijkstraDist = null;

  // Source 3: Barikoi driving distance (real road distance via routing API)
  const barikoiDist = await getBarikoiRoutingDistance(stop1En, stop2En);

  // Source 4: DB minimum km difference
  const dbDist = dbMinMap!.get(key) ?? null;

  // Collect all valid candidates and pick the smallest
  const candidates: number[] = [];
  if (googleDirect !== null && googleDirect !== undefined) {
    candidates.push(googleDirect);
  }
  if (dijkstraDist !== null) candidates.push(dijkstraDist);
  if (barikoiDist !== null) candidates.push(barikoiDist);
  if (dbDist !== null) candidates.push(dbDist);

  if (candidates.length === 0) return null;

  const result = Math.min(...candidates);
  return Math.round(result * 10) / 10;
}

/**
 * Force all caches to be rebuilt on the next request.
 * Call this after the distance scripts update the DB or cache files.
 */
export function invalidateConsensusMap(): void {
  graph = null;
  dijkstraCache = null;
  dbMinMap = null;
  dbMinMapBuiltAt = null;
  directCache = null;
  barikoiDistCache.clear();
}
