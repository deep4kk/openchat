import type { Run } from "@prisma/client";
import { LocalTime } from "./LocalTime";

export const STATES: Record<string, { label: string; tone: string }> = {
  QUEUED: { label: "Queued", tone: "" },
  SENDING: { label: "Sending…", tone: "" },
  EXPIRED: { label: "Expired (7-day limit)", tone: "warn" },
  PRIVATE_REPLIED: { label: "DM sent, waiting for tap", tone: "" },
  AWAITING_FOLLOW: { label: "Asked to follow", tone: "warn" },
  DELIVERED: { label: "Link delivered", tone: "ok" },
  ABANDONED: { label: "Didn't follow", tone: "warn" },
  FAILED: { label: "Failed", tone: "bad" },
};

export function RunsTable({ runs, showAutomation }: { runs: (Run & { automation?: { name: string } })[]; showAutomation?: boolean }) {
  if (runs.length === 0) return <p className="muted small">No activity yet. Comments that match will show up here.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Comment</th>
            {showAutomation && <th>Automation</th>}
            <th>Status</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const s = STATES[r.state] ?? { label: r.state, tone: "" };
            return (
              <tr key={r.id}>
                <td>{r.username ? `@${r.username}` : r.igsid}</td>
                <td>{r.commentText}</td>
                {showAutomation && <td>{r.automation?.name}</td>}
                <td>
                  <span className={`pill ${s.tone}`} title={r.error ?? undefined}>
                    {s.label}
                    {r.followAttempts > 0 && ` · ${r.followAttempts}×`}
                  </span>
                  {r.followGainedAt && <span className="pill ok" style={{ marginLeft: 6 }}>New follower</span>}
                  {r.linkClicks > 0 && (
                    <span className="pill" style={{ marginLeft: 6 }}>
                      Clicked{r.linkClicks > 1 ? ` ${r.linkClicks}×` : ""}
                    </span>
                  )}
                  {r.error && <div className="error">{r.error}</div>}
                </td>
                <td className="small muted">
                  <LocalTime iso={r.createdAt.toISOString()} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
