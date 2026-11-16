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
import { env, isAllowedUsername, limits } from "./env";
import { parseAutomation, type ParsedAutomation } from "./automation-schema";
import { payload, pickRandom, selectAutomation } from "./matching";
import {
  GraphError,
  getFollowStatus,
  listComments,
  listMedia,
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

/**
 * One line per step in the server log, so a comment or tap that goes nowhere can be traced.
 * Shapes and outcomes only: never usernames, IDs or message text.
 */
const trace = (message: string) => console.log(`[autodm] ${message}`);

const isMessagingEvent = (v: unknown): v is MessagingEvent =>
  typeof v === "object" && v !== null && "sender" in v && ("message" in v || "postback" in v);

export async function handleWebhook(body: WebhookBody) {
  if (body.object !== "instagram") return trace(`webhook ignored: object is ${String(body.object)}`);
  for (const entry of body.entry ?? []) {
    const shape = Object.keys(entry)
      .filter((k) => k !== "id" && k !== "time")
      .map((k) => (k === "changes" ? `changes(${(entry.changes ?? []).map((c) => c.field).join(",")})` : k))
      .join("+");
    const account = await db.account.findUnique({ where: { igUserId: String(entry.id) } });
    if (!account) {
      trace(`webhook [${shape}] ignored: no connected account has this entry ID`);
      continue;
    }
    if (!isAllowedUsername(account.username)) {
      trace(`webhook [${shape}] ignored: account is not in ALLOWED_IG_USERNAMES`);
      continue;
    }

    // Messages normally arrive under "messaging"; some app setups deliver them as a change instead.
    const events = [...(entry.messaging ?? [])];
    for (const change of entry.changes ?? []) {
      if (change.field === "comments") await safely(() => handleComment(account, change.value as CommentValue), "comment");
      else if (isMessagingEvent(change.value)) events.push(change.value);
      else trace(`webhook change "${change.field}" ignored`);
    }
    if (events.length && account.status !== "ACTIVE") {
      trace(`${events.length} message event(s) ignored: account status is ${account.status}`);
      continue;
    }
    for (const event of events) {
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
/** Error text for the server log, with Instagram IDs masked. */
const forLog = (text: string) => text.replace(/\d{9,}/g, "<id>");
const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.floor(Math.random() * (max - min));

async function markReconnect(accountId: string) {
  await db.account.update({ where: { id: accountId }, data: { status: "RECONNECT" } });
}

// ---------------------------------------------------------------- comments

/** Matches the comment to an automation and queues it. Sending happens in processQueue. */
async function handleComment(account: Account, value: CommentValue) {
  await queueComment(account, value);
}

/** The automation's chosen delay plus a little randomness, so replies don't land on the exact same second. */
function replyDelayMs(automation: { replyDelaySeconds: number }) {
  const base = Math.max(0, automation.replyDelaySeconds) * 1000;
  const total = base + jitter(1000, 1000 + Math.max(2000, base * 0.2));
  // Stay inside the 280 s the Vercel webhook keeps sending for (see drainQueueFor).
  return Math.min(total, Math.max(base, 250_000));
}

/** States that don't count as "this person already went through the automation". */
const RETRYABLE_STATES = ["FAILED", "EXPIRED"];

type NewRun = { commentId: string; text: string; mediaId: string; igsid: string; username?: string };

/** The queued Run row for one comment. `commentedAt` backdates it so the 7-day reply window counts from the comment. */
function queuedRun(accountId: string, automationId: string, c: NewRun, delayMs: number, commentedAt?: Date) {
  return {
    accountId,
    automationId,
    commentId: c.commentId,
    commentText: c.text.slice(0, 1000),
    mediaId: c.mediaId,
    igsid: c.igsid,
    username: c.username,
    state: "QUEUED",
    nextAttemptAt: new Date(Date.now() + delayMs),
    ...(commentedAt ? { createdAt: commentedAt } : {}),
  };
}

/** Returns true if a new run was queued. */
async function queueComment(account: Account, value: CommentValue): Promise<boolean> {
  const igsid = value?.from?.id;
  const mediaId = value?.media?.id;
  const text = value?.text ?? "";
  // Ignore our own comments/replies (including the public replies we post).
  if (!value?.id || !igsid || !mediaId || igsid === account.igUserId) return false;

  const rows = (await db.automation.findMany({ where: { accountId: account.id, active: true } })).map(parseAutomation);
  const automation = selectAutomation(rows, mediaId, text);
  if (!automation) return false;

  if (automation.oncePerUser) {
    const previous = await db.run.findFirst({
      where: { automationId: automation.id, igsid, state: { notIn: RETRYABLE_STATES } },
      select: { id: true },
    });
    if (previous) return false;
  }

  try {
    await db.run.create({
      // A short human-like delay instead of replying in the same second.
      data: queuedRun(account.id, automation.id, { commentId: value.id, text, mediaId, igsid, username: value.from?.username }, replyDelayMs(automation)),
    });
    return true;
  } catch (err) {
    // The unique commentId makes Meta's webhook retries no-ops.
    if (!isUniqueViolation(err)) throw err;
    return false;
  }
}

// ---------------------------------------------------------------- existing comments

const CATCH_UP_MEDIA_LIMIT = 10; // "all posts" automations: the latest 10 posts/reels
const CATCH_UP_PAGES_PER_MEDIA = 4; // up to 200 comments per post

/**
 * Queues the comments that were already on the automation's posts before it existed.
 * Only comments still inside Instagram's 7-day private-reply window can get the DM;
 * older matching ones are counted in tooOld. Replies are spaced out, not sent in a burst.
 */
export async function queueExistingComments(account: Account, automationId: string) {
  // found/own/noCommenter/notMatching explain on the dashboard why comments weren't queued.
  const result = { queued: 0, tooOld: 0, skipped: 0, found: 0, own: 0, noCommenter: 0, notMatching: 0, posts: 0 };
  const automations = (await db.automation.findMany({ where: { accountId: account.id, active: true } })).map(parseAutomation);
  const automation = automations.find((a) => a.id === automationId);
  if (!automation) return result;

  const token = await tokenFor(account);
  const mediaIds =
    automation.mediaScope === "SPECIFIC_MEDIA"
      ? automation.mediaIds
      : (await listMedia(token)).data.slice(0, CATCH_UP_MEDIA_LIMIT).map((m) => m.id);
  // Leave at least an hour of the window to actually send.
  const cutoff = Date.now() - PRIVATE_REPLY_WINDOW + HOUR;
  let delay = replyDelayMs(automation);

  result.posts = mediaIds.length;
  // People queued earlier in this same pass, for "once per person".
  const queuedPeople = new Set<string>();
  for (const mediaId of mediaIds) {
    let after: string | undefined;
    for (let page = 0; page < CATCH_UP_PAGES_PER_MEDIA; page++) {
      const res = await listComments(token, mediaId, after);
      const eligible: { run: NewRun; commentedAt: Date }[] = [];
      for (const c of res.data) {
        result.found++;
        if (c.from?.id === account.igUserId || (c.username ?? c.from?.username)?.toLowerCase() === account.username.toLowerCase()) {
          result.own++;
          continue;
        }
        if (!c.from?.id) {
          result.noCommenter++;
          continue;
        }
        if (selectAutomation(automations, mediaId, c.text ?? "")?.id !== automationId) {
          result.notMatching++;
          continue;
        }
        const commentedAt = new Date(c.timestamp);
        if (!(commentedAt.getTime() >= cutoff)) {
          result.tooOld++;
          continue;
        }
        eligible.push({
          run: { commentId: c.id, text: c.text ?? "", mediaId, igsid: c.from.id, username: c.from.username ?? c.username },
          commentedAt,
        });
      }

      // One round of lookups and one insert per page of comments, however many there are.
      if (eligible.length) {
        const [handled, previous] = await Promise.all([
          db.run.findMany({ where: { commentId: { in: eligible.map((e) => e.run.commentId) } }, select: { commentId: true } }),
          automation.oncePerUser
            ? db.run.findMany({
                where: { automationId, igsid: { in: eligible.map((e) => e.run.igsid) }, state: { notIn: RETRYABLE_STATES } },
                select: { igsid: true },
              })
            : [],
        ]);
        const handledComments = new Set(handled.map((r) => r.commentId));
        for (const r of previous) queuedPeople.add(r.igsid);

        const rows = [];
        for (const { run, commentedAt } of eligible) {
          // Already handled, or this person already went through the automation.
          if (handledComments.has(run.commentId) || (automation.oncePerUser && queuedPeople.has(run.igsid))) continue;
          handledComments.add(run.commentId);
          queuedPeople.add(run.igsid);
          rows.push(queuedRun(account.id, automationId, run, delay, commentedAt));
          delay += jitter(4000, 8000);
        }

        let created = rows.length;
        try {
          if (rows.length) await db.run.createMany({ data: rows });
        } catch (err) {
          // A webhook queued one of these comments in the meantime: insert the rest one at a time.
          if (!isUniqueViolation(err)) throw err;
          created = 0;
          for (const row of rows) {
            try {
              await db.run.create({ data: row });
              created++;
            } catch (e) {
              if (!isUniqueViolation(e)) throw e;
            }
          }
        }
        result.queued += created;
        result.skipped += eligible.length - created;
      }
      after = res.paging?.cursors?.after;
      if (!res.paging?.next || !after) break;
    }
  }
  console.log("[autodm] existing comments", JSON.stringify(result));
  return result;
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

    const dmUserId = await sendOpener(token, run, automation);
    await db.run.update({
      where: { id: run.id },
      data: { state: "PRIVATE_REPLIED", privateRepliedAt: new Date(), error: null, ...(dmUserId ? { dmUserId } : {}) },
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

/**
 * The one allowed private reply. Falls back to plain text if Instagram rejects the button.
 * Returns the recipient's ID in DMs as Instagram reports it (see continueRun).
 */
async function sendOpener(token: string, run: Run, automation: ParsedAutomation): Promise<string | undefined> {
  const to: Recipient = { comment_id: run.commentId };
  try {
    const res = await sendMessage(token, to, {
      text: automation.openingMessage,
      quick_replies: [{ content_type: "text", title: automation.openingButton, payload: payload.gate(run.id) }],
    });
    return res.recipient_id;
  } catch (err) {
    if (!(err instanceof GraphError) || err.isAuth || err.isRateLimit || err.isTransient) throw err;
    // Any text reply from the user also continues the flow (see handleMessaging).
    const res = await sendMessage(token, to, { text: `${automation.openingMessage}\n\nReply "${automation.openingButton}" to continue.` });
    return res.recipient_id;
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
  // What kind of event this is, for the log: e.g. "message+quick_reply", "postback", "read".
  const kind =
    [event.message && "message", event.message?.quick_reply && "quick_reply", event.postback && "postback"].filter(Boolean).join("+") ||
    Object.keys(event).filter((k) => !["sender", "recipient", "timestamp"].includes(k)).join("+") ||
    "empty";
  if (event.message?.is_echo) return; // our own outgoing messages, reported back to us
  const igsid = event.sender?.id;
  if (!igsid) return trace(`${kind} ignored: no sender`);
  if (igsid === account.igUserId) return trace(`${kind} ignored: sent by the account itself`);

  const mid = event.message?.mid ?? event.postback?.mid;
  if (!mid) return trace(`${kind} ignored: not a message or button tap`); // reads, reactions, etc.
  if (!(await markProcessed(mid))) return trace(`${kind} ignored: already handled (Meta retry)`);

  const raw = event.message?.quick_reply?.payload ?? event.postback?.payload;
  const tapped = payload.parse(raw);
  trace(`${kind} received: ${tapped ? `button ${tapped.kind}` : raw ? "button with an unknown payload" : "no button payload"}`);
  await withLock(`${account.id}:${igsid}`, () => continueRun(account, igsid, tapped?.runId));
}

async function continueRun(account: Account, igsid: string, runId?: string) {
  // A tap carries its run ID, and that alone identifies the run: the button only ever exists in
  // the private DM to that commenter, and the event is signed by Meta. The sender's ID is not
  // compared, because Instagram can report a different ID for the same person in DMs than it
  // did on their comment; requiring them to match would silently drop every tap.
  // Any other message from someone mid-flow counts as a tap too, so the flow still works if
  // their client didn't show the button.
  const run = runId
    ? await db.run.findFirst({ where: { id: runId, accountId: account.id } })
    : await db.run.findFirst({
        where: { accountId: account.id, OR: [{ igsid }, { dmUserId: igsid }], state: { in: ["PRIVATE_REPLIED", "AWAITING_FOLLOW"] } },
        orderBy: { createdAt: "desc" },
      });
  if (!run) return trace(runId ? "tap ignored: its run no longer exists" : "message ignored: this person has no run waiting for a tap");
  if (!["PRIVATE_REPLIED", "AWAITING_FOLLOW", "DELIVERED"].includes(run.state)) return trace(`tap ignored: run is ${run.state}`);
  if (run.lastUserMessageAt && Date.now() - run.lastUserMessageAt.getTime() < DEBOUNCE_MS) return trace("tap ignored: double tap");
  if (run.igsid !== igsid && run.dmUserId !== igsid) trace("tap matched by run ID; the sender's DM ID differs from the comment's");

  // Compare-and-set claim: on serverless hosts two taps can land on different
  // instances, where the in-process lock doesn't reach. Only one claim wins.
  const claimed = await db.run.updateMany({
    where: { id: run.id, lastUserMessageAt: run.lastUserMessageAt },
    // The sender's ID is kept so a typed reply (no button, no run ID) finds this run too.
    data: { lastUserMessageAt: new Date(), ...(run.igsid !== igsid ? { dmUserId: igsid } : {}) },
  });
  if (claimed.count === 0) return trace("tap ignored: another request is already handling it");

  const row = await db.automation.findUnique({ where: { id: run.automationId } });
  if (!row) return trace("tap ignored: its automation was deleted");
  trace(`tap accepted: run is ${run.state}, follow gate ${row.askToFollow ? "on" : "off"}`);
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
    trace(checkError ? `follow check failed (treated as not following): ${forLog(checkError)}` : `follow check: ${follows ? "follows" : "does not follow"}`);
    if (follows) {
      // They were asked to follow at least once and now do: a follower won by this automation.
      if (run.followAttempts > 0 && !run.followGainedAt) {
        await db.run.update({ where: { id: run.id }, data: { followGainedAt: new Date() } });
      }
      return await deliverLink(token, to, run, automation);
    }

    if (run.followAttempts >= automation.followMaxAttempts) {
      if (automation.followOnFail === "SEND_ANYWAY") return await deliverLink(token, to, run, automation);
      await db.run.update({ where: { id: run.id }, data: { state: "ABANDONED", error: checkError } });
      return trace("follow attempts used up: nothing more is sent");
    }

    await sendCard(token, to, automation.followMessage, `Follow @${account.username} to continue`, [
      { type: "web_url", title: automation.followVisitLabel, url: `https://www.instagram.com/${account.username}/` },
      { type: "postback", title: automation.followConfirmLabel, payload: payload.recheck(run.id) },
    ]);
    await db.run.update({
      where: { id: run.id },
      data: { state: "AWAITING_FOLLOW", followAttempts: { increment: 1 }, error: checkError },
    });
    trace("follow request sent");
  } catch (err) {
    // Also in the log, not only on the run: a reply that fails after a tap must be findable.
    console.error(`[autodm] reply after tap failed: ${forLog(errorText(err))}`);
    if (err instanceof GraphError && err.isAuth) await markReconnect(account.id);
    const hint = err instanceof GraphError && err.isRateLimit ? "Instagram rate limit; the user can tap again later" : errorText(err);
    await db.run.update({ where: { id: run.id }, data: { error: hint } });
  }
}

async function deliverLink(token: string, to: Recipient, run: Run, automation: ParsedAutomation) {
  if (automation.linkUrl) {
    await sendCard(token, to, automation.linkMessage, "👇 Tap below", [
      // Goes through /r/<run id>, which counts the tap and redirects to the real link.
      { type: "web_url", title: automation.linkButtonLabel || "Open link", url: `${env.appUrl}/r/${run.id}` },
    ]);
  } else {
    // No link: the final DM is just the message.
    await sendMessage(token, to, { text: automation.linkMessage });
  }
  await db.run.update({ where: { id: run.id }, data: { state: "DELIVERED", error: null } });
  trace("final DM sent");
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
