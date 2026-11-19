# Deploying: Vercel (website) + Render (worker and database)

The same guide is built into the app at **`/docs`** ("Run your own copy" in the footer). Once `APP_URL` is set,
that page fills in your exact Meta URLs. Keep the two in sync when you change either.

## How it's hosted

```
Instagram (Meta) ──webhooks──▶  Vercel: website + API     ──┐
       ▲                        (login, dashboard, webhook) │
       │                                                     ▼
       └──── replies & DMs ───  Render: worker  ◀────▶  Render: PostgreSQL
                                (sends the queue)
```

- **Vercel** runs the Next.js app: pages, login, the dashboard, and the webhook Meta calls. Vercel functions pause between
  requests, so the app doesn't start its sending loop there (it detects `VERCEL` automatically).
- **Render** runs `npm run worker`, an always-on process that sends queued replies and DMs every few seconds within
  the safety limits. It also hosts the PostgreSQL database both sides share.
- The only outside service the code talks to is Meta's Instagram API.

**One host instead?** The whole app runs as a single Render web service (`npm ci && npm run db:push && npm run build`, start
`npm start`). The website then sends the queue itself. A free Render web service sleeps after 15 minutes without
traffic, so use a paid instance.

## What it costs

| Piece | Plan | Notes |
|---|---|---|
| Website | Vercel Hobby (free) | Personal, non-commercial use only. Business or client use needs Vercel Pro. |
| Worker | Render Starter (paid) | Render has no free plan for background workers. |
| Database | Render Postgres Basic (paid) | Render's free database is deleted 30 days after creation, along with its data. |
| Instagram API | Free | |

Current prices: https://vercel.com/pricing and https://render.com/pricing.

## Step by step

1. **Your copy of the code.** Fork or clone the repository into your GitHub account.
2. **Meta app.** Follow steps 2 and 3 of [SETUP.md](SETUP.md): you need the **Instagram** app ID and secret and the three
   permissions.
3. **Secrets.** Run `openssl rand -hex 32` three times, for `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` and `WEBHOOK_VERIFY_TOKEN`.
   Or run `npm run setup` locally and copy them from `.env`. The same values go to both Vercel and Render.
4. **Render.** Choose New → Blueprint and pick your repository. [`render.yaml`](../render.yaml) creates `autodm-db` and
   `autodm-worker`. Enter the values Render asks for. For `APP_URL`, use `https://<your-project>.vercel.app`. After it
   deploys, copy **autodm-db → Connect → External Database URL**.
5. **Vercel.** Import the repository at https://vercel.com/new. Leave the build settings alone (`npm run build` picks the
   PostgreSQL schema automatically). Add the environment variables below, then click Deploy.
   If the final address differs from your guess, update `APP_URL` on both and redeploy both.
6. **Meta URLs.** Paste these into the Meta App Dashboard. `/docs` in your deployed app lists them with your address filled in.

   | Where | URL |
   |---|---|
   | Business login settings → OAuth redirect URIs | `<APP_URL>/api/auth/instagram/callback` |
   | Business login settings → Deauthorize callback URL | `<APP_URL>/api/meta/deauthorize` |
   | Business login settings → Data deletion request URL | `<APP_URL>/api/meta/data-deletion` |
   | Configure webhooks → Callback URL (+ your `WEBHOOK_VERIFY_TOKEN`) | `<APP_URL>/api/webhooks/instagram` |
   | App settings → Basic → Privacy policy URL | `<APP_URL>/privacy` |
   | App settings → Basic → Terms of service URL | `<APP_URL>/terms` |
   | App settings → Basic → User data deletion (instructions URL) | `<APP_URL>/data-deletion` |

   Subscribe the webhook to **comments**, **messages**, **messaging_postbacks**.
7. **Log in.** Add yourself as an Instagram Tester, accept the invite, turn on "Allow access to messages" in Instagram,
   then open your Vercel address and click Continue with Instagram.
8. **Going live.** Set `APP_NAME`, `OPERATOR_NAME`, `CONTACT_EMAIL` and review the legal pages. Then add an app icon,
   complete Business verification, request Advanced Access in App Review, and switch to Live. See SETUP.md step 9.

## Environment variables

| Setting | Vercel | Render worker |
|---|---|---|
| `APP_URL` | ✓ | ✓ |
| `DATABASE_URL` | Render External URL + `?sslmode=require&connection_limit=3` | set by the blueprint |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | ✓ | ✓ |
| `WEBHOOK_VERIFY_TOKEN`, `SESSION_SECRET` | ✓ | ✓ |
| `TOKEN_ENCRYPTION_KEY` | ✓ | ✓ (**must be identical**, it decrypts the saved Instagram logins) |
| `ALLOWED_IG_USERNAMES` | ✓ your Instagram username (comma-separate several); nobody else can log in | |
| `APP_NAME`, `OPERATOR_NAME`, `CONTACT_EMAIL` | ✓ (shown on the legal pages) | |
| `SOURCE_CODE_URL` | optional, footer link | |
| `MAX_DMS_PER_HOUR`, `MAX_PUBLIC_REPLIES_PER_HOUR`, `MIN_SEND_GAP_MS` | | optional |

## Database: SQLite locally, PostgreSQL when hosted

`scripts/prisma.mjs` picks the schema from `DATABASE_URL`: `prisma/schema.prisma` (SQLite) for `file:` URLs, and
`prisma/postgres/schema.prisma` for `postgres://` URLs. The two files must stay identical apart from the provider
(`npm test` checks this). The Render worker's build runs `npm run db:push`, which creates or updates the tables. It
refuses changes that would lose data.

## Troubleshooting

| What you see | Fix |
|---|---|
| Landing page: "DATABASE_URL is a local file" | Vercel still uses SQLite. Set the Render URL. |
| Vercel build fails at Prisma | `DATABASE_URL` must start with `postgresql://`. Deploy Render first so the tables exist. |
| Runs stay "Queued" | The Render worker isn't running. Its log should say `[autodm] Worker started`. |
| Worker log: "Worker not started, missing settings" | Add the listed variables on Render and redeploy. The worker waits instead of exiting. |
| "@name can't use this copy" after logging in | Add that username to `ALLOWED_IG_USERNAMES` on Vercel and redeploy. If the name is already listed, another Instagram account logged in with it first. |
| Logins work but sends fail with decryption errors | `TOKEN_ENCRYPTION_KEY` differs between Vercel and Render. |
