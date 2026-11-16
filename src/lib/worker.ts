import { processQueue } from "./engine";
import { missingEnv } from "./env";

const INTERVAL_MS = 3000;
const g = globalThis as unknown as { autodmWorker?: NodeJS.Timeout };

/** Drains the send queue in the background for as long as the server runs. */
export function startWorker() {
  if (g.autodmWorker) return;
  const missing = missingEnv();
  if (missing.length) {
    // Stay alive instead of exiting, so a host like Render doesn't restart the worker in a loop.
    // Settings only change on a redeploy, which starts a fresh process.
    const warn = () =>
      console.warn(`[autodm] Worker not started, missing settings: ${missing.join(", ")} (see docs/SETUP.md)`);
    warn();
    g.autodmWorker = setInterval(warn, 10 * 60_000);
    return;
  }
  g.autodmWorker = setInterval(() => {
    processQueue().catch((err) => console.error("[autodm] queue error", err));
  }, INTERVAL_MS);
  console.log("[autodm] Worker started");
}
