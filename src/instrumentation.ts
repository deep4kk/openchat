/** Next.js calls register() once when the server starts. */
export async function register() {
  // The import must sit inside this check so the Edge build never bundles
  // Node-only code (node:crypto, Prisma). An early return is not enough.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Serverless hosts (Vercel) freeze the process between requests, so the queue
    // runs as a separate always-on worker there instead (npm run worker).
    if (process.env.VERCEL || process.env.DISABLE_INLINE_WORKER === "1") return;
    const { startWorker } = await import("./lib/worker");
    startWorker();
  }
}
