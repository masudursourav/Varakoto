import { BusRoute } from "../models/busRoute.model.js";
import { normalizeText } from "./normalizeText.js";

// Maps normalized stop name (EN or BN) → set of canonical English names
let aliasMap: Map<string, Set<string>> | null = null;

async function buildAliasMap(): Promise<Map<string, Set<string>>> {
  const routes = await BusRoute.find({}, { stops: 1 }).lean();
  const map = new Map<string, Set<string>>();

  for (const route of routes) {
    for (const stop of route.stops) {
      const canonicalEn = normalizeText(stop.name_en);
      const normalizedBn = normalizeText(stop.name_bn);

      // Map English name to itself
      if (!map.has(canonicalEn)) {
        map.set(canonicalEn, new Set());
      }
      map.get(canonicalEn)!.add(canonicalEn);

      // Map Bengali name to canonical English name
      if (!map.has(normalizedBn)) {
        map.set(normalizedBn, new Set());
      }
      map.get(normalizedBn)!.add(canonicalEn);
    }
  }

  return map;
}

async function ensureAliasMap(): Promise<Map<string, Set<string>>> {
  if (!aliasMap) {
    aliasMap = await buildAliasMap();
  }
  return aliasMap;
}

export async function resolveEnglishNames(input: string): Promise<string[]> {
  const map = await ensureAliasMap();
  const normalized = normalizeText(input);
  const names = map.get(normalized);
  return names ? Array.from(names) : [];
}

export async function getAliasMap(): Promise<Map<string, Set<string>>> {
  return ensureAliasMap();
}
