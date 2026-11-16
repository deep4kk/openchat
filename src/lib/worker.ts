import { db } from "./db";
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

/**
 * For serverless hosts (Vercel) with no always-on worker: keep sending for up to `ms`
 * after a webhook, so a fresh comment gets its reply once its short human-like delay is over.
 * Anything due later (rate-limit backoff, retries) is picked up by the next webhook or the daily cron.
 */
export async function drainQueueFor(ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await processQueue();
    const next = await db.run.findFirst({
      where: { state: "QUEUED" },
      orderBy: { nextAttemptAt: "asc" },
      select: { nextAttemptAt: true },
    });
    if (!next || next.nextAttemptAt.getTime() > end) return;
    const wait = Math.min(3000, Math.max(500, next.nextAttemptAt.getTime() - Date.now()));
    await new Promise((r) => setTimeout(r, wait));
  }
}
