import { Prisma } from "@prisma/client";
import { db } from "./db";
import { allowedUsernames } from "./env";

/**
 * Who may use this copy. ALLOWED_IG_USERNAMES names the accounts, but a username can change hands,
 * so the first account to log in with each listed name claims it (AllowedClaim). From then on the
 * claim decides, not whatever username an account has today:
 *  - the owner keeps access after renaming their account, as long as the old name stays listed;
 *  - someone who later takes a listed name can't get in, because that name is already claimed.
 * Taking a name off the list still ends access for the account that claimed it.
 */

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** The login check, made before anything is saved for the account. */
export async function mayLogIn(igUserId: string, username: string): Promise<boolean> {
  const allowed = allowedUsernames();
  if (!allowed.length) return false;
  const claims = await db.allowedClaim.findMany({
    where: { username: { in: allowed } },
    select: { username: true, account: { select: { igUserId: true } } },
  });
  if (claims.some((c) => c.account.igUserId === igUserId)) return true;
  const name = username.toLowerCase();
  return allowed.includes(name) && !claims.some((c) => c.username === name);
}

/**
 * Claims the account's current username if it is listed and nobody holds it yet. Returns whether
 * the account holds it afterwards. Also covers accounts connected before claims existed.
 */
export async function claimUsername(accountId: string, username: string): Promise<boolean> {
  const name = username.toLowerCase();
  if (!allowedUsernames().includes(name)) return false;
  try {
    await db.allowedClaim.create({ data: { username: name, accountId } });
    return true;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const holder = await db.allowedClaim.findUnique({ where: { username: name }, select: { accountId: true } });
    return holder?.accountId === accountId;
  }
}

/** Prisma `include` that loads the account's claims on names still on the list. */
export const allowedClaimsInclude = () => ({
  allowedAs: { where: { username: { in: allowedUsernames() } }, select: { username: true }, take: 1 },
});

/** Whether an account may use the copy, given its claims loaded with allowedClaimsInclude(). */
export async function isAllowedAccount(account: { id: string; username: string; allowedAs: { username: string }[] }): Promise<boolean> {
  return account.allowedAs.length > 0 || claimUsername(account.id, account.username);
}
