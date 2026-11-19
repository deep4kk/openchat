"use client";

import Link from "next/link";
import { useState } from "react";
import { ActiveToggle } from "./ActiveToggle";
import { ActivityFeed, type FeedRun } from "./ActivityFeed";
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
};

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

  function select(next: Tab) {
    setTab(next);
    // Keeps the tab on reload and back/forward without a server round trip.
    const url = new URL(window.location.href);
    url.search = next === "automations" ? "" : `?tab=${next}`;
    window.history.replaceState(null, "", url);
  }

  const lastPage = Math.max(0, Math.ceil(automations.length / size) - 1);
  const current = Math.min(page, lastPage);
  const slice = automations.slice(current * size, (current + 1) * size);

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
                      <th>Runs</th>
                      <th>DMs sent</th>
                      <th>Taps</th>
                      <th>Delivered</th>
                      <th>Clicks</th>
                      <th>New followers</th>
                    </tr>
                  </thead>
                  <tbody key={`${current}-${size}`} className="fade-in">
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
