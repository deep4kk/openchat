import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { forbidden, getAccount, isSameOrigin } from "@/lib/session";
import { automationInput, toRow } from "@/lib/automation-schema";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  const account = await getAccount();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = automationInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const automation = await db.automation.create({ data: { ...toRow(parsed.data), accountId: account.id } });
  return NextResponse.json({ id: automation.id }, { status: 201 });
}
