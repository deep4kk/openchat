import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { destroySession, getAccount } from "@/lib/session";

/** "Disconnect and delete my data" from the dashboard. */
export async function POST() {
  const account = await getAccount();
  if (account) await db.account.delete({ where: { id: account.id } });
  await destroySession();
  return NextResponse.redirect(`${env.appUrl}/?deleted=1`, 303);
}
