import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { claimUsername, mayLogIn } from "@/lib/allowlist";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, getMe, GraphError, subscribeWebhooks } from "@/lib/instagram";
import { createSession, LOGIN_ERROR_COOKIE } from "@/lib/session";
import { allow, tooMany } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  if (!allow(req, "login-callback", 30, 10 * 60_000)) return tooMany();
  const { searchParams } = req.nextUrl;
  const jar = await cookies();
  // The reason travels in a short-lived cookie, not the URL: a link to /?error=<text> must not
  // be able to put someone else's words on the login page.
  const fail = (reason: string) => {
    jar.set(LOGIN_ERROR_COOKIE, reason.slice(0, 300), {
      httpOnly: true,
      secure: env.appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    });
    return NextResponse.redirect(`${env.appUrl}/?error=1`);
  };

  const expected = jar.get("ig_oauth_state")?.value;
  jar.delete("ig_oauth_state");

  // error_description comes straight from the URL, so it is never shown.
  if (searchParams.get("error")) return fail("Instagram login was cancelled or declined.");
  const code = searchParams.get("code");
  if (!code || !expected || searchParams.get("state") !== expected) return fail("Invalid login state, try again");

  try {
    // Instagram appends "#_" to the code in some flows.
    const { accessToken, expiresAt } = await exchangeCode(code.replace(/#_$/, ""));
    const me = await getMe(accessToken);
    // Checked before anything is saved: other accounts leave no data behind.
    if (!(await mayLogIn(me.user_id, me.username))) {
      return fail(`@${me.username} can't use this copy. It's a personal setup; to use it for your account, run your own copy (see "Run your own copy" below).`);
    }
    await subscribeWebhooks(accessToken);

    const data = {
      igScopedId: me.id,
      status: "ACTIVE",
      username: me.username,
      name: me.name,
      profilePicture: me.profile_picture_url,
      accessToken: encrypt(accessToken, env.tokenKey),
      tokenExpiresAt: expiresAt,
    };
    const account = await db.account.upsert({
      where: { igUserId: me.user_id },
      create: { igUserId: me.user_id, ...data },
      update: data,
    });
    await claimUsername(account.id, me.username);
    await createSession(account);
    return NextResponse.redirect(`${env.appUrl}/dashboard`);
  } catch (err) {
    console.error("[autodm] instagram login failed", err);
    // Instagram's own explanations (wrong redirect URI, missing tester role…) help during setup;
    // anything else stays in the server log.
    return fail(err instanceof GraphError ? err.message : "Instagram login failed. Try again; the server log has the details.");
  }
}
