<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=0,6,17&height=180&section=header&text=NurXai&fontSize=50&fontColor=000000&fontAlignY=38&desc=AI+reply+suggestions+for+X+with+a+Chrome+extension+and+Next.js+dashboard&descAlignY=58&descSize=14&animation=fadeIn" width="100%"/>

<div align="center">

![Extension](https://img.shields.io/badge/Extension-Manifest+V3-C7D2FE?style=for-the-badge&labelColor=1a1a1a&logoColor=1a1a1a)
[![Dashboard](https://img.shields.io/badge/Dashboard-Next.js+16-BBF7D0?style=for-the-badge&labelColor=1a1a1a&logoColor=1a1a1a)](https://nurxai.xyz)
![Database](https://img.shields.io/badge/Database-Prisma-FDE68A?style=for-the-badge&labelColor=1a1a1a&logoColor=1a1a1a)
![AI](https://img.shields.io/badge/AI-GPT+%2B+Grok+%2B+Gemini-FBCFE8?style=for-the-badge&labelColor=1a1a1a&logoColor=1a1a1a)

</div>

<div align="center">
<i>A browser extension that sits on X/Twitter, reads the current post context, and asks the dashboard API for short reply ideas.</i>
</div>

---

## Features

| Feature | What it does |
| --- | --- |
| Chrome extension | Injects a reply helper on `x.com` and `twitter.com`. |
| Account dashboard | Signup, login, billing, settings, projects, and extension token handoff. |
| AI generation | Uses a GPT + Grok + Gemini stack for writing, image/context understanding, and web-aware grounding. |
| Billing hooks | NOWPayments and Base Pay routes are wired into the dashboard. |
| Local cache | Extension caches suggestions and keeps a small audit log in browser storage. |

---

## Download and Run

Dashboard:

```powershell
git clone https://github.com/0xnurrabby/nurxai.git
cd nurxai/dashboard
npm install
copy .env.example .env.local
npx prisma generate
npm run dev
```

Open `http://localhost:3000`.

Extension:

```text
1. Open chrome://extensions
2. Turn on Developer mode
3. Click Load unpacked
4. Select the nurxai/extension folder
5. Open x.com and sign in through the NurXai dashboard
```

---

## Vercel Deployment

The dashboard is self-contained for a GitHub-to-Vercel deployment. Import this
repository in Vercel and set **Root Directory** to `dashboard`. The repository
pins Node.js 22 and the production build validates configuration, generates the
Prisma client, applies pending migrations, and builds Next.js. A failed
migration fails the deployment instead of serving code against an old schema.

1. Provision PostgreSQL and restore the current production backup if existing users, subscriptions, balances, and sessions must survive the move.
2. Add the variables documented in `dashboard/.env.example` to the Vercel project. Store secrets in Vercel, never in Git.
3. Add `nurxai.xyz` as the production domain. The published extension calls that exact origin, so a different domain does not support the current Store release.
4. Add `https://nurxai.xyz` to the Google web client's Authorized JavaScript origins and set `NEXT_PUBLIC_GOOGLE_DIRECT_AUTH=true`.
5. Set the NOWPayments IPN callback to `https://nurxai.xyz/api/billing/webhook` when NOWPayments billing is enabled.
6. Deploy and verify `https://nurxai.xyz/api/health` returns `status: ok` before changing DNS or proxy traffic.

Use the same `JWT_SECRET` and database when moving an existing installation.
Changing either invalidates Store-extension sessions. Keep
`MIN_EXTENSION_VERSION` at or below the version currently approved in the
Chrome Web Store. The published version is presently `2.0.17`.

Keep the apex `nurxai.xyz` origin live without redirecting its API or
`/auth/extension` routes. If `www.nurxai.xyz` is configured, redirect `www` to
the apex, not the reverse. Set `SESSION_COOKIE_DOMAIN=nurxai.xyz` during the
cutover so cookies issued by the existing deployment can still be replaced and
deleted.

Production migrations run automatically. Preview migrations are skipped by
default to prevent schema changes. Do not expose a production database or
production secrets to Preview deployments. Set `MIGRATE_ON_PREVIEW=true` only
when Preview uses an isolated database.

Before moving a database that previously relied on runtime-created tables, run
`npm run migrate:status` against it and confirm its `_prisma_migrations` history
is complete. Do not baseline unknown migrations automatically. The production
deployment stops on migration drift so an incomplete database is never treated
as a successful release.

`vercel.json` schedules `/api/billing/reconcile` daily. Set `CRON_SECRET` in
Vercel; Vercel sends it as the cron authorization bearer token. NOWPayments
account credentials are optional but allow reconciliation to discover a hosted
invoice after a missed webhook.

`ADMIN_EMAILS` is authoritative for admin access. The database `isAdmin` field
is display state and cannot grant access by itself.

## Extension Cutover

The published extension has `https://nurxai.xyz` compiled into
`extension/scripts/config.js`. A server move therefore requires moving that
domain to the new Vercel project, not editing the already-published extension.
Keep `LEGACY_STORE_VERSION=2.0.17`, set `LEGACY_AUTH_FALLBACK_ENABLED=true`, and
keep `LEGACY_AUTH_CHECK_URL` reachable while tokens issued by the previous
Cloudflare authority remain active. Disable the fallback after those tokens
have expired. The dashboard refuses to delegate back to its own origin.

If Cloudflare remains in front of the domain, point its origin at the new Vercel
deployment and preserve request headers. The repository's optional edge router
has a deployment-specific `VERCEL_ORIGIN` in `wrangler.edge.jsonc`; update and
redeploy it during a Vercel-project move. Alternatively, point DNS directly to
Vercel and remove the Worker route.

## Manual Database Setup

For a non-Vercel production deployment, configure `DATABASE_URL` and run:

```powershell
cd dashboard
npm ci
npm run validate:env -- --strict
npm run migrate:deploy
npx prisma generate
npm run build
```

Cloudflare Workers remains an optional OpenNext target:

```powershell
cd dashboard
npm run cf:build
npm run deploy
```

The paid Worker uses the `HYPERDRIVE` binding declared in
`dashboard/wrangler.jsonc`. Runtime credentials belong in Worker secrets and
must never be committed.

---

## Project Structure

```text
nurxai/
  extension/             -> Manifest V3 browser extension
  extension/scripts/     -> background, content script, config
  extension/styles/      -> injected X/Twitter styles
  dashboard/             -> Next.js dashboard
  dashboard/app/api/     -> auth, billing, extension, generate APIs
  dashboard/prisma/      -> Prisma schema
  cloudflare/             -> edge router and isolated plan probe
```

---

## Notes

- The extension points to `https://nurxai.xyz` in `extension/scripts/config.js`.
- For a fully local extension test, change `API_BASE` and `WEB_BASE` to your local or preview URL.
- Keep `JWT_SECRET`, payment keys, and AI keys out of Git.

---

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=0,6,17&height=90&section=footer" width="100%"/>

<p align="center">
  <sub>MIT License unless noted otherwise. Built by <a href="https://github.com/0xnurrabby">0xnurrabby</a>.</sub>
</p>
