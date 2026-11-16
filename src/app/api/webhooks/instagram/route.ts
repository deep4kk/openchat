import { after, NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { verifyMetaSignature } from "@/lib/crypto";
import { handleWebhook } from "@/lib/engine";

/** Meta's one-time verification handshake when you register the webhook URL. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === env.webhookVerifyToken) {
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
  after(() => handleWebhook(body));
  return NextResponse.json({ ok: true });
}
