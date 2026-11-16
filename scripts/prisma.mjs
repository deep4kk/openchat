// Runs a Prisma command against the schema that matches DATABASE_URL:
// SQLite (file:...) for local use, PostgreSQL (postgres://...) for hosting.
// Usage: node scripts/prisma.mjs generate | db push
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// Prisma reads .env itself, but we need DATABASE_URL here to pick the schema.
let url = process.env.DATABASE_URL;
if (!url) {
  // Vercel's Supabase integration: the direct connection for schema changes (db push), the pooled one otherwise.
  const { POSTGRES_URL_NON_POOLING: direct, POSTGRES_PRISMA_URL: pooled } = process.env;
  url = (process.argv.includes("push") ? direct || pooled : pooled) || undefined;
  if (url) process.env.DATABASE_URL = url;
}
if (!url && existsSync(".env")) {
  url = readFileSync(".env", "utf8").match(/^DATABASE_URL=["']?([^"'\n]*)/m)?.[1];
}

const schema = /^postgres(ql)?:\/\//.test(url ?? "") ? "prisma/postgres/schema.prisma" : "prisma/schema.prisma";
const args = process.argv.slice(2).join(" ");

execSync(`npx prisma ${args} --schema ${schema}`, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
});
