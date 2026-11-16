# AutoDM

Open-source Instagram comment auto-reply and auto-DM, with an optional "follow to get the link" gate.

> **I built this for my own Instagram and it works for me. You're welcome to use it too.**
>
> You run **your own copy**, with your own Meta app, your own hosting and your own database. I don't host it for
> anyone, I never see your data or your followers' data, and I don't offer support, fixes or any guarantee.
> It's provided "as is" under the [MIT License](LICENSE): use it at your own risk, follow
> [Meta's Platform Terms](https://developers.facebook.com/terms/) and Instagram's rules, and you're responsible for
> what your copy sends and for any action Meta takes on your account.
>
> Not affiliated with, endorsed by, or sponsored by Meta or Instagram. Instagram is a trademark of Meta Platforms, Inc.

- **Triggers:** keywords (case-insensitive, whole words) or any comment
- **Where:** specific reels/posts, or all posts & reels (including future ones)
- **Public reply** on the comment, picked at random from your variations
- **Auto-DM** with a button, then the link
- **Ask to follow** before sending the link, with a retry limit and a "send anyway / don't send" choice
- Personal: only the Instagram accounts you list in `ALLOWED_IG_USERNAMES` can log in. Anyone else is turned away
  before anything about them is saved, so your copy never holds other people's data

Uses **only Meta's official Instagram API**. No scraping, no password sharing, no third-party services.

## Quick start

```bash
npm install
npm run setup   # creates .env (with generated secrets) and the local database
npm run dev
```

Then follow **[docs/SETUP.md](docs/SETUP.md)** to create the Meta app, fill in the two Instagram keys, and put your
Instagram username in `ALLOWED_IG_USERNAMES`.
The home page shows exactly which settings are still missing.

```bash
npm test        # full flow + safety rules, Instagram simulated, no account needed
```

## How the flow works

```
someone comments "LINK" on your reel
  ├─ public reply on the comment                                      [optional]
  └─ DM (Meta allows exactly one per comment): opening message + button
        user taps the button  ──► opens the 24h window + consent for the follow check
          ├─ ask-to-follow OFF ─────────────────────────────► link DM
          └─ ask-to-follow ON: does the user follow you? (is_user_follow_business)
                ├─ yes ─────────────────────────────────────► link DM
                └─ no  ─► "Follow us" [Visit profile] [I'm following ✅]
                          tap → check again (up to N times), then send anyway | stop
```

If several automations match a comment, a specific-post automation wins over an all-posts one, and newer wins over older.

## Keeping accounts safe

The app follows Meta's documented rules and stays well under its limits:

| Rule | How AutoDM handles it |
|---|---|
| One DM per comment, within 7 days | Exactly one private reply per comment; unsent ones expire before day 7 |
| More DMs only within 24h of the user's message | Everything after the first DM is a direct answer to the user's own tap |
| 750 private replies/hour per account (Meta's ceiling) | Paced queue, default cap **200 DMs/hour** and **100 public replies/hour**, 2s minimum gap |
| Rate-limit errors from Meta | Backs off (15 min and longer); never hammers |
| Revoked/expired login | Account pauses sending and the dashboard asks to reconnect; nothing is lost for 7 days |
| No spam | One run per person per automation by default; public replies rotate; a short human-like delay before replying |
| Webhook security | Every webhook is verified against your app secret; Meta's retries are de-duplicated |
| Data deletion (required by Meta) | Deauthorize + data-deletion callbacks, a "Delete my data" button, and a privacy page |

No tool can *guarantee* an account is never restricted, since Meta makes the final call. Keep the defaults,
send people what they asked for, and don't use "any comment" triggers to push unrelated promotions.

## What it connects to

| | |
|---|---|
| **Runtime services** | Meta only: `graph.instagram.com`, `api.instagram.com`, `www.instagram.com` (login) |
| **Libraries** (run inside the app, no accounts or keys) | Next.js, React, Prisma, Zod |
| **Database** | SQLite file locally; PostgreSQL on Render when hosted (picked automatically from `DATABASE_URL`) |
| **Hosting** | Vercel (website) + Render (worker and database). See [docs/DEPLOY.md](docs/DEPLOY.md) |
| **Not used** | No analytics, tracking, CDNs, web fonts, email or payment services |

Notes:
- `npm install` downloads packages from the npm registry, and Prisma downloads its database engine from Prisma's servers. That happens once, at install time.
- The Next.js and Prisma command-line tools send anonymous usage stats by default; the `.env` produced by `npm run setup` turns both off.
- For local testing you need a tunnel (ngrok, cloudflared, …) because Meta only talks to public https URLs. You don't need it on a real server.

## Code map

| Path | What |
|---|---|
| `src/lib/engine.ts` | Comment → DM → follow → link state machine, queue, safety rules |
| `src/lib/worker.ts` | Background loop that drains the send queue (inside the server, or `npm run worker` on Render) |
| `src/lib/matching.ts` | Keyword / post matching |
| `src/lib/instagram.ts` | Instagram API client (login, media, replies, messages, follow check) |
| `src/app/api/webhooks/instagram` | Webhook verification + signature check |
| `src/app/api/meta/*` | Meta deauthorize and data-deletion callbacks |
| `src/components/AutomationForm.tsx` | Automation editor with live DM preview |
| `src/app/privacy`, `terms`, `data-deletion` | Pages Meta requires; they read `APP_NAME`, `OPERATOR_NAME`, `CONTACT_EMAIL` |
| `src/app/docs` | In-app hosting guide with this copy's Meta URLs filled in |
| `render.yaml`, `scripts/worker.ts` | Render blueprint and the standalone worker |
| `test/` | Engine, matching and crypto tests |

## Hosting

The website runs on **Vercel** and the sending worker and PostgreSQL database run on **Render**.
Every step, the costs, and the URLs to paste into Meta are in **[docs/DEPLOY.md](docs/DEPLOY.md)**. The same guide is
built into the app at `/docs`, with your own URLs filled in.

Pages Meta asks for, all public:

| Page | Path |
|---|---|
| Privacy policy | `/privacy` |
| Terms of service | `/terms` |
| Data deletion instructions | `/data-deletion` |
| Data deletion status (linked from Meta's callback) | `/deletion?code=...` |

## License

[MIT](LICENSE). Free to use, copy and change, provided "as is" without warranty of any kind.
