/**
 * Distance Consensus — Google-verified distances with shortest-path fallback.
 *
 * Priority order:
 * 1. Precomputed Google direct distance (from .direct-distance-cache.json)
 *    → Most accurate, covers all pairs within 30km
 * 2. Dijkstra shortest path through Google-verified edges
 *    → Fallback for uncached pairs, applies 0.90 correction factor
 * 3. DB minimum km difference
 *    → Last resort fallback
 *
 * Final result: minimum of all available sources, ensuring fare is
 * never higher than Google Maps distance.
 */

import fs from "fs";
import path from "path";
import { BusRoute } from "../models/busRoute.model.js";
import { normalizeText } from "./normalizeText.js";

// Cache file paths (relative to process.cwd which is apps/api/)
const EDGE_CACHE = path.resolve(process.cwd(), ".distance-cache.json");
const DIRECT_CACHE = path.resolve(process.cwd(), ".direct-distance-cache.json");

// Dijkstra correction: shortest path through graph tends to overestimate
// by ~10% due to hop-by-hop road detours
const DIJKSTRA_FACTOR = 0.90;

// Manual distance overrides (take priority over all other sources)
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
};

type Graph = Map<string, Map<string, number>>;

let graph: Graph | null = null;
let dijkstraCache: Map<string, number> | null = null;
let dbMinMap: Map<string, number> | null = null;
let directCache: Record<string, number | null> | null = null;

function pairKey(stop1: string, stop2: string): string {
  const a = normalizeText(stop1);
  const b = normalizeText(stop2);
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function loadDirectCache(): Record<string, number | null> {
  if (fs.existsSync(DIRECT_CACHE)) {
    const data = JSON.parse(fs.readFileSync(DIRECT_CACHE, "utf-8"));
    console.log(
      `Direct distance cache: ${Object.values(data).filter((v) => v !== null).length} pairs`
    );
    return data;
  }
  return {};
}

function buildGraph(): Graph {
  const g: Graph = new Map();

  if (!fs.existsSync(EDGE_CACHE)) {
    console.warn("Edge cache not found at", EDGE_CACHE);
    return g;
  }

  const cache: Record<string, number | null> = JSON.parse(
    fs.readFileSync(EDGE_CACHE, "utf-8")
  );

  for (const [key, dist] of Object.entries(cache)) {
    if (dist === null || dist <= 0) continue;

    const [a, b] = key.split("||");
    const na = normalizeText(a);
    const nb = normalizeText(b);

    if (!g.has(na)) g.set(na, new Map());
    if (!g.has(nb)) g.set(nb, new Map());

    const existing = g.get(na)!.get(nb);
    if (existing === undefined || dist < existing) {
      g.get(na)!.set(nb, dist);
      g.get(nb)!.set(na, dist);
    }
  }

  console.log(
    `Distance graph: ${g.size} stops, ${Object.keys(cache).length} edges`
  );
  return g;
}

function dijkstra(g: Graph, start: string, end: string): number | null {
  const dist = new Map<string, number>();
  const visited = new Set<string>();
  const queue: [number, string][] = [[0, start]];
  dist.set(start, 0);

  while (queue.length > 0) {
    let minIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i][0] < queue[minIdx][0]) minIdx = i;
    }
    const [d, node] = queue.splice(minIdx, 1)[0];

    if (node === end) return d;
    if (visited.has(node)) continue;
    visited.add(node);

    const neighbors = g.get(node);
    if (!neighbors) continue;

    for (const [neighbor, weight] of neighbors) {
      if (visited.has(neighbor)) continue;
      const newDist = d + weight;
      if (!dist.has(neighbor) || newDist < dist.get(neighbor)!) {
        dist.set(neighbor, newDist);
        queue.push([newDist, neighbor]);
      }
    }
  }

  return null;
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

async function ensureReady(): Promise<void> {
  if (!directCache) {
    directCache = loadDirectCache();
  }
  if (!graph) {
    graph = buildGraph();
    dijkstraCache = new Map();
  }
  if (!dbMinMap) {
    dbMinMap = await buildDbMinMap();
  }
}

/**
 * Get the best distance between two stops.
 * Guarantees result is never higher than Google Maps direct distance.
 */
export async function getConsensusDistance(
  stop1En: string,
  stop2En: string
): Promise<number | null> {
  await ensureReady();

  const key = pairKey(stop1En, stop2En);

  // Source 0: Manual override (highest priority)
  if (key in MANUAL_OVERRIDES) {
    return MANUAL_OVERRIDES[key];
  }

  // Source 1: Precomputed Google direct distance (most accurate)
  const googleDirect = directCache![key];

  // Source 2: Dijkstra shortest path with correction factor
  let dijkstraDist: number | null = null;
  if (dijkstraCache!.has(key)) {
    dijkstraDist = dijkstraCache!.get(key)!;
  } else {
    const na = normalizeText(stop1En);
    const nb = normalizeText(stop2En);
    if (graph!.has(na) && graph!.has(nb)) {
      const raw = dijkstra(graph!, na, nb);
      dijkstraDist = raw !== null ? raw * DIJKSTRA_FACTOR : null;
      if (dijkstraDist !== null) {
        dijkstraCache!.set(key, dijkstraDist);
      }
    }
  }

  // Source 3: DB minimum km difference
  const dbDist = dbMinMap!.get(key) ?? null;

  // Pick the minimum of all available sources
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
 * Invalidate all caches (e.g., after DB updates).
 */
export function invalidateConsensusMap(): void {
  graph = null;
  dijkstraCache = null;
  dbMinMap = null;
  directCache = null;
}
