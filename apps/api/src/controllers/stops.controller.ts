import type { Request, Response, NextFunction } from "express";
import { getAliasMap } from "../utils/stopAlias.js";
import { normalizeText } from "../utils/normalizeText.js";
import { getStopMap } from "../utils/stopMap.js";

export async function getStops(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stopMap = await getStopMap();
    const aliasMap = await getAliasMap();

    // Deduplicate stops by canonical English name
    const canonicalStops = new Map<string, { name_en: string; name_bn: string }>();

    for (const [normalized, stop] of stopMap) {
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

    const stops = Array.from(canonicalStops.values()).sort((a, b) =>
      a.name_en.localeCompare(b.name_en)
    );

    res.json({ success: true, data: stops });
  } catch (error) {
    next(error);
  }
}
