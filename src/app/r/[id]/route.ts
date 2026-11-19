import { after, NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { validRunSig } from "@/lib/links";
import { allow, tooMany } from "@/lib/rate-limit";

// Link previews and crawlers shouldn't count as taps.
const BOT = /bot|crawler|spider|facebookexternalhit|facebookcatalog|preview|slurp/i;
// Run IDs are cuids. Anything else can't exist, so it never reaches the database.
const RUN_ID = /^c[a-z0-9]{20,32}$/;

/**
 * Link button in the final DM (/r/<run id>.<signature>): counts the tap, then sends the person
 * to the real link. Links sent before they were signed (/r/<run id>) still redirect, but their
 * taps aren't counted, so a guessed run ID can't inflate the numbers.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!allow(req, "r", 120, 60_000)) return tooMany();
  const [id, sig] = (await params).id.split(".");
  const run = RUN_ID.test(id)
    ? await db.run.findUnique({
        where: { id },
        select: { id: true, linkClickedAt: true, automation: { select: { linkUrl: true } } },
      })
    : null;
  const url = run?.automation.linkUrl;
  if (!run || !url) return new NextResponse("This link is no longer available.", { status: 404 });

  if (validRunSig(run.id, sig) && !BOT.test(req.headers.get("user-agent") ?? "")) {
    // Counted after the redirect is on its way, so the person never waits for our bookkeeping.
    after(() =>
      db.run
        .update({
          where: { id: run.id },
          data: { linkClicks: { increment: 1 }, ...(run.linkClickedAt ? {} : { linkClickedAt: new Date() }) },
        })
        .catch((err) => console.error("[autodm] click tracking failed", err)),
    );
  }
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
