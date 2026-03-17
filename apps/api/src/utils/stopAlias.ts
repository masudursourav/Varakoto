import { BusRoute } from "../models/busRoute.model.js";
import { normalizeText } from "./normalizeText.js";

// Maps normalized stop name (EN or BN) → set of canonical English names
let aliasMap: Map<string, Set<string>> | null = null;
let aliasMapBuiltAt: number | null = null;

/** Re-build the alias map at most once per this interval (ms). */
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Manual aliases: different DB names that are the same physical stop.
// Each entry maps an alias → list of canonical names it should also resolve to.
const MANUAL_ALIASES: [string, string[]][] = [
  ["tongi bazar", ["tongi"]],
  ["tongi", ["tongi bazar"]],
  ["mirpur 10", ["mirpur-10"]],
  ["mirpur-10", ["mirpur 10"]],
  ["mirpur 11", ["mirpur-11"]],
  ["mirpur-11", ["mirpur 11"]],
  ["farm gate", ["farmgate"]],
  ["farmgate", ["farm gate"]],
  ["mogbazar", ["mog bazar"]],
  ["mog bazar", ["mogbazar"]],
  ["kawran bazar", ["karwan bazar", "kawranbazar"]],
  ["karwan bazar", ["kawran bazar", "kawranbazar"]],
  ["kawranbazar", ["kawran bazar", "karwan bazar"]],
  ["shahbagh", ["shahbag"]],
  ["shahbag", ["shahbagh"]],
  ["rampura", ["rampura bridge"]],
  ["rampura bridge", ["rampura"]],
];

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function buildAliasMap(): Promise<Map<string, Set<string>>> {
  const routes = await BusRoute.find({}, { stops: 1 }).lean();
  const map = new Map<string, Set<string>>();

  for (const route of routes) {
    for (const stop of route.stops) {
      const canonicalEn = normalizeText(stop.name_en);
      const normalizedBn = normalizeText(stop.name_bn);

      // English name → itself
      if (!map.has(canonicalEn)) map.set(canonicalEn, new Set());
      map.get(canonicalEn)!.add(canonicalEn);

      // Bengali name → canonical English name
      if (!map.has(normalizedBn)) map.set(normalizedBn, new Set());
      map.get(normalizedBn)!.add(canonicalEn);
    }
  }

  // Apply manual aliases
  for (const [alias, targets] of MANUAL_ALIASES) {
    if (!map.has(alias)) map.set(alias, new Set());
    for (const target of targets) {
      map.get(alias)!.add(target);
    }
  }

  return map;
}

async function ensureAliasMap(): Promise<Map<string, Set<string>>> {
  const now = Date.now();
  const isStale =
    !aliasMap ||
    aliasMapBuiltAt === null ||
    now - aliasMapBuiltAt > CACHE_TTL_MS;

  if (isStale) {
    aliasMap = await buildAliasMap();
    aliasMapBuiltAt = now;
  }

  return aliasMap!;
}

// ---------------------------------------------------------------------------
// Fuzzy fallback helpers
// ---------------------------------------------------------------------------

/**
 * Remove spaces and punctuation, lower-case — used for loose comparisons.
 * e.g. "Farm Gate" → "farmgate", "Mirpur-10" → "mirpur10"
 */
function compact(text: string): string {
  return text.toLowerCase().replace(/[\s\-_.,]/g, "");
}

/**
 * Try to find candidate canonical English names for a query that had no
 * exact match in the alias map.  Three escalating strategies:
 *
 * 1. Compact match — strip all spaces/hyphens from both sides.
 *    Handles "Farm Gate" ↔ "Farmgate", "Mirpur-10" ↔ "Mirpur 10".
 *
 * 2. Prefix / contains match — the compact query is a prefix of a key or
 *    vice-versa.  Handles "mohakhali" finding "mohakhali bus stand".
 *
 * 3. Token subset match — every whitespace-split word of the query appears
 *    somewhere inside a key.  Handles "airport road" finding "airport".
 *
 * Returns the union of all matched canonical names, or an empty array.
 */
function fuzzyLookup(query: string, map: Map<string, Set<string>>): string[] {
  const normalizedQuery = normalizeText(query);
  const compactQuery = compact(query);
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  const found = new Set<string>();

  for (const [key, canonicals] of map) {
    const compactKey = compact(key);

    // Strategy 1: compact equality
    if (compactKey === compactQuery) {
      canonicals.forEach((c) => found.add(c));
      continue;
    }

    // Strategy 2: compact prefix or substring
    if (
      compactKey.startsWith(compactQuery) ||
      compactQuery.startsWith(compactKey) ||
      compactKey.includes(compactQuery) ||
      compactQuery.includes(compactKey)
    ) {
      canonicals.forEach((c) => found.add(c));
      continue;
    }

    // Strategy 3: all query tokens appear inside the key
    if (
      queryTokens.length > 0 &&
      queryTokens.every((token) => key.includes(token))
    ) {
      canonicals.forEach((c) => found.add(c));
      continue;
    }
  }

  return Array.from(found);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a user-supplied stop name (Bengali or English, any casing/spacing)
 * to an array of canonical English stop names used as DB keys.
 *
 * Resolution order:
 *  1. Exact normalised match in alias map
 *  2. Fuzzy fallback (compact, prefix/contains, token-subset)
 *
 * Returns an empty array when no match is found.
 */
export async function resolveEnglishNames(input: string): Promise<string[]> {
  const map = await ensureAliasMap();
  const normalized = normalizeText(input);

  // Exact match first
  const exact = map.get(normalized);
  if (exact && exact.size > 0) return Array.from(exact);

  // Fuzzy fallback
  return fuzzyLookup(input, map);
}

export async function getAliasMap(): Promise<Map<string, Set<string>>> {
  return ensureAliasMap();
}

/**
 * Force the alias map to be rebuilt on the next request.
 * Call this after any DB mutation that adds or renames stops.
 */
export function invalidateAliasMap(): void {
  aliasMap = null;
  aliasMapBuiltAt = null;
}
