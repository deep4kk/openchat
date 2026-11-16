import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Local (SQLite) and hosted (PostgreSQL) schemas must describe the same tables.
function models(path: string) {
  const text = readFileSync(path, "utf8");
  return text.slice(text.indexOf("generator client")).replace(/provider = "(sqlite|postgresql)"/, "");
}

test("sqlite and postgres schemas match", () => {
  assert.equal(models("prisma/postgres/schema.prisma"), models("prisma/schema.prisma"));
});
