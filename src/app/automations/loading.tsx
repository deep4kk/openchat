/** Shown the moment an automation (or the new-automation form) is opened, while it loads. */
export default function AutomationLoading() {
  return (
    <main className="container" aria-busy="true">
      <header className="topbar">
        <span className="brand">
          Auto<span>DM</span>
        </span>
        <span className="skeleton" style={{ width: 180, height: 32 }} />
      </header>
      <span className="skeleton" style={{ width: 260, height: 28, marginBottom: 20 }} />
      <div className="editor">
        <div className="stack">
          {[72, 220, 150, 190].map((height, i) => (
            <span className="skeleton" key={i} style={{ height }} />
          ))}
        </div>
        <span className="skeleton" style={{ height: 520 }} />
      </div>
    </main>
  );
}
