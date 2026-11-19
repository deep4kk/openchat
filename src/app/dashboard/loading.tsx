/** Shown the moment the dashboard is opened, while its numbers load. */
export default function DashboardLoading() {
  return (
    <main className="container" aria-busy="true">
      <header className="topbar">
        <span className="brand">
          Auto<span>DM</span>
        </span>
        <span className="skeleton" style={{ width: 180, height: 32 }} />
      </header>
      <div className="stats">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="card stat" key={i}>
            <span className="skeleton" style={{ width: 56, height: 30 }} />
            <span className="skeleton" style={{ width: "80%", height: 14, marginTop: 10 }} />
          </div>
        ))}
      </div>
      <section className="card stack">
        <div className="tabs">
          <span className="tab" aria-selected="true">Automations</span>
          <span className="tab">Recent activity</span>
        </div>
        <span className="skeleton" style={{ height: 240 }} />
      </section>
    </main>
  );
}
