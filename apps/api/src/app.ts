import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import v1Routes from "./routes/v1.routes.js";
import swaggerDocument from "./swagger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { env } from "./config/env.js";

const app = express();

// ─── Security ────────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: env.ALLOWED_ORIGINS,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  }),
);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "16kb" }));

// ─── Rate Limiting ───────────────────────────────────────────────────────────

/**
 * General limiter — applies to all /api/v1 routes.
 * 120 requests per minute is generous for a bus fare app.
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please wait a moment and try again.",
  },
});

/**
 * Fare limiter — stricter limit specifically for the fare calculate endpoint,
 * which performs multiple DB queries and Dijkstra path-finding per call.
 * 30 calculations per minute per IP is more than enough for real usage.
 */
const fareLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many fare calculations. Please wait a moment and try again.",
  },
});

/**
 * Barikoi limiter — endpoints that proxy the Barikoi API are capped at
 * 15 req/min per IP to avoid burning through the upstream quota.
 */
const barikoiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many location requests. Please wait a moment and try again.",
  },
});

app.use("/api/v1", generalLimiter);
app.use("/api/v1/fare/calculate", fareLimiter);
app.use("/api/v1/nearest-stop", barikoiLimiter);
app.use("/api/v1/route-to-stop", barikoiLimiter);
app.use("/api/v1/search/places", barikoiLimiter);
app.use("/api/v1/route-map", barikoiLimiter);

// ─── Health ──────────────────────────────────────────────────────────────────

app.get("/api/v1/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─── Swagger API Docs ────────────────────────────────────────────────────────

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    customSiteTitle: "Vara Koto API Docs",
  }),
);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use("/api/v1", v1Routes);

// ─── Error Handler ───────────────────────────────────────────────────────────

app.use(errorHandler);

export default app;
