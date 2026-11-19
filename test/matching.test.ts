import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesKeyword, payload, selectAutomation, type MatchableAutomation } from "../src/lib/matching.ts";

test("keyword matching is case-insensitive and word-bounded", () => {
  assert.equal(matchesKeyword("LINK please", ["link"]), true);
  assert.equal(matchesKeyword("send the link!", ["link"]), true);
  assert.equal(matchesKeyword("unlinked", ["link"]), false);
  assert.equal(matchesKeyword("I want the free guide", ["free guide"]), true);
  assert.equal(matchesKeyword("🔥🔥", ["🔥"]), true);
  assert.equal(matchesKeyword("hello", ["", "  "]), false);
});

const base: MatchableAutomation = {
  id: "x",
  active: true,
  mediaScope: "ALL_MEDIA",
  mediaIds: [],
  triggerType: "KEYWORDS",
  keywords: ["link"],
  createdAt: new Date("2026-01-01"),
};

test("specific media beats all-media, inactive and non-matching are skipped", () => {
  const all = { ...base, id: "all" };
  const specific = { ...base, id: "specific", mediaScope: "SPECIFIC_MEDIA", mediaIds: ["m1"] };
  const inactive = { ...base, id: "inactive", mediaScope: "SPECIFIC_MEDIA", mediaIds: ["m1"], active: false };
  assert.equal(selectAutomation([all, specific, inactive], "m1", "link")?.id, "specific");
  assert.equal(selectAutomation([all, specific], "m2", "link")?.id, "all");
  assert.equal(selectAutomation([all, specific], "m1", "nothing"), null);
});

test("any-comment trigger ignores keywords; newest wins among equals", () => {
  const older = { ...base, id: "older", triggerType: "ANY_COMMENT", keywords: [] };
  const newer = { ...older, id: "newer", createdAt: new Date("2026-06-01") };
  assert.equal(selectAutomation([older, newer], "m9", "nice reel")?.id, "newer");
});

test("payload round-trips", () => {
  assert.deepEqual(payload.parse(payload.gate("abc")), { kind: "GATE", runId: "abc" });
  assert.deepEqual(payload.parse(payload.recheck("abc")), { kind: "RECHECK", runId: "abc" });
  assert.equal(payload.parse("hello"), null);
  assert.deepEqual(payload.parse(payload.gate("abc", "0f1e")), { kind: "GATE", runId: "abc", sig: "0f1e" });
});
