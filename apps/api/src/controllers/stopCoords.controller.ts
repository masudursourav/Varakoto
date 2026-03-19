import type { Request, Response, NextFunction } from "express";
import { resolveStopCoords } from "../utils/geo.js";
import { resolveEnglishNames } from "../utils/stopAlias.js";
import { sanitizeInput } from "../utils/normalizeText.js";

/**
 * GET /api/v1/stop-coords?origin=Airport&destination=Farmgate
 *
 * Returns lat/lng for the two stops so the frontend can render a map preview.
 */
export async function getStopCoords(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const origin = (req.query.origin as string || "").trim();
    const destination = (req.query.destination as string || "").trim();

    if (!origin || !destination) {
      res.status(400).json({
        success: false,
        message: "Both origin and destination query parameters are required",
      });
      return;
    }

    const [originNames, destNames] = await Promise.all([
      resolveEnglishNames(sanitizeInput(origin)),
      resolveEnglishNames(sanitizeInput(destination)),
    ]);

    const [originCoords, destCoords] = await Promise.all([
      resolveStopCoords(originNames),
      resolveStopCoords(destNames),
    ]);

    if (!originCoords || !destCoords) {
      res.json({ success: true, data: null });
      return;
    }

    res.json({
      success: true,
      data: {
        origin: { lat: originCoords[0], lng: originCoords[1] },
        destination: { lat: destCoords[0], lng: destCoords[1] },
      },
    });
  } catch (error) {
    next(error);
  }
}
