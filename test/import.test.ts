import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, planImport, readRows, shortcodeOf, type ImportOptions } from "../src/lib/import.ts";
import { defaults } from "../src/lib/automation-schema.ts";

const HEADER = "Auto Dm Name,Automation Type,Status,Run Count,Click Impressions,Created At,Content Link,Instagram Username";
const options: ImportOptions = {
  triggerType: "ANY_COMMENT",
  keywords: [],
  publicReplyEnabled: true,
  publicReplies: defaults.publicReplies,
  openingMessage: defaults.openingMessage,
  openingButton: defaults.openingButton,
};
const reel = (code: string, id: string, caption?: string) => ({ id, permalink: `https://www.instagram.com/reel/${code}/`, caption });

test("csv: quoted fields keep commas, line breaks and doubled quotes", () => {
  const rows = parseCsv('﻿a,b\r\n"one, two","line 1\nline 2 ""quoted"""\n\nlast,\n');
  assert.deepEqual(rows, [["a", "b"], ["one, two", 'line 1\nline 2 "quoted"'], ["last", ""]]);
});

test("shortcode is read from reel, post and tv links", () => {
  assert.equal(shortcodeOf("https://www.instagram.com/reel/DfzrkwySZFG/"), "DfzrkwySZFG");
  assert.equal(shortcodeOf("https://instagram.com/p/Ab-c_1/?igsh=x"), "Ab-c_1");
  assert.equal(shortcodeOf("https://example.com/reel/x"), null);
});

test("a file without the expected columns is rejected with a readable message", () => {
  assert.throws(() => readRows("name,link\nx,y"), /SuperProfile AutoDM export/);
  assert.throws(() => readRows(""), /empty/);
});

test("each row becomes an automation for its reel, with the row's text as the final DM", () => {
  const csv = [
    HEADER,
    '"Here you go 👇 github.com/a/b\nSay ""install this"".",REEL,Active,8,0,2026-11-16T15:31:52.172Z,https://www.instagram.com/reel/AAA/,MyBiz',
    "Paused one example.com/x,REEL,Paused,1,0,2026-11-10T00:00:00.000Z,https://www.instagram.com/reel/BBB/,mybiz",
  ].join("\n");
  const plan = planImport(readRows(csv), [reel("AAA", "111", "My reel caption\nmore"), reel("BBB", "222")], new Set(), "mybiz", options);

  assert.deepEqual(plan.map((p) => p.status), ["ready", "ready"]);
  const first = plan[0].input!;
  assert.equal(first.linkMessage, 'Here you go 👇 github.com/a/b\nSay "install this".');
  assert.equal(first.linkUrl, "", "sent as text, no link button");
  assert.deepEqual(first.mediaIds, ["111"]);
  assert.equal(first.mediaScope, "SPECIFIC_MEDIA");
  assert.equal(first.triggerType, "ANY_COMMENT");
  assert.equal(first.askToFollow, false);
  assert.equal(first.active, true);
  assert.equal(plan[0].name, "My reel caption", "named after the reel's caption");
  assert.equal(plan[0].createdAt?.toISOString(), "2026-11-16T15:31:52.172Z");
  assert.equal(plan[1].input!.active, false, "status other than Active imports paused");
  assert.equal(plan[1].name, "Paused one example.com/x", "falls back to the message when the reel has no caption");
});

test("rows that can't or shouldn't be imported are skipped with a reason", () => {
  const long = "x".repeat(1001);
  const csv = [
    HEADER,
    "ok example.com/a,REEL,Active,0,0,,https://www.instagram.com/reel/AAA/,mybiz",
    "already there example.com/a,REEL,Active,0,0,,https://www.instagram.com/reel/BBB/,mybiz",
    "same reel twice example.com/a,REEL,Active,0,0,,https://www.instagram.com/reel/AAA/,mybiz",
    "deleted reel example.com/a,REEL,Active,0,0,,https://www.instagram.com/reel/GONE/,mybiz",
    "someone else example.com/a,REEL,Active,0,0,,https://www.instagram.com/reel/AAA/,otherbiz",
    "bad link example.com/a,REEL,Active,0,0,,https://example.com/nope,mybiz",
    `${long},REEL,Active,0,0,,https://www.instagram.com/reel/CCC/,mybiz`,
    "no link here,REEL,Active,0,0,,https://www.instagram.com/reel/DDD/,mybiz",
  ].join("\n");
  const media = [reel("AAA", "111"), reel("BBB", "222"), reel("CCC", "333"), reel("DDD", "444")];
  const plan = planImport(readRows(csv), media, new Set(["222"]), "MyBiz", options);

  assert.deepEqual(plan.map((p) => p.status), ["ready", "exists", "exists", "not_found", "other_account", "invalid", "invalid", "ready"]);
  assert.match(plan[6].note!, /linkMessage/, "too long for one Instagram DM");
  assert.match(plan[7].note!, /no link/);
  assert.equal(plan.filter((p) => p.input).length, 2, "only ready rows carry an automation");
});
