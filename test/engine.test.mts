/**
 * End-to-end test of the automation engine against a real (temporary) SQLite DB,
 * with the Instagram API mocked. No Instagram account or network needed.
 */
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "autodm-test-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
process.env.TOKEN_ENCRYPTION_KEY = "test-key";
process.env.MIN_SEND_GAP_MS = "1";
process.env.APP_URL = "https://autodm.test";
process.env.ALLOWED_IG_USERNAMES = "@MyBiz, other";
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

// ---- Instagram API mock ----
type Sent = { kind: "public_reply" | "dm"; to?: unknown; text?: string; buttons?: string[]; urls?: (string | undefined)[]; quickReply?: string };
let sent: Sent[] = [];
let follows = false;
/** Comments returned by the mocked GET /{media}/comments. */
let existing: { id: string; text: string; timestamp: string; from?: { id: string; username?: string } }[] = [];
/** Make the next N calls to a URL fragment fail with this Graph error. */
let failures: { match: string; times: number; status: number; code: number }[] = [];

globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
  const url = String(input);
  const fail = failures.find((f) => url.includes(f.match) && f.times > 0);
  if (fail) {
    fail.times--;
    return new Response(JSON.stringify({ error: { message: `mock error ${fail.code}`, code: fail.code } }), { status: fail.status });
  }
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  if (url.includes("/replies")) sent.push({ kind: "public_reply", text: body.message });
  else if (url.endsWith("/me/messages")) {
    const m = body.message;
    sent.push({
      kind: "dm",
      to: body.recipient,
      text: m.text ?? m.attachment?.payload?.elements?.[0]?.title,
      buttons: m.attachment?.payload?.elements?.[0]?.buttons?.map((b: { title: string }) => b.title),
      urls: m.attachment?.payload?.elements?.[0]?.buttons?.map((b: { url?: string }) => b.url),
      quickReply: m.quick_replies?.[0]?.payload,
    });
  } else if (url.includes("/comments?")) {
    return new Response(JSON.stringify({ data: existing }));
  } else if (url.includes("is_user_follow_business")) {
    return new Response(JSON.stringify({ username: "fan", is_user_follow_business: follows }));
  } else throw new Error(`Unexpected request ${url}`);
  return new Response(JSON.stringify({ id: "ok", message_id: "mid" }));
}) as typeof fetch;

const { db } = await import("../src/lib/db.ts");
const { encrypt } = await import("../src/lib/crypto.ts");
const { handleWebhook, processQueue, queueExistingComments } = await import("../src/lib/engine.ts");
const { toRow, defaults } = await import("../src/lib/automation-schema.ts");

let accountId = "";
let automationId = "";

async function makeAutomation(over: Partial<typeof defaults> = {}) {
  const a = await db.automation.create({
    data: { ...toRow({ ...defaults, mediaIds: ["REEL1"], linkUrl: "https://my.link", ...over }), accountId },
  });
  automationId = a.id;
  return a;
}

const comment = (id: string, text: string, opts: { media?: string; from?: string } = {}) =>
  handleWebhook({
    object: "instagram",
    entry: [{ id: "BIZ", time: 0, changes: [{ field: "comments", value: { id, text, from: { id: opts.from ?? "FAN", username: "fan" }, media: { id: opts.media ?? "REEL1" } } }] }],
  });

const tap = (mid: string, p: string, from = "FAN", asPostback = false) =>
  handleWebhook({
    object: "instagram",
    entry: [{
      id: "BIZ",
      time: 0,
      messaging: [{
        sender: { id: from },
        recipient: { id: "BIZ" },
        timestamp: 0,
        ...(asPostback ? { postback: { mid, payload: p } } : { message: { mid, text: "tap", quick_reply: { payload: p } } }),
      }],
    }],
  });

/** Runs the queue as if the jitter delay had passed. */
async function drain() {
  await db.run.updateMany({ where: { state: "QUEUED" }, data: { nextAttemptAt: new Date(0) } });
  await processQueue();
}

/** Skips the double-tap debounce window. */
const age = (runId: string) =>
  db.$executeRaw`UPDATE "Run" SET "updatedAt" = 0, "lastUserMessageAt" = 0 WHERE "id" = ${runId}`;
const run = (commentId: string) => db.run.findUniqueOrThrow({ where: { commentId } });
const take = () => sent.splice(0);

before(async () => {
  const account = await db.account.create({
    data: { igUserId: "BIZ", username: "mybiz", accessToken: encrypt("tok", "test-key"), tokenExpiresAt: new Date(Date.now() + 50 * 864e5) },
  });
  accountId = account.id;
});

beforeEach(async () => {
  await db.run.deleteMany();
  await db.automation.deleteMany();
  await db.processedEvent.deleteMany();
  await db.account.update({ where: { id: accountId }, data: { status: "ACTIVE" } });
  sent = [];
  follows = false;
  failures = [];
  existing = [];
  delete process.env.MAX_DMS_PER_HOUR;
});

after(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("triggers", () => {
  test("ignores non-matching comments, other reels and our own comments", async () => {
    await makeAutomation();
    await comment("C1", "nice reel");
    await comment("C2", "LINK", { media: "OTHER" });
    await comment("C3", "link", { from: "BIZ" });
    await drain();
    assert.equal(await db.run.count(), 0);
    assert.deepEqual(take(), []);
  });

  test("matching comment waits in the queue, then gets public reply + opener with button", async () => {
    await makeAutomation();
    await comment("C1", "Link please!");
    assert.equal((await run("C1")).state, "QUEUED");
    await processQueue(); // jitter delay not passed yet
    assert.deepEqual(take(), []);

    await drain();
    const r = await run("C1");
    assert.equal(r.state, "PRIVATE_REPLIED");
    const out = take();
    assert.equal(out[0].kind, "public_reply");
    assert.deepEqual(out[1].to, { comment_id: "C1" });
    assert.equal(out[1].quickReply, `GATE:${r.id}`);
  });

  test("accounts not in ALLOWED_IG_USERNAMES are ignored", async () => {
    const stranger = await db.account.create({
      data: { igUserId: "STRANGER", username: "stranger", accessToken: encrypt("tok", "test-key"), tokenExpiresAt: new Date(Date.now() + 50 * 864e5) },
    });
    await db.automation.create({
      data: { ...toRow({ ...defaults, mediaIds: ["REEL9"], linkUrl: "https://x.link" }), accountId: stranger.id },
    });
    await handleWebhook({
      object: "instagram",
      entry: [{ id: "STRANGER", time: 0, changes: [{ field: "comments", value: { id: "S1", text: "link", from: { id: "FAN" }, media: { id: "REEL9" } } }] }],
    });
    await drain();
    assert.equal(await db.run.count(), 0);
    assert.deepEqual(take(), []);
    await db.account.delete({ where: { id: stranger.id } });
  });

  test("webhook retries and repeat commenters are not messaged twice", async () => {
    await makeAutomation();
    await comment("C1", "link");
    await comment("C1", "link");
    await comment("C2", "link again");
    await drain();
    assert.equal(await db.run.count(), 1);
    assert.equal(take().filter((s) => s.kind === "dm").length, 1);
  });
});

describe("follow gate", () => {
  test("not following -> prompt; double tap ignored; following -> link", async () => {
    await makeAutomation({ askToFollow: true });
    await comment("C1", "link");
    await drain();
    const { id } = await run("C1");
    take();

    await tap("M1", `GATE:${id}`);
    assert.equal((await run("C1")).state, "AWAITING_FOLLOW");
    assert.deepEqual(take().at(-1)?.buttons, ["Visit profile", "I'm following ✅"]);

    await tap("M1", `GATE:${id}`); // same webhook delivered again
    await tap("M2", `RECHECK:${id}`, "FAN", true); // second tap within debounce window
    assert.deepEqual(take(), []);

    follows = true;
    await age(id);
    await tap("M3", `RECHECK:${id}`, "FAN", true);
    const done = await run("C1");
    assert.equal(done.state, "DELIVERED");
    assert.ok(done.followGainedAt, "counts as a follower won by the automation");
    const last = take().at(-1);
    assert.deepEqual(last?.buttons, ["Open link"]);
    // The link button goes through the click tracker.
    assert.deepEqual(last?.urls, [`https://autodm.test/r/${id}`]);
  });

  test("someone already following is not counted as a new follower", async () => {
    await makeAutomation({ askToFollow: true });
    follows = true;
    await comment("C1", "link");
    await drain();
    const { id } = await run("C1");
    await tap("M1", `GATE:${id}`);
    const done = await run("C1");
    assert.equal(done.state, "DELIVERED");
    assert.equal(done.followGainedAt, null);
  });

  test("STOP policy gives up after max attempts", async () => {
    await makeAutomation({ askToFollow: true, followMaxAttempts: 2, followOnFail: "STOP" });
    await comment("C1", "link");
    await drain();
    const { id } = await run("C1");
    for (const mid of ["A", "B", "C"]) {
      await age(id);
      await tap(mid, `RECHECK:${id}`, "FAN", true);
    }
    const r = await run("C1");
    assert.equal(r.state, "ABANDONED");
    assert.equal(r.followAttempts, 2);
  });

  test("SEND_ANYWAY policy delivers after max attempts", async () => {
    await makeAutomation({ askToFollow: true, followMaxAttempts: 1, followOnFail: "SEND_ANYWAY" });
    await comment("C1", "link");
    await drain();
    const { id } = await run("C1");
    await tap("A", `GATE:${id}`);
    await age(id);
    await tap("B", `RECHECK:${id}`, "FAN", true);
    assert.equal((await run("C1")).state, "DELIVERED");
    assert.equal((await run("C1")).followGainedAt, null, "sent anyway, never followed");
  });

  test("a typed reply works like the button", async () => {
    await makeAutomation();
    await comment("C1", "link");
    await drain();
    await handleWebhook({
      object: "instagram",
      entry: [{ id: "BIZ", time: 0, messaging: [{ sender: { id: "FAN" }, recipient: { id: "BIZ" }, timestamp: 0, message: { mid: "T1", text: "yes pls" } }] }],
    });
    assert.equal((await run("C1")).state, "DELIVERED");
  });

  test("without a link the final DM is plain text, no button", async () => {
    await makeAutomation({ linkUrl: "", linkMessage: "Here's the prompt: paste it into Claude" });
    await comment("C1", "link");
    await drain();
    const { id } = await run("C1");
    take();
    await tap("A", `GATE:${id}`);
    const dms = take().filter((s) => s.kind === "dm");
    assert.equal(dms.length, 1);
    assert.equal(dms[0].text, "Here's the prompt: paste it into Claude");
    assert.equal(dms[0].buttons, undefined);
    assert.equal((await run("C1")).state, "DELIVERED");
  });
});

describe("reply delay", () => {
  test("waits the automation's delay (plus a few seconds) before replying", async () => {
    await makeAutomation({ replyDelaySeconds: 60 });
    const before = Date.now();
    await comment("C1", "link");
    const wait = (await run("C1")).nextAttemptAt.getTime() - before;
    assert.ok(wait >= 60_000 && wait <= 74_000, `waited ${wait} ms`);
    await processQueue(); // not due yet
    assert.deepEqual(take(), []);
  });

  test("the 4-minute maximum stays inside the Vercel sending window", async () => {
    await makeAutomation({ replyDelaySeconds: 240 });
    const before = Date.now();
    await comment("C1", "link");
    const wait = (await run("C1")).nextAttemptAt.getTime() - before;
    assert.ok(wait >= 240_000 && wait <= 251_000, `waited ${wait} ms`);
  });
});

describe("taps when Instagram uses a different ID in DMs than on the comment", () => {
  test("the button tap still continues the run, and so does a typed reply afterwards", async () => {
    await makeAutomation({ askToFollow: true });
    await comment("C1", "link", { from: "COMMENT_ID_OF_FAN" });
    await drain();
    const r = await run("C1");
    take();

    // The tap arrives from the same person under their DM ID.
    await tap("m1", `GATE:${r.id}`, "DM_ID_OF_FAN");
    let after = await run("C1");
    assert.equal(after.state, "AWAITING_FOLLOW", "not following yet, so they are asked to follow");
    assert.ok(after.lastUserMessageAt, "the tap is counted");
    assert.equal(after.dmUserId, "DM_ID_OF_FAN");
    const ask = take();
    assert.deepEqual(ask.at(-1)?.to, { id: "DM_ID_OF_FAN" }, "the reply goes to the ID the tap came from");

    // They follow, then type something instead of tapping the button: no run ID in that message.
    follows = true;
    await age(r.id);
    await handleWebhook({
      object: "instagram",
      entry: [{ id: "BIZ", time: 0, messaging: [{ sender: { id: "DM_ID_OF_FAN" }, recipient: { id: "BIZ" }, timestamp: 0, message: { mid: "m2", text: "done" } }] }],
    });
    after = await run("C1");
    assert.equal(after.state, "DELIVERED");
    assert.ok(after.followGainedAt, "counted as a follower gained");
  });

  test("a tap for a run of another account is ignored", async () => {
    await makeAutomation();
    await comment("C1", "link");
    await drain();
    const r = await run("C1");
    take();
    const other = await db.account.create({
      data: { igUserId: "BIZ2", username: "other", accessToken: encrypt("tok", "test-key"), tokenExpiresAt: new Date(Date.now() + 50 * 864e5) },
    });
    await handleWebhook({
      object: "instagram",
      entry: [{ id: "BIZ2", time: 0, messaging: [{ sender: { id: "FAN" }, recipient: { id: "BIZ2" }, timestamp: 0, message: { mid: "m9", text: "tap", quick_reply: { payload: `GATE:${r.id}` } } }] }],
    });
    await db.account.delete({ where: { id: other.id } });
    assert.equal((await run("C1")).state, "PRIVATE_REPLIED");
    assert.deepEqual(take(), []);
  });
});

describe("existing comments", () => {
  test("queues recent matching comments once; skips old, own, non-matching and repeat people", async () => {
    await makeAutomation();
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    existing = [
      { id: "E1", text: "LINK pls", timestamp: ago(2 * 3600e3), from: { id: "F1", username: "a" } },
      { id: "E2", text: "link", timestamp: ago(8 * 864e5), from: { id: "F2" } },
      { id: "E3", text: "nice reel", timestamp: ago(3600e3), from: { id: "F3" } },
      { id: "E4", text: "link", timestamp: ago(3600e3), from: { id: "BIZ" } },
      { id: "E5", text: "link again", timestamp: ago(1800e3), from: { id: "F1" } },
    ];
    const account = await db.account.findUniqueOrThrow({ where: { id: accountId } });
    assert.deepEqual(await queueExistingComments(account, automationId), {
      queued: 1, tooOld: 1, skipped: 1, found: 5, own: 1, noCommenter: 0, notMatching: 1, posts: 1,
    });
    // Running it again never messages anyone twice.
    assert.deepEqual(await queueExistingComments(account, automationId), {
      queued: 0, tooOld: 1, skipped: 2, found: 5, own: 1, noCommenter: 0, notMatching: 1, posts: 1,
    });
    await drain();
    const dms = take().filter((s) => s.kind === "dm");
    assert.equal(dms.length, 1);
    assert.deepEqual(dms[0].to, { comment_id: "E1" });
  });

  test("queues a whole page of comments in one go, spaced out, without doubling up on a comment a webhook already queued", async () => {
    await makeAutomation({ oncePerUser: false });
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    await comment("E2", "link", { from: "F2" }); // arrived by webhook before the catch-up ran
    existing = [
      { id: "E1", text: "link", timestamp: ago(3600e3), from: { id: "F1" } },
      { id: "E2", text: "link", timestamp: ago(3000e3), from: { id: "F2" } },
      { id: "E3", text: "link", timestamp: ago(2400e3), from: { id: "F3" } },
      { id: "E4", text: "link too", timestamp: ago(1800e3), from: { id: "F1" } },
    ];
    const account = await db.account.findUniqueOrThrow({ where: { id: accountId } });
    const result = await queueExistingComments(account, automationId);
    assert.equal(result.queued, 3, "E1, E3 and E4 (same person again is fine when once-per-person is off)");
    assert.equal(result.skipped, 1, "E2 was already queued");
    assert.equal(await db.run.count(), 4);

    const queued = await db.run.findMany({ where: { commentId: { in: ["E1", "E3", "E4"] } }, orderBy: { nextAttemptAt: "asc" } });
    assert.deepEqual(queued.map((r) => r.commentId), ["E1", "E3", "E4"]);
    for (let i = 1; i < queued.length; i++) {
      const gap = queued[i].nextAttemptAt.getTime() - queued[i - 1].nextAttemptAt.getTime();
      assert.ok(gap >= 4000, `replies are at least 4 s apart (got ${gap} ms)`);
    }
    // Backdated to the comment, so the 7-day reply window counts from when it was posted.
    assert.ok(Date.now() - queued[0].createdAt.getTime() > 3500e3);
  });
});

describe("account safety", () => {
  test("Instagram rate limit backs off instead of failing", async () => {
    await makeAutomation();
    await comment("C1", "link");
    failures = [{ match: "/me/messages", times: 1, status: 400, code: 4 }];
    await drain();
    const r = await run("C1");
    assert.equal(r.state, "QUEUED");
    assert.ok(r.nextAttemptAt.getTime() > Date.now() + 10 * 60_000, "should wait at least 10 minutes");

    await drain();
    assert.equal((await run("C1")).state, "PRIVATE_REPLIED");
    assert.equal(take().filter((s) => s.kind === "public_reply").length, 1, "public reply is not repeated on retry");
  });

  test("revoked token pauses the account and keeps the comment queued", async () => {
    await makeAutomation();
    await comment("C1", "link");
    failures = [{ match: "/replies", times: 1, status: 400, code: 190 }];
    await drain();
    assert.equal((await db.account.findUniqueOrThrow({ where: { id: accountId } })).status, "RECONNECT");
    assert.equal((await run("C1")).state, "QUEUED");

    await drain(); // still paused: nothing is sent
    assert.equal(take().filter((s) => s.kind === "dm").length, 0);
  });

  test("hourly DM cap holds extra comments in the queue", async () => {
    process.env.MAX_DMS_PER_HOUR = "1";
    await makeAutomation({ oncePerUser: false });
    await comment("C1", "link", { from: "A" });
    await comment("C2", "link", { from: "B" });
    await drain();
    const states = (await db.run.findMany({ orderBy: { commentId: "asc" } })).map((r) => r.state);
    assert.deepEqual(states.sort(), ["PRIVATE_REPLIED", "QUEUED"]);
  });

  test("comments older than Instagram's 7-day window expire unsent", async () => {
    await makeAutomation();
    await comment("C1", "link");
    await db.$executeRaw`UPDATE "Run" SET "createdAt" = ${Date.now() - 7 * 864e5} WHERE "commentId" = 'C1'`;
    await drain();
    assert.equal((await run("C1")).state, "EXPIRED");
    assert.deepEqual(take(), []);
  });

  test("paused automation does not send queued comments", async () => {
    await makeAutomation();
    await comment("C1", "link");
    await db.automation.update({ where: { id: automationId }, data: { active: false } });
    await drain();
    assert.equal((await run("C1")).state, "ABANDONED");
    assert.deepEqual(take(), []);
  });

  test("falls back to plain text if Instagram rejects the opener button", async () => {
    await makeAutomation();
    await comment("C1", "link");
    failures = [{ match: "/me/messages", times: 1, status: 400, code: 100 }];
    await drain();
    assert.equal((await run("C1")).state, "PRIVATE_REPLIED");
    const dm = take().find((s) => s.kind === "dm");
    assert.match(dm?.text ?? "", /Reply "Send me the link" to continue/);
  });

  test("permanent errors are recorded, not retried forever", async () => {
    await makeAutomation({ publicReplyEnabled: false });
    await comment("C1", "link");
    failures = [{ match: "/me/messages", times: 2, status: 400, code: 10 }];
    await drain();
    const r = await run("C1");
    assert.equal(r.state, "FAILED");
    assert.match(r.error ?? "", /mock error 10/);
  });
});
