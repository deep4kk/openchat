import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAccount, sessionAccountId } from "@/lib/session";
import { parseAutomation } from "@/lib/automation-schema";
import { Topbar } from "@/components/Topbar";
import { ActiveToggle } from "@/components/ActiveToggle";
import { RunsTable } from "@/components/RunsTable";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

export const dynamic = "force-dynamic";

type Search = Partial<Record<"caughtUp" | "tooOld" | "skipped" | "found" | "own" | "noCommenter" | "notMatching" | "posts" | "catchUpError", string>>;

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  // The cookie already names the account, so its data loads alongside the account check
  // instead of after it: one database round trip for the page instead of two.
  const accountId = await sessionAccountId();
  if (!accountId) redirect("/");
  const search = await searchParams;
  const caughtUp = Number(search.caughtUp ?? NaN);
  const tooOld = Number(search.tooOld ?? 0);
  const [account, rows, counts, recent] = await Promise.all([
    getAccount(),
    db.automation.findMany({ where: { accountId }, orderBy: { createdAt: "desc" } }),
    // Every number on the page comes from this one grouped query. Counting a column counts its non-null values.
    db.run.groupBy({
      by: ["automationId", "state"],
      where: { accountId },
      _count: { _all: true, privateRepliedAt: true, lastUserMessageAt: true, linkClickedAt: true, followGainedAt: true },
    }),
    db.run.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { automation: { select: { name: true } } },
    }),
  ]);
  if (!account) redirect("/");
  const automations = rows.map(parseAutomation);

  type Metric = keyof (typeof counts)[number]["_count"];
  const total = (metric: Metric, automationId?: string, state?: string) =>
    counts
      .filter((c) => (!automationId || c.automationId === automationId) && (!state || c.state === state))
      .reduce((n, c) => n + c._count[metric], 0);
  const tally = (automationId?: string, state?: string) => total("_all", automationId, state);
  const [dmsSent, taps, clicked, followers]: Metric[] = ["privateRepliedAt", "lastUserMessageAt", "linkClickedAt", "followGainedAt"];
  const sum = (metric: Metric, automationId?: string) => total(metric, automationId);

  return (
    <main className="container">
      <Topbar account={account} />

      {account.status === "RECONNECT" && (
        <div className="banner-warn" style={{ marginBottom: 20 }}>
          Instagram stopped accepting this login (expired or removed), so nothing is being sent. Queued comments are kept
          for up to 7 days. <a href="/api/auth/instagram">Reconnect Instagram</a>
        </div>
      )}

      {Number.isFinite(caughtUp) && (
        <div className="banner-ok" style={{ marginBottom: 20 }}>
          {caughtUp > 0
            ? `Replying to ${caughtUp} existing comment${caughtUp === 1 ? "" : "s"}, a few seconds apart. Watch them in Activity below.`
            : "No existing comments needed a reply."}
          {tooOld > 0 && ` ${tooOld} matching comment${tooOld === 1 ? " was" : "s were"} older than 7 days, which Instagram doesn't allow a DM for.`}
          {search.found !== undefined && (
            <div className="small" style={{ marginTop: 6 }}>
              Instagram returned {search.found} comment{search.found === "1" ? "" : "s"} on {search.posts} post
              {search.posts === "1" ? "" : "s"}: {search.own} from your own account (always ignored), {search.notMatching} didn&apos;t
              match the trigger, {search.noCommenter} without the commenter&apos;s ID, {search.skipped} already handled or same person
              again.
            </div>
          )}
        </div>
      )}
      {search.catchUpError && (
        <div className="banner-error" style={{ marginBottom: 20 }}>
          Automation saved, but replying to existing comments failed: {search.catchUpError}
        </div>
      )}

      <div className="stats">
        <div className="card stat">
          <div className="n">{tally()}</div>
          <div className="small muted">Runs (comments handled)</div>
        </div>
        <div className="card stat">
          <div className="n">{sum(dmsSent)}</div>
          <div className="small muted">DMs sent</div>
        </div>
        <div className="card stat">
          <div className="n">{sum(taps)}</div>
          <div className="small muted">Button taps</div>
        </div>
        <div className="card stat">
          <div className="n">{tally(undefined, "DELIVERED")}</div>
          <div className="small muted">Final DMs delivered</div>
        </div>
        <div className="card stat">
          <div className="n">{sum(clicked)}</div>
          <div className="small muted">People who clicked the link</div>
        </div>
        <div className="card stat">
          <div className="n">{sum(followers)}</div>
          <div className="small muted">New followers (follow gate)</div>
        </div>
      </div>

      <section className="card stack" style={{ marginBottom: 20 }}>
        <div className="section-title">
          <h2>Automations</h2>
          <div className="row">
            <Link href="/automations/import" className="btn">
              Import CSV
            </Link>
            <Link href="/automations/new" className="btn btn-primary">
              + New automation
            </Link>
          </div>
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
                  <th>Runs</th>
                  <th>DMs sent</th>
                  <th>Taps</th>
                  <th>Delivered</th>
                  <th>Clicks</th>
                  <th>New followers</th>
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
                    <td>{sum(dmsSent, a.id)}</td>
                    <td>{sum(taps, a.id)}</td>
                    <td>{tally(a.id, "DELIVERED")}</td>
                    <td>{sum(clicked, a.id)}</td>
                    <td>{a.askToFollow || sum(followers, a.id) ? sum(followers, a.id) : "–"}</td>
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
