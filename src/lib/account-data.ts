import { db } from "./db";

/** Deletes an account and everything stored for it (automations and runs cascade). */
export async function deleteAccountData(igId: string) {
  await db.account.deleteMany({ where: { OR: [{ igScopedId: igId }, { igUserId: igId }] } });
}
