import Link from "next/link";
import { site } from "@/lib/site";

export const metadata = { title: "Run your own copy" };
export const dynamic = "force-dynamic";

/**
 * The hosting guide, inside the app so people who clone the repo don't need to
 * ask. docs/DEPLOY.md has the same steps for readers on GitHub; keep them in sync.
 */
export default function HostingGuide() {
  const base = site.url.startsWith("https://") ? site.url : "https://YOUR-APP.vercel.app";
  const filled = base !== "https://YOUR-APP.vercel.app";

  const metaUrls = [
    ["Business login settings → OAuth redirect URIs", `${base}/api/auth/instagram/callback`],
    ["Business login settings → Deauthorize callback URL", `${base}/api/meta/deauthorize`],
    ["Business login settings → Data deletion request URL", `${base}/api/meta/data-deletion`],
    ["Configure webhooks → Callback URL", `${base}/api/webhooks/instagram`],
    ["App settings → Basic → Privacy policy URL", `${base}/privacy`],
    ["App settings → Basic → Terms of service URL", `${base}/terms`],
    ["App settings → Basic → User data deletion (instructions URL)", `${base}/data-deletion`],
    ["App settings → Basic → Site URL / App domain", base],
  ];

  return (
    <main className="prose">
      <header>
        <h1>Run your own copy</h1>
        <p className="muted">
          {site.name} is free and open source. Everyone runs their own copy with their own Meta app, so your data and your
          Instagram limits are yours alone. This page explains how the hosting works and every step to get it online.
        </p>
        <ul className="toc">
          <li><a href="#how">How it&apos;s hosted</a></li>
          <li><a href="#cost">What it costs</a></li>
          <li><a href="#steps">Step by step</a></li>
          <li><a href="#env">Settings</a></li>
          <li><a href="#meta">Meta URLs</a></li>
          <li><a href="#review">Going live</a></li>
          <li><a href="#help">Problems</a></li>
        </ul>
      </header>

      <h2 id="how">How it&apos;s hosted</h2>
      <p>The app is one codebase that runs in two places:</p>
      <div className="flow">
        <div>
          <strong>Instagram (Meta)</strong>
          <span className="muted">Sends comment and message events, delivers replies and DMs.</span>
        </div>
        <div>
          <strong>Vercel: website</strong>
          <span className="muted">Login, dashboard, automation editor, the webhook Meta calls, and these pages.</span>
        </div>
        <div>
          <strong>Render: worker</strong>
          <span className="muted">Always-on process that sends the queued replies and DMs, paced to stay safe.</span>
        </div>
        <div>
          <strong>Render: PostgreSQL</strong>
          <span className="muted">The database both of them share.</span>
        </div>
      </div>
      <p>
        <strong>Why two hosts?</strong> Vercel runs the website as serverless functions that pause between requests. That
        is perfect for pages and webhooks, but the sending queue must run every few seconds, so it lives on Render as a
        background worker. Render also hosts the database, because Vercel can&apos;t keep a database file between requests.
      </p>
      <p>
        Nothing else is involved. The only outside service the code talks to is Meta&apos;s Instagram API.
      </p>
      <p className="small muted">
        Prefer one host? The whole app also runs as a single Render web service (start command <code>npm start</code>), in
        which case the website sends the queue itself and no worker is needed. A free Render web service sleeps after 15
        minutes without visits, so use a paid one.
      </p>

      <h2 id="cost">What it costs</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Piece</th><th>Plan</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Website</td>
              <td>Vercel Hobby (free)</td>
              <td>Hobby is for personal, non-commercial use. Running it for a business or for clients needs Vercel Pro.</td>
            </tr>
            <tr>
              <td>Worker</td>
              <td>Render Starter (paid)</td>
              <td>Render has no free plan for background workers.</td>
            </tr>
            <tr>
              <td>Database</td>
              <td>Render Postgres Basic (paid)</td>
              <td>Render&apos;s free database is deleted 30 days after it&apos;s created, with your data. Use it only to try things out.</td>
            </tr>
            <tr>
              <td>Meta / Instagram API</td>
              <td>Free</td>
              <td>No charge for the API.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Check current prices on <a href="https://vercel.com/pricing">vercel.com/pricing</a> and{" "}
        <a href="https://render.com/pricing">render.com/pricing</a>.
      </p>

      <h2 id="steps">Step by step</h2>
      <p>You need: a GitHub account, a Facebook account (for Meta for Developers), and an Instagram Business or Creator account that is public.</p>

      <h3>1. Copy the code to your GitHub</h3>
      <p>Fork or clone the repository into your own GitHub account. Vercel and Render deploy from it.</p>

      <h3>2. Create the Meta app</h3>
      <ol>
        <li>Go to <a href="https://developers.facebook.com/apps">developers.facebook.com/apps</a> → <strong>Create app</strong> → use case <strong>Manage messaging &amp; content on Instagram</strong>.</li>
        <li>Open <strong>Use cases → Instagram → Customize → API setup with Instagram business login</strong>.</li>
        <li>Copy the <strong>Instagram app ID</strong> and <strong>Instagram app secret</strong> from the top of that page. Not the Facebook App ID at the top of the dashboard.</li>
        <li>Add the permissions <code>instagram_business_basic</code>, <code>instagram_business_manage_comments</code> and <code>instagram_business_manage_messages</code>.</li>
      </ol>

      <h3>3. Make your secret keys</h3>
      <p>Run this three times and keep the results. You&apos;ll paste the same values into both Vercel and Render.</p>
      <pre><code>openssl rand -hex 32</code></pre>
      <p className="small muted">
        Or run <code>npm run setup</code> on your computer and copy <code>SESSION_SECRET</code>, <code>TOKEN_ENCRYPTION_KEY</code>{" "}
        and <code>WEBHOOK_VERIFY_TOKEN</code> from the <code>.env</code> file it creates.
      </p>

      <h3>4. Render: database and worker</h3>
      <ol>
        <li>On <a href="https://dashboard.render.com">dashboard.render.com</a> choose <strong>New → Blueprint</strong> and pick your repository. Render reads <code>render.yaml</code> and creates the database <code>autodm-db</code> and the worker <code>autodm-worker</code>.</li>
        <li>Render asks for the settings marked in the table below. For <code>APP_URL</code>, enter <code>https://YOUR-PROJECT.vercel.app</code> using the project name you&apos;ll pick on Vercel. You can change it later.</li>
        <li>After the first deploy, open <strong>autodm-db → Connect → External Database URL</strong> and copy it. Vercel needs it in the next step.</li>
      </ol>

      <h3>5. Vercel: the website</h3>
      <ol>
        <li>On <a href="https://vercel.com/new">vercel.com/new</a> import your repository. Vercel detects Next.js; leave the build settings as they are.</li>
        <li>
          Under <strong>Environment Variables</strong>, add every setting from the table below. For <code>DATABASE_URL</code> use Render&apos;s
          External Database URL with this added to the end:
          <pre><code>?sslmode=require&amp;connection_limit=3</code></pre>
        </li>
        <li>Click <strong>Deploy</strong>. Your address is shown when it finishes, for example <code>https://autodm-yourname.vercel.app</code>.</li>
        <li>If it differs from what you guessed, update <code>APP_URL</code> in both Vercel and Render, then redeploy both.</li>
      </ol>

      <h3>6. Paste your URLs into Meta</h3>
      <p>Use the <a href="#meta">table of Meta URLs</a> below. Then, under <strong>Configure webhooks</strong>, enter your <code>WEBHOOK_VERIFY_TOKEN</code>, click <strong>Verify and save</strong>, and subscribe to <strong>comments</strong>, <strong>messages</strong> and <strong>messaging_postbacks</strong>.</p>

      <h3>7. Log in</h3>
      <ol>
        <li>In the Meta dashboard: <strong>App roles → Roles → Add people → Instagram Tester</strong>, and add your Instagram username.</li>
        <li>Accept the invite on instagram.com: <strong>Settings → Website permissions → Apps and websites → Tester invites</strong>.</li>
        <li>In the Instagram app, turn on <strong>Settings → Messages and story replies → Message controls → Connected tools → Allow access to messages</strong>.</li>
        <li>Open your Vercel address and click <strong>Continue with Instagram</strong>.</li>
      </ol>

      <h2 id="env">Settings</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Setting</th><th>Value</th><th>Vercel</th><th>Render</th></tr>
          </thead>
          <tbody>
            <tr><td><code>APP_URL</code></td><td>Your Vercel address, https, no trailing slash</td><td>✓</td><td>✓</td></tr>
            <tr><td><code>DATABASE_URL</code></td><td>Vercel: Render&apos;s External URL + <code>?sslmode=require&amp;connection_limit=3</code>. Render: filled in automatically.</td><td>✓</td><td>auto</td></tr>
            <tr><td><code>INSTAGRAM_APP_ID</code></td><td>Instagram app ID (step 2)</td><td>✓</td><td>✓</td></tr>
            <tr><td><code>INSTAGRAM_APP_SECRET</code></td><td>Instagram app secret (step 2)</td><td>✓</td><td>✓</td></tr>
            <tr><td><code>WEBHOOK_VERIFY_TOKEN</code></td><td>Secret from step 3</td><td>✓</td><td>✓</td></tr>
            <tr><td><code>SESSION_SECRET</code></td><td>Secret from step 3</td><td>✓</td><td>✓</td></tr>
            <tr><td><code>TOKEN_ENCRYPTION_KEY</code></td><td>Secret from step 3. Must be identical on both, or the worker can&apos;t read saved logins.</td><td>✓</td><td>✓</td></tr>
            <tr><td><code>ALLOWED_IG_USERNAMES</code></td><td>Your Instagram username, without @ (comma-separate several). Only these accounts can log in; anyone else is turned away before anything is saved. Each name is tied to the first account that logs in with it: if you rename your account, add the new name and keep the old one listed, and whoever takes your old name can&apos;t get in.</td><td>✓</td><td></td></tr>
            <tr><td><code>APP_NAME</code></td><td>The name people see, e.g. your brand</td><td>✓</td><td></td></tr>
            <tr><td><code>OPERATOR_NAME</code></td><td>Your name or company, shown in the Privacy policy and Terms</td><td>✓</td><td></td></tr>
            <tr><td><code>CONTACT_EMAIL</code></td><td>Where people can reach you about their data</td><td>✓</td><td></td></tr>
            <tr><td><code>SOURCE_CODE_URL</code></td><td>Optional: your repository link, shown in the footer</td><td>✓</td><td></td></tr>
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Optional sending limits (<code>MAX_DMS_PER_HOUR</code>, <code>MAX_PUBLIC_REPLIES_PER_HOUR</code>, <code>MIN_SEND_GAP_MS</code>) go on
        Render, where the sending happens. The defaults are already safe.
      </p>

      <h2 id="meta">Meta URLs</h2>
      {filled ? (
        <p>These are filled in with this copy&apos;s address ({base}). Paste each one into the Meta App Dashboard.</p>
      ) : (
        <p>
          Replace <code>https://YOUR-APP.vercel.app</code> with your address. Once <code>APP_URL</code> is set to an https address,
          this table shows your real URLs.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Where in the Meta dashboard</th><th>URL</th></tr>
          </thead>
          <tbody>
            {metaUrls.map(([where, url]) => (
              <tr key={where}>
                <td>{where}</td>
                <td><code>{url}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        The redirect URI must match exactly: https, no trailing slash. Meta accepts either the data deletion callback or the
        instructions page; setting the callback is enough, and the instructions page covers people who comment.
      </p>

      <h2 id="review">Going live</h2>
      <p>
        Until the app is Live, only testers can log in, and Meta doesn&apos;t deliver real comment events. To make comment
        triggers work for real:
      </p>
      <ol>
        <li>Fill in <code>APP_NAME</code>, <code>OPERATOR_NAME</code> and <code>CONTACT_EMAIL</code>, and read the <Link href="/privacy">Privacy policy</Link>, <Link href="/terms">Terms</Link> and <Link href="/data-deletion">Data deletion</Link> pages so they&apos;re accurate for you.</li>
        <li>In <strong>App settings → Basic</strong>, add an app icon (1024 × 1024), a category and the URLs above.</li>
        <li>Complete <strong>Business verification</strong>.</li>
        <li>
          Request <strong>Advanced Access</strong> for the three permissions in <strong>App Review</strong>. Meta asks for a screen
          recording: show logging in, creating an automation, commenting the keyword from another account, and the reply and
          DM arriving. Explain that the app answers comments that contain keywords the account owner chose and sends the
          commenter the link they asked for.
        </li>
        <li>Switch the app to <strong>Live</strong>.</li>
      </ol>

      <h2 id="help">Problems</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>What you see</th><th>What to do</th></tr>
          </thead>
          <tbody>
            <tr><td>&quot;Invalid redirect_uri&quot; on Instagram</td><td>The OAuth redirect URI in Meta must equal <code>APP_URL</code> + <code>/api/auth/instagram/callback</code> exactly.</td></tr>
            <tr><td>&quot;Invalid platform app&quot;</td><td>You used the Facebook App ID. Use the Instagram app ID (step 2).</td></tr>
            <tr><td>&quot;@name can&apos;t use this copy&quot; after logging in</td><td>Add that username to <code>ALLOWED_IG_USERNAMES</code> on Vercel and redeploy. If the name is already listed, another Instagram account logged in with it first.</td></tr>
            <tr><td>Home page says &quot;Almost there&quot;</td><td>A required setting is empty in Vercel. Add it and redeploy.</td></tr>
            <tr><td>Home page says the database is a local file</td><td><code>DATABASE_URL</code> on Vercel still points to SQLite. Use the Render URL.</td></tr>
            <tr><td>Vercel build fails at Prisma</td><td>Check <code>DATABASE_URL</code> starts with <code>postgresql://</code> and that the Render worker deployed first (it creates the tables).</td></tr>
            <tr><td>Webhook &quot;Verify and save&quot; fails</td><td>The Vercel deploy must be finished and <code>WEBHOOK_VERIFY_TOKEN</code> must match.</td></tr>
            <tr><td>Activity shows &quot;Queued&quot; and nothing sends</td><td>The Render worker isn&apos;t running. Open its logs; you should see <code>[autodm] Worker started</code>.</td></tr>
            <tr><td>Comments don&apos;t trigger anything</td><td>The app must be Live with Advanced Access, the account public, and the automation switched on.</td></tr>
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Running it on your own computer for testing instead? See <code>docs/SETUP.md</code> in the repository.
      </p>
    </main>
  );
}
