import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { parseSignedRequest } from "@/lib/crypto";
import { deleteAccountData } from "@/lib/account-data";

/** Meta calls this when someone asks for their data to be deleted. Required for App Review. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const data = parseSignedRequest(form?.get("signed_request")?.toString() ?? null, env.igAppSecret);
  if (!data?.user_id) return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });

  await deleteAccountData(String(data.user_id));
  const code = randomBytes(8).toString("hex");
  await db.deletionRequest.create({ data: { code } });
  return NextResponse.json({ url: `${env.appUrl}/deletion?code=${code}`, confirmation_code: code });
}
