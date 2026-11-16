import { redirect } from "next/navigation";
import { getAccount } from "@/lib/session";
import { missingWebEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  const missing = missingWebEnv();
  if (missing.length) return <SetupChecklist missing={missing} />;

  if (await getAccount()) redirect("/dashboard");
  const { error, deleted } = await searchParams;
  const appUrl = process.env.APP_URL ?? "";
  const sqliteOnVercel = Boolean(process.env.VERCEL) && !/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "");

  return (
    <main className="hero">
      <div className="brand">
        Auto<span>DM</span>
      </div>
      <h1>Turn comments into DMs, automatically</h1>
      <p className="muted">
        Someone comments a keyword on your reel or post. You reply publicly, DM them your link, and can ask them to follow first.
      </p>
      <ul className="muted">
        <li>Keyword or any-comment triggers on one reel, several, or all posts</li>
        <li>Randomised public comment replies</li>
        <li>Optional &quot;follow to get the link&quot; gate</li>
      </ul>
      {error && <div className="banner-error">{error}</div>}
      {deleted && <div className="banner-ok">Your account was disconnected and all its data deleted.</div>}
      {!appUrl.startsWith("https://") && (
        <div className="banner-warn">
          APP_URL is not https. Instagram login and webhooks need a public https URL. See docs/SETUP.md, step 4.
        </div>
      )}
      {sqliteOnVercel && (
        <div className="banner-error">
          DATABASE_URL is a local file, which Vercel can&apos;t keep. Use the PostgreSQL URL from Render. See{" "}
          <a href="/docs#env">Run your own copy</a>.
        </div>
      )}
      <div>
        <a className="btn btn-primary" href="/api/auth/instagram">
          Continue with Instagram
        </a>
      </div>
      <p className="small muted">
        This is a personal copy for its owner&apos;s Instagram account only. Want it for yours? It&apos;s free and open
        source: <a href="/docs">run your own copy</a> with your own Meta app and database.
      </p>
    </main>
  );
}

function SetupChecklist({ missing }: { missing: string[] }) {
  return (
    <main className="hero">
      <div className="brand">
        Auto<span>DM</span>
      </div>
      <h1>Almost there</h1>
      <p className="muted">
        These settings are empty. Locally, fill them in <code>.env</code> (see <code>docs/SETUP.md</code>) and restart. On
        Vercel or Render, add them as environment variables and redeploy (see <a href="/docs">Run your own copy</a>).{" "}
        <code>ALLOWED_IG_USERNAMES</code> is your Instagram username: only the accounts listed there can log in.
      </p>
      <ul>
        {missing.map((m) => (
          <li key={m}>
            <code>{m}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
