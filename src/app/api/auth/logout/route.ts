import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { destroySession, forbidden, isSameOrigin } from "@/lib/session";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  await destroySession();
  return NextResponse.redirect(`${env.appUrl}/`, 303);
}
