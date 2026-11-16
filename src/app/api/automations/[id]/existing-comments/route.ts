import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { forbidden, getAccount, isSameOrigin } from "@/lib/session";
import { queueExistingComments } from "@/lib/engine";
import { GraphError } from "@/lib/instagram";
import { drainQueueFor } from "@/lib/worker";

// On Vercel the function keeps sending the spaced-out replies after answering (see drainQueueFor).
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** Queues the comments that were already on the automation's posts (last 7 days). */
export async function POST(req: Request, { params }: Ctx) {
  if (!isSameOrigin(req)) return forbidden();
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const automation = await db.automation.findFirst({ where: { id: (await params).id, accountId: account.id } });
  if (!automation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await queueExistingComments(account, automation.id);
    if (result.queued && process.env.VERCEL && process.env.DISABLE_VERCEL_DRAIN !== "1") {
      after(() => drainQueueFor(280_000));
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GraphError && err.isAuth) {
      return NextResponse.json({ error: "Instagram login expired. Reconnect Instagram and try again." }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Couldn't load the existing comments: ${message}`.slice(0, 300) }, { status: 502 });
  }
}
