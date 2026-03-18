import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is required");
}

const PORT = parseInt(process.env.PORT || "5001", 10);

// Comma-separated list of allowed CORS origins.
// Defaults to localhost:3000 for local development.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const BARIKOI_API_KEY = process.env.BARIKOI_API_KEY || "";

export const env = {
  MONGODB_URI,
  PORT,
  ALLOWED_ORIGINS,
  BARIKOI_API_KEY,
} as const;
