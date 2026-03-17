import { env } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import app from "./app.js";

async function start(): Promise<void> {
  await connectDatabase();

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
