import { after, NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual, verifyMetaSignature } from "@/lib/crypto";
import { handleWebhook } from "@/lib/engine";
import { drainQueueFor } from "@/lib/worker";

// On Vercel the function stays alive after answering Meta, to send the queued reply (see drainQueueFor).
export const maxDuration = 300;

/** Meta's one-time verification handshake when you register the webhook URL. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && safeEqual(p.get("hub.verify_token") ?? "", env.webhookVerifyToken)) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), env.igAppSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }
  // Acknowledge immediately; Meta retries slow deliveries.
  after(async () => {
    await handleWebhook(body);
    // No always-on worker on Vercel (unless DISABLE_VERCEL_DRAIN=1 because a Render worker runs).
    if (process.env.VERCEL && process.env.DISABLE_VERCEL_DRAIN !== "1") await drainQueueFor(280_000); // covers reply delays up to 4 minutes
  });
  return NextResponse.json({ ok: true });
}
