import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { forbidden, getAccount, isSameOrigin } from "@/lib/session";
import { automationInput, parseAutomation, toRow } from "@/lib/automation-schema";
import { GraphError, listMedia, tokenFor } from "@/lib/instagram";
import { planImport, readRows, shortcodeOf, type ImportMedia } from "@/lib/import";

export const maxDuration = 60;

const MEDIA_PAGE = 50;
/** How far back through the account's posts to look for the reels in the file (50 per page). */
const MAX_MEDIA_PAGES = 20;

const body = z.object({
  csv: z.string().min(1).max(1_000_000),
  /** true: only report what would happen. */
  dryRun: z.boolean(),
  options: automationInput.innerType().pick({
    triggerType: true,
    keywords: true,
    publicReplyEnabled: true,
    publicReplies: true,
    openingMessage: true,
    openingButton: true,
    askToFollow: true,
    followMessage: true,
    followVisitLabel: true,
    followConfirmLabel: true,
    followMaxAttempts: true,
    followOnFail: true,
  }),
});

/**
 * Creates one automation per row of a SuperProfile AutoDM export. Nothing is sent by the
 * import itself: the automations only answer comments that arrive from now on.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `${issue.path.join(".")}: ${issue.message}` }, { status: 400 });
  }
  const { csv, dryRun, options } = parsed.data;
  if (options.triggerType === "KEYWORDS" && options.keywords.length === 0) {
    return NextResponse.json({ error: "Add at least one keyword, or choose “Any comment”." }, { status: 400 });
  }
  if (options.publicReplyEnabled && options.publicReplies.length === 0) {
    return NextResponse.json({ error: "Add at least one public reply, or turn public replies off." }, { status: 400 });
  }

  let rows;
  try {
    rows = readRows(csv);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't read the file." }, { status: 400 });
  }
  if (rows.length === 0) return NextResponse.json({ error: "The file has no rows." }, { status: 400 });

  // The file names reels by link; Instagram's API needs their IDs. Page through the account's
  // posts (newest first) until every reel in the file has been seen.
  const wanted = new Set(rows.map((r) => r.shortcode).filter((c): c is string => Boolean(c)));
  const media: ImportMedia[] = [];
  try {
    const token = await tokenFor(account);
    let after: string | undefined;
    for (let page = 0; page < MAX_MEDIA_PAGES && wanted.size > 0; page++) {
      const res = await listMedia(token, after, MEDIA_PAGE);
      for (const m of res.data) {
        media.push({ id: m.id, permalink: m.permalink, caption: m.caption, thumbnail: m.thumbnail_url ?? m.media_url });
        const code = shortcodeOf(m.permalink);
        if (code) wanted.delete(code);
      }
      after = res.paging?.cursors?.after;
      if (!res.paging?.next || !after) break;
    }
  } catch (err) {
    if (err instanceof GraphError && err.isAuth) {
      await db.account.update({ where: { id: account.id }, data: { status: "RECONNECT" } });
      return NextResponse.json({ error: "Your Instagram login has expired. Reconnect Instagram from the dashboard and try again." }, { status: 401 });
    }
    console.error("[autodm] import: listing posts failed", err);
    const message = err instanceof GraphError && err.isRateLimit ? "Instagram is busy right now. Try again in a few minutes." : "Couldn't load your posts from Instagram. Try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const existing = await db.automation.findMany({ where: { accountId: account.id, mediaScope: "SPECIFIC_MEDIA" } });
  const covered = new Set(existing.flatMap((a) => parseAutomation(a).mediaIds));
  const plan = planImport(rows, media, covered, account.username, options);

  let created = 0;
  if (!dryRun) {
    const data = plan.flatMap((p) =>
      p.status === "ready" && p.input
        ? [{ ...toRow(p.input), accountId: account.id, ...(p.createdAt ? { createdAt: p.createdAt } : {}) }]
        : [],
    );
    if (data.length) created = (await db.automation.createMany({ data })).count;
  }

  return NextResponse.json({
    created,
    items: plan.map(({ row, permalink, name, status, note }) => ({ row, permalink, name, status, note })),
  });
}
