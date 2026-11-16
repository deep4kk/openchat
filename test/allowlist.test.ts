import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedUsernames, isAllowedUsername, missingWebEnv } from "../src/lib/env.ts";

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
