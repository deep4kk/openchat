import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { env, isAllowedUsername } from "@/lib/env";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, getMe, subscribeWebhooks } from "@/lib/instagram";
import { createSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const fail = (reason: string) => NextResponse.redirect(`${env.appUrl}/?error=${encodeURIComponent(reason)}`);

  const jar = await cookies();
  const expected = jar.get("ig_oauth_state")?.value;
  jar.delete("ig_oauth_state");

  if (searchParams.get("error")) return fail(searchParams.get("error_description") ?? "Login cancelled");
  const code = searchParams.get("code");
  if (!code || !expected || searchParams.get("state") !== expected) return fail("Invalid login state, try again");

  try {
    // Instagram appends "#_" to the code in some flows.
    const { accessToken, expiresAt } = await exchangeCode(code.replace(/#_$/, ""));
    const me = await getMe(accessToken);
    // Checked before anything is saved: other accounts leave no data behind.
    if (!isAllowedUsername(me.username)) {
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
    await createSession(account.id);
    return NextResponse.redirect(`${env.appUrl}/dashboard`);
  } catch (err) {
    console.error("[autodm] instagram login failed", err);
    return fail(err instanceof Error ? err.message : "Instagram login failed");
  }
}
