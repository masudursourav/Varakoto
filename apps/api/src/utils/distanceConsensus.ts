/**
 * Distance Consensus — Google-verified distances with shortest-path fallback.
 *
 * Priority order:
 * 1. Precomputed Google direct distance (from .direct-distance-cache.json)
 *    → Most accurate, covers all pairs within 30 km
 * 2. Dijkstra shortest path through Google-verified edges (O((V+E) log V) binary heap)
 *    → Fallback for uncached pairs, applies 0.90 correction factor
 * 3. DB minimum km difference
 *    → Last resort fallback
 *
 * Final result: minimum of all available sources, ensuring fare is
 * never higher than the Google Maps distance.
 */

import fs from "fs";
import path from "path";
import { BusRoute } from "../models/busRoute.model.js";
import { normalizeText } from "./normalizeText.js";

// ─── Cache file paths ─────────────────────────────────────────────────────────

const EDGE_CACHE = path.resolve(process.cwd(), ".distance-cache.json");
const DIRECT_CACHE = path.resolve(process.cwd(), ".direct-distance-cache.json");

// ─── Constants ────────────────────────────────────────────────────────────────

/** Dijkstra correction: hop-by-hop routes tend to overestimate ~10%. */
const DIJKSTRA_FACTOR = 0.9;

/** How long (ms) to keep the DB-derived distance map before rebuilding. */
const DB_MIN_MAP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Manual overrides (always wins, regardless of any cached source) ──────────

function overrideKey(a: string, b: string): string {
  return [a.toLowerCase().trim(), b.toLowerCase().trim()].sort().join("||");
}

const MANUAL_OVERRIDES: Record<string, number> = {
  [overrideKey("azampur", "mirpur 11")]: 11.6,
  [overrideKey("azampur", "mirpur-11")]: 11.6,
  [overrideKey("azampur", "mirpur 10")]: 10.5,
  [overrideKey("azampur", "mirpur-10")]: 10.5,
  [overrideKey("azampur", "mohakhali")]: 8.5,
  [overrideKey("azampur", "farmgate")]: 14.0,
  [overrideKey("azampur", "tongi")]: 7.0,
  [overrideKey("azampur", "rajlakshmi")]: 5.5,
  [overrideKey("azampur", "house building")]: 12.0,
  [overrideKey("tongi bazar", "banani")]: 12.6,
  [overrideKey("tongi", "banani")]: 12.6,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Graph = Map<string, Map<string, number>>;

// ─── Module-level singletons ─────────────────────────────────────────────────

let graph: Graph | null = null;
let dijkstraCache: Map<string, number> | null = null;

let dbMinMap: Map<string, number> | null = null;
let dbMinMapBuiltAt: number | null = null;

let directCache: Record<string, number | null> | null = null;

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

  // Source 0: Manual override (highest priority, always wins)
  if (key in MANUAL_OVERRIDES) {
    return MANUAL_OVERRIDES[key];
  }

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

  // Source 3: DB minimum km difference
  const dbDist = dbMinMap!.get(key) ?? null;

  // Collect all valid candidates and pick the smallest
  const candidates: number[] = [];
  if (googleDirect !== null && googleDirect !== undefined) {
    candidates.push(googleDirect);
  }
  if (dijkstraDist !== null) candidates.push(dijkstraDist);
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
}
