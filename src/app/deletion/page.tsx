import Link from "next/link";
import { db } from "@/lib/db";

export const metadata = { title: "Deletion status" };
export const dynamic = "force-dynamic";

/** Status URL Meta shows people after they remove the app (see /api/meta/data-deletion). */
export default async function DeletionStatus({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const request = code ? await db.deletionRequest.findUnique({ where: { code } }) : null;
  return (
    <main className="prose">
      <header>
        <h1>Deletion status</h1>
      </header>
      {request ? (
        <p>
          Request <code>{request.code}</code> was completed on {request.createdAt.toUTCString()}. All data stored for that
          Instagram account (login token, automations and activity log) has been deleted.
        </p>
      ) : (
        <p className="muted">
          {code ? "No deletion request found for this code." : "Open the link Instagram gave you to see the status of your request."}{" "}
          To delete your data, see <Link href="/data-deletion">Data deletion</Link>.
        </p>
      )}
    </main>
  );
}
