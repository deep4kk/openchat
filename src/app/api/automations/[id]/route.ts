import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { forbidden, getAccount, isSameOrigin } from "@/lib/session";
import { automationInput, toRow } from "@/lib/automation-schema";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

// Each write is one statement scoped to { id, accountId }: ownership is checked by the
// same query that changes the row, instead of a separate lookup first.

export async function PUT(req: Request, { params }: Ctx) {
  if (!isSameOrigin(req)) return forbidden();
  const account = await getAccount();
  if (!account) return notFound();

  const parsed = automationInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });

  const { id } = await params;
  const { count } = await db.automation.updateMany({ where: { id, accountId: account.id }, data: toRow(parsed.data) });
  return count ? NextResponse.json({ id }) : notFound();
}

/** Toggle active on/off without resending the whole form. */
export async function PATCH(req: Request, { params }: Ctx) {
  if (!isSameOrigin(req)) return forbidden();
  const account = await getAccount();
  if (!account) return notFound();
  const { active } = ((await req.json().catch(() => null)) ?? {}) as { active?: unknown };
  if (typeof active !== "boolean") return NextResponse.json({ error: "active must be boolean" }, { status: 400 });

  const { id } = await params;
  const { count } = await db.automation.updateMany({ where: { id, accountId: account.id }, data: { active } });
  return count ? NextResponse.json({ id, active }) : notFound();
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!isSameOrigin(req)) return forbidden();
  const account = await getAccount();
  if (!account) return notFound();
  const { id } = await params;
  const { count } = await db.automation.deleteMany({ where: { id, accountId: account.id } });
  return count ? NextResponse.json({ ok: true }) : notFound();
}
