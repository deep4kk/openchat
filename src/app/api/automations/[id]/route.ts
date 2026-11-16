import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAccount } from "@/lib/session";
import { automationInput, toRow } from "@/lib/automation-schema";

type Ctx = { params: Promise<{ id: string }> };

async function owned(id: string) {
  const account = await getAccount();
  if (!account) return null;
  return db.automation.findFirst({ where: { id, accountId: account.id } });
}

export async function PUT(req: Request, { params }: Ctx) {
  const existing = await owned((await params).id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = automationInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.automation.update({ where: { id: existing.id }, data: toRow(parsed.data) });
  return NextResponse.json({ id: existing.id });
}

/** Toggle active on/off without resending the whole form. */
export async function PATCH(req: Request, { params }: Ctx) {
  const existing = await owned((await params).id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { active } = (await req.json().catch(() => ({}))) as { active?: unknown };
  if (typeof active !== "boolean") return NextResponse.json({ error: "active must be boolean" }, { status: 400 });
  await db.automation.update({ where: { id: existing.id }, data: { active } });
  return NextResponse.json({ id: existing.id, active });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const existing = await owned((await params).id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.automation.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
