/**
 * Webhook processing: comment -> public reply + private reply (opener)
 * -> user taps -> follow check -> link DM.
 *
 * Meta rules that shape this flow:
 *  - A comment allows exactly ONE private reply (recipient.comment_id), within 7 days.
 *  - Further DMs are only allowed within 24h after the user messages us.
 *  - is_user_follow_business is only readable after the user has messaged us.
 * So the opener carries a quick-reply button; the tap is the user's message,
 * which opens the 24h window and grants the consent needed for the follow check.
 *
 * Account safety:
 *  - Comment-triggered sends (the only ones we start) go through a paced queue
 *    with hourly caps per account and a minimum gap between sends (see limits).
 *  - Rate-limit errors back off instead of retrying immediately.
 *  - A revoked token pauses the account until its owner logs in again.
 *  - Everything after the opener is a direct answer to the user's own tap.
 */
import type { Account, Automation, Run } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { isAllowedUsername, limits } from "./env";
import { parseAutomation, type ParsedAutomation } from "./automation-schema";
import { payload, pickRandom, selectAutomation } from "./matching";
import {
  GraphError,
  getFollowStatus,
  replyToComment,
  sendMessage,
  tokenFor,
  type Button,
  type Recipient,
} from "./instagram";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const CARD_TITLE_MAX = 80;
/** Private replies must go out within 7 days of the comment; stop a little earlier. */
const PRIVATE_REPLY_WINDOW = 7 * DAY - 6 * HOUR;
/** Taps arriving this soon after the previous step are treated as double taps. */
const DEBOUNCE_MS = 4000;
const MAX_TRANSIENT_RETRIES = 5;

type CommentValue = {
  id: string;
  text?: string;
  parent_id?: string;
  from?: { id: string; username?: string };
  media?: { id: string; media_product_type?: string };
};

type MessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: { mid: string; text?: string; is_echo?: boolean; quick_reply?: { payload: string } };
  postback?: { mid: string; title?: string; payload?: string };
};

export type WebhookBody = {
  object: string;
  entry?: { id: string; time: number; changes?: { field: string; value: unknown }[]; messaging?: MessagingEvent[] }[];
};

export async function handleWebhook(body: WebhookBody) {
  if (body.object !== "instagram") return;
  for (const entry of body.entry ?? []) {
    const account = await db.account.findUnique({ where: { igUserId: String(entry.id) } });
    if (!account || !isAllowedUsername(account.username)) continue;

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      await safely(() => handleComment(account, change.value as CommentValue), "comment");
    }
    if (account.status !== "ACTIVE") continue;
    for (const event of entry.messaging ?? []) {
      await safely(() => handleMessaging(account, event), "messaging");
    }
  }
}

async function safely(fn: () => Promise<void>, label: string) {
  try {
    await fn();
  } catch (err) {
    console.error(`[autodm] ${label} handler failed`, err);
  }
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);
const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.floor(Math.random() * (max - min));

async function markReconnect(accountId: string) {
  await db.account.update({ where: { id: accountId }, data: { status: "RECONNECT" } });
}

// ---------------------------------------------------------------- comments

/** Matches the comment to an automation and queues it. Sending happens in processQueue. */
async function handleComment(account: Account, value: CommentValue) {
  const igsid = value?.from?.id;
  const mediaId = value?.media?.id;
  const text = value?.text ?? "";
  // Ignore our own comments/replies (including the public replies we post).
  if (!value?.id || !igsid || !mediaId || igsid === account.igUserId) return;

  const rows = await db.automation.findMany({ where: { accountId: account.id, active: true } });
  const automation = selectAutomation(rows.map(parseAutomation), mediaId, text);
  if (!automation) return;

  if (automation.oncePerUser) {
    const previous = await db.run.findFirst({
      where: { automationId: automation.id, igsid, state: { notIn: ["FAILED", "EXPIRED"] } },
    });
    if (previous) return;
  }

  try {
    await db.run.create({
      data: {
        accountId: account.id,
        automationId: automation.id,
        commentId: value.id,
        commentText: text.slice(0, 1000),
        mediaId,
        igsid,
        username: value.from?.username,
        state: "QUEUED",
        // A short human-like delay instead of replying in the same second.
        nextAttemptAt: new Date(Date.now() + jitter(3000, 9000)),
      },
    });
  } catch (err) {
    // The unique commentId makes Meta's webhook retries no-ops.
    if (!isUniqueViolation(err)) throw err;
  }
}

// ---------------------------------------------------------------- queue

let queueRunning = false;
let lastCleanup = 0;
const lastSendAt = new Map<string, number>();

/** Sends due queued runs. Called on an interval by the worker; safe to call concurrently. */
export async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    const now = Date.now();
    await db.run.updateMany({
      where: { state: "QUEUED", createdAt: { lt: new Date(now - PRIVATE_REPLY_WINDOW) } },
      data: { state: "EXPIRED", error: "Could not send within Instagram's 7-day reply window" },
    });
    // Recover runs left mid-send by a crash or restart.
    await db.run.updateMany({
      where: { state: "SENDING", updatedAt: { lt: new Date(now - 5 * MINUTE) } },
      data: { state: "QUEUED" },
    });
    if (now - lastCleanup > HOUR) {
      lastCleanup = now;
      await db.processedEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 7 * DAY) } } });
    }

    const due = await db.run.findMany({
      where: { state: "QUEUED", nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: "asc" },
      take: 25,
      include: { account: true, automation: true },
    });
    for (const run of due) {
      await safely(() => sendQueuedRun(run), "queue");
    }
  } finally {
    queueRunning = false;
  }
}

async function requeue(runId: string, delayMs: number, data: Prisma.RunUpdateInput = {}) {
  await db.run.update({
    where: { id: runId },
    data: { ...data, state: "QUEUED", nextAttemptAt: new Date(Date.now() + delayMs) },
  });
}

async function sentInLastHour(accountId: string, field: "privateRepliedAt" | "publicRepliedAt") {
  return db.run.count({ where: { accountId, [field]: { gt: new Date(Date.now() - HOUR) } } });
}

async function sendQueuedRun(run: Run & { account: Account; automation: Automation }) {
  // Claim it so no other worker sends the same run.
  const claimed = await db.run.updateMany({ where: { id: run.id, state: "QUEUED" }, data: { state: "SENDING" } });
  if (claimed.count === 0) return;

  const { account } = run;
  const automation = parseAutomation(run.automation);

  if (!automation.active) {
    await db.run.update({ where: { id: run.id }, data: { state: "ABANDONED", error: "Automation was paused before sending" } });
    return;
  }
  if (account.status !== "ACTIVE") {
    await requeue(run.id, 10 * MINUTE, { error: "Instagram account needs to be reconnected" });
    return;
  }
  if ((await sentInLastHour(account.id, "privateRepliedAt")) >= limits.dmsPerHour) {
    await requeue(run.id, jitter(5 * MINUTE, 10 * MINUTE), { error: "Waiting: hourly DM limit reached" });
    return;
  }

  const wait = (lastSendAt.get(account.id) ?? 0) + limits.minGapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastSendAt.set(account.id, Date.now());

  try {
    const token = await tokenFor(account);

    if (
      automation.publicReplyEnabled &&
      !run.publicRepliedAt &&
      (await sentInLastHour(account.id, "publicRepliedAt")) < limits.publicRepliesPerHour
    ) {
      const reply = pickRandom(automation.publicReplies);
      if (reply) {
        try {
          await replyToComment(token, run.commentId, reply);
          await db.run.update({ where: { id: run.id }, data: { publicRepliedAt: new Date() } });
        } catch (err) {
          // The public reply is a nice-to-have; never let it block the DM (unless the token is dead).
          if (err instanceof GraphError && err.isAuth) throw err;
          console.warn("[autodm] public reply skipped", errorText(err));
        }
      }
    }

    await sendOpener(token, run, automation);
    await db.run.update({
      where: { id: run.id },
      data: { state: "PRIVATE_REPLIED", privateRepliedAt: new Date(), error: null },
    });
  } catch (err) {
    const attempts = run.sendAttempts + 1;
    if (err instanceof GraphError && err.isAuth) {
      await markReconnect(account.id);
      await requeue(run.id, 10 * MINUTE, { error: "Instagram account needs to be reconnected" });
    } else if (err instanceof GraphError && err.isRateLimit) {
      await requeue(run.id, Math.min(attempts, 8) * 15 * MINUTE, { sendAttempts: attempts, error: `Instagram rate limit, retrying later` });
    } else if ((!(err instanceof GraphError) || err.isTransient) && attempts < MAX_TRANSIENT_RETRIES) {
      await requeue(run.id, 2 ** attempts * MINUTE, { sendAttempts: attempts, error: errorText(err) });
    } else {
      await db.run.update({ where: { id: run.id }, data: { state: "FAILED", sendAttempts: attempts, error: errorText(err) } });
    }
  }
}

/** The one allowed private reply. Falls back to plain text if Instagram rejects the button. */
async function sendOpener(token: string, run: Run, automation: ParsedAutomation) {
  const to: Recipient = { comment_id: run.commentId };
  try {
    await sendMessage(token, to, {
      text: automation.openingMessage,
      quick_replies: [{ content_type: "text", title: automation.openingButton, payload: payload.gate(run.id) }],
    });
  } catch (err) {
    if (!(err instanceof GraphError) || err.isAuth || err.isRateLimit || err.isTransient) throw err;
    // Any text reply from the user also continues the flow (see handleMessaging).
    await sendMessage(token, to, { text: `${automation.openingMessage}\n\nReply "${automation.openingButton}" to continue.` });
  }
}

// ---------------------------------------------------------------- DMs

/** Serialises work per conversation so double taps can't send twice. */
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next);
  next.finally(() => locks.get(key) === next && locks.delete(key)).catch(() => {});
  return next;
}

async function handleMessaging(account: Account, event: MessagingEvent) {
  if (event.message?.is_echo) return;
  const igsid = event.sender?.id;
  if (!igsid || igsid === account.igUserId) return;

  const mid = event.message?.mid ?? event.postback?.mid;
  if (!mid) return; // reads, reactions, etc.
  if (!(await markProcessed(mid))) return;

  const tapped = payload.parse(event.message?.quick_reply?.payload ?? event.postback?.payload);
  await withLock(`${account.id}:${igsid}`, () => continueRun(account, igsid, tapped?.runId));
}

async function continueRun(account: Account, igsid: string, runId?: string) {
  // A tap carries its run ID. Any other message from someone mid-flow counts as a
  // tap too, so the flow still works if their client didn't show the button.
  const run = runId
    ? await db.run.findFirst({ where: { id: runId, accountId: account.id, igsid } })
    : await db.run.findFirst({
        where: { accountId: account.id, igsid, state: { in: ["PRIVATE_REPLIED", "AWAITING_FOLLOW"] } },
        orderBy: { createdAt: "desc" },
      });
  if (!run || !["PRIVATE_REPLIED", "AWAITING_FOLLOW", "DELIVERED"].includes(run.state)) return;
  if (run.lastUserMessageAt && Date.now() - run.lastUserMessageAt.getTime() < DEBOUNCE_MS) return;

  // Compare-and-set claim: on serverless hosts two taps can land on different
  // instances, where the in-process lock doesn't reach. Only one claim wins.
  const claimed = await db.run.updateMany({
    where: { id: run.id, lastUserMessageAt: run.lastUserMessageAt },
    data: { lastUserMessageAt: new Date() },
  });
  if (claimed.count === 0) return;

  const row = await db.automation.findUnique({ where: { id: run.automationId } });
  if (!row) return;
  const automation = parseAutomation(row);
  const to: Recipient = { id: igsid };

  try {
    const token = await tokenFor(account);

    // Tapping again after delivery just resends the link.
    if (run.state === "DELIVERED" || !automation.askToFollow) {
      return await deliverLink(token, to, run, automation);
    }

    let follows = false;
    let checkError: string | null = null;
    try {
      follows = (await getFollowStatus(token, igsid)).is_user_follow_business === true;
    } catch (err) {
      if (err instanceof GraphError && (err.isAuth || err.isRateLimit)) throw err;
      checkError = `Follow check failed: ${errorText(err)}`;
    }
    if (follows) return await deliverLink(token, to, run, automation);

    if (run.followAttempts >= automation.followMaxAttempts) {
      if (automation.followOnFail === "SEND_ANYWAY") return await deliverLink(token, to, run, automation);
      await db.run.update({ where: { id: run.id }, data: { state: "ABANDONED", error: checkError } });
      return;
    }

    await sendCard(token, to, automation.followMessage, `Follow @${account.username} to continue`, [
      { type: "web_url", title: automation.followVisitLabel, url: `https://www.instagram.com/${account.username}/` },
      { type: "postback", title: automation.followConfirmLabel, payload: payload.recheck(run.id) },
    ]);
    await db.run.update({
      where: { id: run.id },
      data: { state: "AWAITING_FOLLOW", followAttempts: { increment: 1 }, error: checkError },
    });
  } catch (err) {
    if (err instanceof GraphError && err.isAuth) await markReconnect(account.id);
    const hint = err instanceof GraphError && err.isRateLimit ? "Instagram rate limit; the user can tap again later" : errorText(err);
    await db.run.update({ where: { id: run.id }, data: { error: hint } });
  }
}

async function deliverLink(token: string, to: Recipient, run: Run, automation: ParsedAutomation) {
  await sendCard(token, to, automation.linkMessage, "👇 Tap below", [
    { type: "web_url", title: automation.linkButtonLabel, url: automation.linkUrl },
  ]);
  await db.run.update({ where: { id: run.id }, data: { state: "DELIVERED", error: null } });
}

/**
 * Buttons need a generic-template card, whose title is capped at 80 chars.
 * Short messages become the card title; longer ones go out as text first.
 */
async function sendCard(token: string, to: Recipient, text: string, fallbackTitle: string, buttons: Button[]) {
  let title = text;
  if (text.length > CARD_TITLE_MAX) {
    await sendMessage(token, to, { text });
    title = fallbackTitle.slice(0, CARD_TITLE_MAX);
  }
  await sendMessage(token, to, {
    attachment: { type: "template", payload: { template_type: "generic", elements: [{ title, buttons }] } },
  });
}

/** Returns false if this webhook event was already handled. */
async function markProcessed(id: string): Promise<boolean> {
  try {
    await db.processedEvent.create({ data: { id } });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}
