import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { authorizeUrl } from "@/lib/instagram";
import { allow, tooMany } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  if (!allow(req, "login", 30, 10 * 60_000)) return tooMany();
  // Login must start on APP_URL (e.g. the https tunnel), otherwise the session
  // cookie lands on a different host than the one Instagram redirects back to.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && host !== new URL(env.appUrl).host && !req.nextUrl.searchParams.has("r")) {
    return NextResponse.redirect(`${env.appUrl}/api/auth/instagram?r=1`);
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("ig_oauth_state", state, {
    httpOnly: true,
    secure: env.appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
