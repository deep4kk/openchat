"use client";

import { useEffect, useMemo, useState } from "react";
import { LocalTime } from "./LocalTime";
import { Pager } from "./Pager";
import { STATES } from "./RunsTable";
import { usePageSize } from "./usePageSize";

export type FeedRun = {
  id: string;
  username: string | null;
  igsid: string;
  commentText: string;
  state: string;
  error: string | null;
  followAttempts: number;
  followGainedAt: string | null;
  linkClicks: number;
  createdAt: string;
  automationId: string;
  automationName: string;
};

const FILTERS: { key: string; label: string; states: string[] | null }[] = [
  { key: "all", label: "All", states: null },
  { key: "progress", label: "In progress", states: ["QUEUED", "SENDING", "PRIVATE_REPLIED", "AWAITING_FOLLOW"] },
  { key: "delivered", label: "Delivered", states: ["DELIVERED"] },
  { key: "stopped", label: "Didn't finish", states: ["EXPIRED", "ABANDONED"] },
  { key: "failed", label: "Failed", states: ["FAILED"] },
];

/** Day bucket for a timestamp: local once in the browser, UTC while server-rendering so both agree on first paint. */
function dayKey(iso: string, local: boolean) {
  if (!local) return iso.slice(0, 10);
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string, local: boolean) {
  if (!local) return key;
  const today = dayKey(new Date().toISOString(), true);
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString(), true);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function ActivityFeed({ runs, capped }: { runs: FeedRun[]; capped: boolean }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [size, setSize] = usePageSize("activity", 15);
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, f.states ? runs.filter((r) => f.states!.includes(r.state)).length : runs.length])),
    [runs],
  );
  const shown = useMemo(() => {
    const states = FILTERS.find((f) => f.key === filter)?.states;
    return states ? runs.filter((r) => states.includes(r.state)) : runs;
  }, [runs, filter]);

  const lastPage = Math.max(0, Math.ceil(shown.length / size) - 1);
  const current = Math.min(page, lastPage);
  const slice = shown.slice(current * size, (current + 1) * size);

  const groups: { key: string; items: FeedRun[] }[] = [];
  for (const r of slice) {
    const key = dayKey(r.createdAt, local);
    if (groups.at(-1)?.key !== key) groups.push({ key, items: [] });
    groups.at(-1)!.items.push(r);
  }

  if (runs.length === 0) return <p className="muted small">No activity yet. Comments that match will show up here.</p>;

  return (
    <div className="stack">
      <div className="filters" role="group" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="filter"
            aria-pressed={filter === f.key}
            onClick={() => {
              setFilter(f.key);
              setPage(0);
            }}
          >
            {f.label}
            <span className="filter-n">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {slice.length === 0 ? (
        <p className="muted small">Nothing here.</p>
      ) : (
        <div className="feed" key={`${filter}-${current}-${size}`}>
          {groups.map((g) => (
            <div key={g.key} className="feed-group">
              <div className="feed-day">{dayLabel(g.key, local)}</div>
              {g.items.map((r) => {
                const s = STATES[r.state] ?? { label: r.state, tone: "" };
                const who = r.username ? `@${r.username}` : r.igsid;
                return (
                  <div key={r.id} className="feed-item">
                    <span className={`feed-dot ${s.tone}`} aria-hidden />
                    <div className="feed-avatar" aria-hidden>
                      {(r.username ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="feed-body">
                      <div className="feed-meta">
                        <strong>{who}</strong>
                        <span className="muted small">
                          on <a href={`/automations/${r.automationId}`}>{r.automationName}</a>
                        </span>
                        <span className="muted small feed-time">
                          <LocalTime iso={r.createdAt} mode="time" />
                        </span>
                      </div>
                      <div className="feed-comment">{r.commentText}</div>
                      <div className="row" style={{ gap: 6 }}>
                        <span className={`pill ${s.tone}`}>
                          {s.label}
                          {r.followAttempts > 0 && ` · ${r.followAttempts}×`}
                        </span>
                        {r.followGainedAt && <span className="pill ok">New follower</span>}
                        {r.linkClicks > 0 && <span className="pill">Clicked{r.linkClicks > 1 ? ` ${r.linkClicks}×` : ""}</span>}
                      </div>
                      {r.error && <div className="error">{r.error}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <Pager
        total={shown.length}
        page={current}
        size={size}
        onPage={setPage}
        onSize={(n) => {
          setSize(n);
          setPage(0);
        }}
      />
      {capped && <p className="small muted" style={{ margin: 0 }}>Showing the latest {runs.length} comments.</p>}
    </div>
  );
}
