import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase(): Promise<void> {
  const uri = env.MONGODB_URI;

  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB successfully");
  } catch (error) {
    console.warn(
      "Initial MongoDB connection failed, attempting SRV→direct fallback..."
    );

    if (uri.startsWith("mongodb+srv://")) {
      try {
        const directUri = uri
          .replace("mongodb+srv://", "mongodb://")
          .replace(/\/\?/, ":27017/?")
          .concat(
            uri.includes("?") ? "&directConnection=true" : "?directConnection=true"
          );

        await mongoose.connect(directUri);
        console.log("Connected to MongoDB via direct fallback successfully");
      } catch (fallbackError) {
        console.error("MongoDB direct fallback also failed:", fallbackError);
        throw fallbackError;
      }
    } else {
      console.error("MongoDB connection failed:", error);
      throw error;
    }
  }
}
