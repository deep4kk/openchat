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
      <section className="card stack" style={{ marginBottom: 20 }}>
        <h2>Automations</h2>
        <span className="skeleton" style={{ height: 120 }} />
      </section>
      <section className="card stack">
        <h2>Recent activity</h2>
        <span className="skeleton" style={{ height: 240 }} />
      </section>
    </main>
  );
}
