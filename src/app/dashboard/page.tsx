import Link from "next/link";
import { db } from "@/lib/db";
import { requireAccount } from "@/lib/session";
import { parseAutomation } from "@/lib/automation-schema";
import { Topbar } from "@/components/Topbar";
import { ActiveToggle } from "@/components/ActiveToggle";
import { RunsTable } from "@/components/RunsTable";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const account = await requireAccount();
  const [rows, counts, recent] = await Promise.all([
    db.automation.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "desc" } }),
    db.run.groupBy({ by: ["automationId", "state"], where: { accountId: account.id }, _count: true }),
    db.run.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { automation: { select: { name: true } } },
    }),
  ]);
  const automations = rows.map(parseAutomation);

  const tally = (automationId?: string, state?: string) =>
    counts
      .filter((c) => (!automationId || c.automationId === automationId) && (!state || c.state === state))
      .reduce((n, c) => n + c._count, 0);

  return (
    <main className="container">
      <Topbar account={account} />

      {account.status === "RECONNECT" && (
        <div className="banner-warn" style={{ marginBottom: 20 }}>
          Instagram stopped accepting this login (expired or removed), so nothing is being sent. Queued comments are kept
          for up to 7 days. <a href="/api/auth/instagram">Reconnect Instagram</a>
        </div>
      )}

      <div className="stats">
        <div className="card stat">
          <div className="n">{automations.filter((a) => a.active).length}</div>
          <div className="small muted">Active automations</div>
        </div>
        <div className="card stat">
          <div className="n">{tally()}</div>
          <div className="small muted">Comments handled</div>
        </div>
        <div className="card stat">
          <div className="n">{tally(undefined, "DELIVERED")}</div>
          <div className="small muted">Links delivered</div>
        </div>
      </div>

      <section className="card stack" style={{ marginBottom: 20 }}>
        <div className="section-title">
          <h2>Automations</h2>
          <Link href="/automations/new" className="btn btn-primary">
            + New automation
          </Link>
        </div>
        {automations.length === 0 ? (
          <p className="muted">
            No automations yet. Create one to start replying to comments and sending DMs.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>On</th>
                  <th>Name</th>
                  <th>Where</th>
                  <th>Trigger</th>
                  <th>Follow gate</th>
                  <th>Handled</th>
                  <th>Delivered</th>
                </tr>
              </thead>
              <tbody>
                {automations.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <ActiveToggle id={a.id} active={a.active} />
                    </td>
                    <td>
                      <Link href={`/automations/${a.id}`}>
                        <strong>{a.name}</strong>
                      </Link>
                    </td>
                    <td className="small">
                      {a.mediaScope === "ALL_MEDIA" ? "All posts & reels" : `${a.mediaIds.length} selected`}
                    </td>
                    <td className="small">
                      {a.triggerType === "ANY_COMMENT" ? "Any comment" : a.keywords.join(", ")}
                    </td>
                    <td className="small">{a.askToFollow ? "On" : "Off"}</td>
                    <td>{tally(a.id)}</td>
                    <td>{tally(a.id, "DELIVERED")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Recent activity</h2>
        <RunsTable runs={recent} showAutomation />
      </section>

      <section className="card stack" style={{ marginTop: 20 }}>
        <h2>Your data</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Disconnecting removes your Instagram login, all automations and the activity log from this app. This cannot be undone.
        </p>
        <DeleteAccountButton />
      </section>
    </main>
  );
}
