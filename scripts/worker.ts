// Standalone queue worker for hosts where the website runs serverless (Vercel).
// Run it on an always-on machine (Render background worker): npm run worker
import { startWorker } from "../src/lib/worker";

startWorker();

process.on("SIGTERM", () => {
  console.log("[autodm] Worker stopping");
  process.exit(0);
});
