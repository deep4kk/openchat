const REQUIRED = [
  "APP_URL",
  "DATABASE_URL",
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "WEBHOOK_VERIFY_TOKEN",
  "SESSION_SECRET",
  "TOKEN_ENCRYPTION_KEY",
] as const;

function required(name: (typeof REQUIRED)[number]): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See docs/SETUP.md`);
  return value;
}

function int(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Names of required settings that are empty, so the UI can show a setup checklist. */
export function missingEnv(): string[] {
  return REQUIRED.filter((name) => !process.env[name]);
}

/** Same as missingEnv, plus the settings only the website needs (not the Render worker). */
export function missingWebEnv(): string[] {
  return [...missingEnv(), ...(allowedUsernames().length ? [] : ["ALLOWED_IG_USERNAMES"])];
}

/**
 * Instagram usernames allowed to use this copy (ALLOWED_IG_USERNAMES, comma-separated).
 * Each copy is meant for its owner only; anyone else runs their own. Empty means nobody.
 */
export function allowedUsernames(): string[] {
  return (process.env.ALLOWED_IG_USERNAMES ?? "")
    .split(",")
    .map((u) => u.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

export function isAllowedUsername(username: string): boolean {
  return allowedUsernames().includes(username.toLowerCase());
}

export const env = {
  get appUrl() {
    return required("APP_URL").replace(/\/$/, "");
  },
  get igAppId() {
    return required("INSTAGRAM_APP_ID");
  },
  get igAppSecret() {
    return required("INSTAGRAM_APP_SECRET");
  },
  get webhookVerifyToken() {
    return required("WEBHOOK_VERIFY_TOKEN");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  get tokenKey() {
    return required("TOKEN_ENCRYPTION_KEY");
  },
  get graphVersion() {
    return process.env.GRAPH_API_VERSION || "v23.0";
  },
};

/**
 * Sending limits per Instagram account. Meta documents 750 private replies/hour;
 * the defaults stay well below that so accounts are never pushed to the edge.
 */
export const limits = {
  get dmsPerHour() {
    return int("MAX_DMS_PER_HOUR", 200);
  },
  get publicRepliesPerHour() {
    return int("MAX_PUBLIC_REPLIES_PER_HOUR", 100);
  },
  /** Minimum gap between two comment-triggered sends on the same account. */
  get minGapMs() {
    return int("MIN_SEND_GAP_MS", 2000);
  },
};
