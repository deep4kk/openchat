import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedUsernames, isAllowedUsername, missingEnv, missingWebEnv } from "../src/lib/env.ts";

test("allowlist ignores @, spaces and case", () => {
  process.env.ALLOWED_IG_USERNAMES = " @MyBrand , me,, ";
  assert.deepEqual(allowedUsernames(), ["mybrand", "me"]);
  assert.equal(isAllowedUsername("mybrand"), true);
  assert.equal(isAllowedUsername("MyBrand"), true);
  assert.equal(isAllowedUsername("someone_else"), false);
  assert.equal(missingWebEnv().includes("ALLOWED_IG_USERNAMES"), false);
});

test("an empty allowlist lets nobody in and shows up as a missing setting", () => {
  process.env.ALLOWED_IG_USERNAMES = "";
  assert.equal(isAllowedUsername("me"), false);
  assert.equal(missingWebEnv().includes("ALLOWED_IG_USERNAMES"), true);
  delete process.env.ALLOWED_IG_USERNAMES;
  assert.equal(isAllowedUsername("me"), false);
});

test("short secrets count as missing settings", () => {
  const saved = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "too-short";
  assert.equal(missingEnv().includes("SESSION_SECRET"), true);
  process.env.SESSION_SECRET = "x".repeat(32);
  assert.equal(missingEnv().includes("SESSION_SECRET"), false);
  if (saved === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = saved;
});
