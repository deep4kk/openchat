// One-time local setup: creates .env with generated secrets and the SQLite database.
// Safe to run again; it never overwrites values you've already filled in.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  console.error(`Node.js 20.9 or newer is required (you have ${process.versions.node}).`);
  process.exit(1);
}

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example");
}

const generated = {
  SESSION_SECRET: () => randomBytes(32).toString("hex"),
  TOKEN_ENCRYPTION_KEY: () => randomBytes(32).toString("hex"),
  WEBHOOK_VERIFY_TOKEN: () => randomBytes(16).toString("hex"),
  APP_URL: () => "http://localhost:3000",
};

let env = readFileSync(".env", "utf8");
for (const [key, make] of Object.entries(generated)) {
  const line = new RegExp(`^${key}=(.*)$`, "m");
  const current = env.match(line)?.[1]?.trim();
  if (current && !current.includes("your-tunnel")) continue;
  const value = make();
  env = line.test(env) ? env.replace(line, `${key}=${value}`) : `${env.trimEnd()}\n${key}=${value}\n`;
  console.log(`Set ${key}`);
}
writeFileSync(".env", env);

console.log("Creating the local database...");
execSync("node scripts/prisma.mjs db push", {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
});

const missing = ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "ALLOWED_IG_USERNAMES"].filter(
  (k) => !env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim(),
);
console.log("\nSetup done.");
if (missing.length) {
  console.log(`\nStill needed in .env: ${missing.join(", ")}`);
  console.log("Follow docs/SETUP.md to get them from Meta, then run: npm run dev");
} else {
  console.log("Run: npm run dev");
}
