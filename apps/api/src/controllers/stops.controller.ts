import type { Request, Response, NextFunction } from "express";
import { BusRoute } from "../models/busRoute.model.js";
import { getAliasMap } from "../utils/stopAlias.js";
import { normalizeText } from "../utils/normalizeText.js";

export async function getStops(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const routes = await BusRoute.find({}, { stops: 1 }).lean();
    const aliasMap = await getAliasMap();

    // Deduplicate stops by canonical English name
    const canonicalStops = new Map<string, { name_en: string; name_bn: string }>();

    for (const route of routes) {
      for (const stop of route.stops) {
        const normalized = normalizeText(stop.name_en);
        const canonicalNames = aliasMap.get(normalized);
        const canonical = canonicalNames
          ? Array.from(canonicalNames)[0]
          : normalized;

        if (!canonicalStops.has(canonical)) {
          canonicalStops.set(canonical, {
            name_en: stop.name_en,
            name_bn: stop.name_bn,
          });
        }
      }
    }

    const stops = Array.from(canonicalStops.values()).sort((a, b) =>
      a.name_en.localeCompare(b.name_en)
    );

    res.json({ success: true, data: stops });
  } catch (error) {
    next(error);
  }
}
