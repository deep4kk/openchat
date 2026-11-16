import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { env, isAllowedUsername } from "./env";
import { signToken, verifyToken } from "./crypto";

const COOKIE = "autodm_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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

/** Returns the logged-in account, or null. */
export async function getAccount() {
  const session = verifyToken<Session>((await cookies()).get(COOKIE)?.value, env.sessionSecret);
  if (!session) return null;
  const account = await db.account.findUnique({ where: { id: session.accountId } });
  // Removing a username from ALLOWED_IG_USERNAMES also ends its existing sessions.
  return account && isAllowedUsername(account.username) ? account : null;
}

export async function requireAccount() {
  const account = await getAccount();
  if (!account) redirect("/");
  return account;
}
