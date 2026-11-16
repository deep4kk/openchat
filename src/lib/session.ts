import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "./db";
import { env, isAllowedUsername } from "./env";
import { signToken, verifyToken } from "./crypto";

const COOKIE = "autodm_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
/** Why the last login attempt failed; set by the OAuth callback, shown once on the home page. */
export const LOGIN_ERROR_COOKIE = "autodm_login_error";

type Session = { accountId: string; exp: number };

export async function createSession(accountId: string) {
  const token = signToken({ accountId, exp: Date.now() + MAX_AGE_SECONDS * 1000 }, env.sessionSecret);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    // Secure cookies are dropped on plain http, so follow the app's actual URL.
    secure: env.appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/**
 * Account ID from the signed cookie, without touching the database. Not proof of access on its
 * own (the account may be gone or no longer allowed): pair it with getAccount(). Pages use it to
 * start their own queries in parallel with the account lookup instead of waiting for it.
 */
export async function sessionAccountId(): Promise<string | null> {
  const session = verifyToken<Session>((await cookies()).get(COOKIE)?.value, env.sessionSecret);
  // A signed token without an expiry was never issued by createSession.
  return session && typeof session.accountId === "string" && typeof session.exp === "number" ? session.accountId : null;
}

/** Returns the logged-in account, or null. Looked up once per request, however often it's called. */
export const getAccount = cache(async () => {
  const accountId = await sessionAccountId();
  if (!accountId) return null;
  const account = await db.account.findUnique({ where: { id: accountId } });
  // Removing a username from ALLOWED_IG_USERNAMES also ends its existing sessions.
  return account && isAllowedUsername(account.username) ? account : null;
});

export async function requireAccount() {
  const account = await getAccount();
  if (!account) redirect("/");
  return account;
}

/**
 * CSRF guard for the cookie-authenticated write endpoints. Browsers attach Sec-Fetch-Site and
 * Origin to every POST/PUT/PATCH/DELETE and page scripts can't forge either, so a request
 * started by another website is recognisable. Compared against the Host the request arrived on
 * (not APP_URL), so it keeps working on any domain the deployment is reachable at.
 */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const forbidden = () => NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
