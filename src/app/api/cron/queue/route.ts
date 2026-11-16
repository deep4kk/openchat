import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { drainQueueFor } from "@/lib/worker";

export const maxDuration = 60;

/** Daily safety net on Vercel (see vercel.json): sends retries and backoffs no webhook picked up. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  await drainQueueFor(50_000);
  return NextResponse.json({ ok: true });
}
