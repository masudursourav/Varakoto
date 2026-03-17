import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

/**
 * Factory that returns an Express middleware validating `req.body`
 * against the given Zod schema.
 *
 * On failure it responds with 400 and a structured error list so the
 * client always knows exactly which fields are wrong.
 */
export function validateBody<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
      return;
    }

    // Replace req.body with the parsed (and coerced/stripped) value
    req.body = result.data;
    next();
  };
}

// ─── Shared request schemas ───────────────────────────────────────────────────

export const FareRequestSchema = z.object({
  origin: z
    .string()
    .min(1, "Origin cannot be empty")
    .max(200, "Origin is too long"),
  destination: z
    .string()
    .min(1, "Destination cannot be empty")
    .max(200, "Destination is too long"),
});

export type FareRequest = z.infer<typeof FareRequestSchema>;
