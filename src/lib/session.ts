import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "./db";
import { env } from "./env";
import { signToken, verifyToken } from "./crypto";
import { allowedClaimsInclude, isAllowedAccount } from "./allowlist";

const COOKIE = "autodm_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
/** Why the last login attempt failed; set by the OAuth callback, shown once on the home page. */
export const LOGIN_ERROR_COOKIE = "autodm_login_error";

/** `v` is the account's sessionVersion when the cookie was issued; bumping it ends the session. */
type Session = { accountId: string; v: number; exp: number };

export async function createSession(account: { id: string; sessionVersion: number }) {
  const session: Session = { accountId: account.id, v: account.sessionVersion, exp: Date.now() + MAX_AGE_SECONDS * 1000 };
  const token = signToken(session, env.sessionSecret);
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

async function readSession(): Promise<Session | null> {
  const session = verifyToken<Session>((await cookies()).get(COOKIE)?.value, env.sessionSecret);
  // A signed token without these was never issued by createSession (or predates session versions).
  return session && typeof session.accountId === "string" && typeof session.v === "number" && typeof session.exp === "number"
    ? session
    : null;
}

/**
 * Ends this account's sessions everywhere, not only in this browser: a cookie copied elsewhere
 * stops working too. Only counts if the cookie is still current, so an old one can't log others out.
 */
export async function endAllSessions() {
  const session = await readSession();
  if (session) {
    await db.account.updateMany({ where: { id: session.accountId, sessionVersion: session.v }, data: { sessionVersion: { increment: 1 } } });
  }
  await destroySession();
}

/**
 * Account ID from the signed cookie, without touching the database. Not proof of access on its
 * own (the account may be gone or no longer allowed): pair it with getAccount(). Pages use it to
 * start their own queries in parallel with the account lookup instead of waiting for it.
 */
export async function sessionAccountId(): Promise<string | null> {
  return (await readSession())?.accountId ?? null;
}

/** Returns the logged-in account, or null. Looked up once per request, however often it's called. */
export const getAccount = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const account = await db.account.findUnique({ where: { id: session.accountId }, include: allowedClaimsInclude() });
  // Logging out (anywhere) or taking the account off ALLOWED_IG_USERNAMES ends existing sessions.
  if (!account || account.sessionVersion !== session.v || !(await isAllowedAccount(account))) return null;
  return account;
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
