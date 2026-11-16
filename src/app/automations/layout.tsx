import { redirect } from "next/navigation";
import { sessionAccountId } from "@/lib/session";

/**
 * Turns visitors without a session cookie away before anything is streamed (a plain redirect,
 * no loading skeleton first). Reads only the cookie; the page itself still verifies the account.
 */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  if (!(await sessionAccountId())) redirect("/");
  return children;
}
