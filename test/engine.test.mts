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
process.env.ALLOWED_IG_USERNAMES = "@MyBiz, other";
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

// ---- Instagram API mock ----
type Sent = { kind: "public_reply" | "dm"; to?: unknown; text?: string; buttons?: string[]; quickReply?: string };
let sent: Sent[] = [];
let follows = false;
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
      quickReply: m.quick_replies?.[0]?.payload,
    });
  } else if (url.includes("is_user_follow_business")) {
    return new Response(JSON.stringify({ username: "fan", is_user_follow_business: follows }));
  } else throw new Error(`Unexpected request ${url}`);
  return new Response(JSON.stringify({ id: "ok", message_id: "mid" }));
}) as typeof fetch;

const { db } = await import("../src/lib/db.ts");
const { encrypt } = await import("../src/lib/crypto.ts");
const { handleWebhook, processQueue } = await import("../src/lib/engine.ts");
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
    assert.equal((await run("C1")).state, "DELIVERED");
    assert.deepEqual(take().at(-1)?.buttons, ["Open link"]);
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
