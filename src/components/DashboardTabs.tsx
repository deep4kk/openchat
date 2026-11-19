"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ActiveToggle } from "./ActiveToggle";
import { ActivityFeed, type FeedRun } from "./ActivityFeed";
import { LocalTime } from "./LocalTime";
import { Pager } from "./Pager";
import { usePageSize } from "./usePageSize";

export type AutomationRow = {
  id: string;
  name: string;
  active: boolean;
  where: string;
  trigger: string;
  followGate: boolean;
  runs: number;
  dmsSent: number;
  taps: number;
  delivered: number;
  clicks: number;
  followers: number;
  /** ISO timestamp */
  createdAt: string;
};

type SortKey = "createdAt" | "runs" | "dmsSent" | "taps" | "delivered" | "clicks" | "followers";
type Sort = { key: SortKey; dir: "asc" | "desc" };

/** The sortable columns, in table order. */
const SORTABLE: { key: SortKey; label: string }[] = [
  { key: "createdAt", label: "Created" },
  { key: "runs", label: "Runs" },
  { key: "dmsSent", label: "DMs sent" },
  { key: "taps", label: "Taps" },
  { key: "delivered", label: "Delivered" },
  { key: "clicks", label: "Clicks" },
  { key: "followers", label: "New followers" },
];

/** Header that sorts by its column: first click puts the highest (or newest) on top, the next flips it. */
function SortHeader({ col, sort, onSort }: { col: (typeof SORTABLE)[number]; sort: Sort; onSort: (s: Sort) => void }) {
  const active = sort.key === col.key;
  return (
    <th aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="sort"
        data-active={active}
        onClick={() => onSort({ key: col.key, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
        title={`Sort by ${col.label.toLowerCase()}`}
      >
        {col.label}
        <span className="sort-arrow" aria-hidden>
          {active ? (sort.dir === "desc" ? "↓" : "↑") : "↕"}
        </span>
      </button>
    </th>
  );
}

export type Tab = "automations" | "activity";

export function DashboardTabs({
  automations,
  runs,
  runsCapped,
  initialTab,
}: {
  automations: AutomationRow[];
  runs: FeedRun[];
  runsCapped: boolean;
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [page, setPage] = useState(0);
  const [size, setSize] = usePageSize("automations", 10);
  const [sort, setSort] = useState<Sort>({ key: "createdAt", dir: "desc" });

  function select(next: Tab) {
    setTab(next);
    // Keeps the tab on reload and back/forward without a server round trip.
    const url = new URL(window.location.href);
    url.search = next === "automations" ? "" : `?tab=${next}`;
    window.history.replaceState(null, "", url);
  }

  const sorted = useMemo(() => {
    const sign = sort.dir === "asc" ? 1 : -1;
    // Ties keep the newest first, so equal numbers don't shuffle between clicks.
    return [...automations].sort((a, b) => {
      const by = sort.key === "createdAt" ? a.createdAt.localeCompare(b.createdAt) : a[sort.key] - b[sort.key];
      return by * sign || b.createdAt.localeCompare(a.createdAt);
    });
  }, [automations, sort]);

  const lastPage = Math.max(0, Math.ceil(sorted.length / size) - 1);
  const current = Math.min(page, lastPage);
  const slice = sorted.slice(current * size, (current + 1) * size);
  const onSort = (next: Sort) => {
    setSort(next);
    setPage(0);
  };

  return (
    <section className="card stack" style={{ marginBottom: 20 }}>
      <div className="section-title" style={{ marginBottom: 0 }}>
        <div className="tabs" role="tablist" aria-label="Dashboard">
          <button type="button" role="tab" id="tab-automations" aria-controls="panel-automations" aria-selected={tab === "automations"} className="tab" onClick={() => select("automations")}>
            Automations <span className="tab-n">{automations.length}</span>
          </button>
          <button type="button" role="tab" id="tab-activity" aria-controls="panel-activity" aria-selected={tab === "activity"} className="tab" onClick={() => select("activity")}>
            Recent activity <span className="tab-n">{runs.length}{runsCapped ? "+" : ""}</span>
          </button>
        </div>
        {tab === "automations" && (
          <div className="row">
            <Link href="/automations/import" className="btn">
              Import CSV
            </Link>
            <Link href="/automations/new" className="btn btn-primary">
              + New automation
            </Link>
          </div>
        )}
      </div>

      {tab === "automations" ? (
        <div role="tabpanel" id="panel-automations" aria-labelledby="tab-automations" className="tab-panel stack">
          {automations.length === 0 ? (
            <p className="muted">No automations yet. Create one to start replying to comments and sending DMs.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>On</th>
                      <th>Name</th>
                      <th>Where</th>
                      <th>Trigger</th>
                      <th>Follow gate</th>
                      {SORTABLE.map((col) => (
                        <SortHeader key={col.key} col={col} sort={sort} onSort={onSort} />
                      ))}
                    </tr>
                  </thead>
                  <tbody key={`${current}-${size}-${sort.key}-${sort.dir}`} className="fade-in">
                    {slice.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <ActiveToggle id={a.id} active={a.active} />
                        </td>
                        <td>
                          <Link href={`/automations/${a.id}`}>
                            <strong>{a.name}</strong>
                          </Link>
                        </td>
                        <td className="small">{a.where}</td>
                        <td className="small">{a.trigger}</td>
                        <td className="small">{a.followGate ? "On" : "Off"}</td>
                        <td className="small muted nowrap">
                          <LocalTime iso={a.createdAt} mode="date" />
                        </td>
                        <td>{a.runs}</td>
                        <td>{a.dmsSent}</td>
                        <td>{a.taps}</td>
                        <td>{a.delivered}</td>
                        <td>{a.clicks}</td>
                        <td>{a.followGate || a.followers ? a.followers : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                total={automations.length}
                page={current}
                size={size}
                onPage={setPage}
                onSize={(n) => {
                  setSize(n);
                  setPage(0);
                }}
              />
            </>
          )}
        </div>
      ) : (
        <div role="tabpanel" id="panel-activity" aria-labelledby="tab-activity" className="tab-panel">
          <ActivityFeed runs={runs} capped={runsCapped} />
        </div>
      )}
    </section>
  );
}
