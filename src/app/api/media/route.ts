import { NextResponse, type NextRequest } from "next/server";
import { getAccount } from "@/lib/session";
import { db } from "@/lib/db";
import { GraphError, listMedia, tokenFor } from "@/lib/instagram";

export async function GET(req: NextRequest) {
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const page = await listMedia(await tokenFor(account), req.nextUrl.searchParams.get("after") ?? undefined);
    return NextResponse.json({
      items: page.data,
      after: page.paging?.next ? page.paging.cursors?.after : undefined,
    });
  } catch (err) {
    if (err instanceof GraphError && err.isAuth) {
      await db.account.update({ where: { id: account.id }, data: { status: "RECONNECT" } });
      return NextResponse.json({ error: "Your Instagram login has expired. Reconnect Instagram from the dashboard.", reconnect: true }, { status: 401 });
    }
    const message = err instanceof GraphError && err.isRateLimit ? "Instagram is busy right now. Try again in a few minutes." : "Couldn't load your posts from Instagram. Try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
