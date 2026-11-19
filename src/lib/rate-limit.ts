/**
 * A small per-IP limiter for the public endpoints. It counts in memory, so each server instance
 * (each Vercel function instance) keeps its own tally: it slows down hammering, it isn't a quota.
 */
const windows = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 10_000;

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** True if this request is within `limit` requests per `windowMs` for its bucket and IP. */
export function allow(req: Request, bucket: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (windows.size > MAX_KEYS) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    if (windows.size > MAX_KEYS) windows.clear();
  }
  const key = `${bucket}:${clientIp(req)}`;
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  w.count++;
  return w.count <= limit;
}

export const tooMany = () =>
  new Response("Too many requests. Wait a minute and try again.", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
