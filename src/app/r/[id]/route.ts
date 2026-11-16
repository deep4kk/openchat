import { after, NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

// Link previews and crawlers shouldn't count as taps.
const BOT = /bot|crawler|spider|facebookexternalhit|facebookcatalog|preview|slurp/i;
// Run IDs are cuids. Anything else can't exist, so it never reaches the database.
const RUN_ID = /^c[a-z0-9]{20,32}$/;

/** Link button in the final DM: counts the tap, then sends the person to the real link. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = RUN_ID.test(id)
    ? await db.run.findUnique({
        where: { id },
        select: { id: true, linkClickedAt: true, automation: { select: { linkUrl: true } } },
      })
    : null;
  const url = run?.automation.linkUrl;
  if (!run || !url) return new NextResponse("This link is no longer available.", { status: 404 });

  if (!BOT.test(req.headers.get("user-agent") ?? "")) {
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
