import { missingLegalSettings, site } from "@/lib/site";

/** Shared frame for the privacy, terms and data deletion pages. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  const missing = process.env.NODE_ENV === "production" ? [] : missingLegalSettings();
  return (
    <main className="prose">
      <header>
        <h1>{title}</h1>
        <p className="muted small">
          {site.name} · Last updated {site.legalUpdated}
        </p>
        {missing.length > 0 && (
          <div className="banner-warn small">
            Only you see this (development mode): set <code>{missing.join(", ")}</code> in{" "}
            <code>.env</code> before submitting to Meta, so this page names who runs the app and how to reach them.
          </div>
        )}
      </header>
      {children}
    </main>
  );
}

/** "email you@x.com" link, or a pointer to the dashboard when no contact is configured. */
export function ContactLine() {
  return site.contact ? (
    <a href={`mailto:${site.contact}`}>{site.contact}</a>
  ) : (
    <>{site.operator} (no contact email has been set up yet)</>
  );
}
