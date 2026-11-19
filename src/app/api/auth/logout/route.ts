import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { endAllSessions, forbidden, isSameOrigin } from "@/lib/session";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  await endAllSessions();
  return NextResponse.redirect(`${env.appUrl}/`, 303);
}
