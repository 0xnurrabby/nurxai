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

## Render Deployment

The dashboard deploys to Render as a Node web service plus Render Postgres.
`render.yaml` in the repository root describes both resources and the required
environment variables. Push to `main` triggers an automatic deploy.

1. Provision PostgreSQL and restore the current production backup if existing users, subscriptions, balances, and sessions must survive the move.
2. Add the variables documented in `dashboard/.env.example` in the Render Dashboard. Store secrets in Render, never in Git.
3. Add `nurxai.xyz` as a custom domain, then move DNS from the previous host. The published extension calls that exact origin, so a different domain does not support the current Store release.
4. Add `https://nurxai.xyz` to the Google web client's Authorized JavaScript origins and set `NEXT_PUBLIC_GOOGLE_DIRECT_AUTH=true`.
5. Set the NOWPayments IPN callback to `https://nurxai.xyz/api/billing/webhook` when NOWPayments billing is enabled.
6. Verify `https://nurxai.xyz/api/health` returns `status: ok` before changing DNS or proxy traffic.
7. Billing reconciliation must be scheduled separately (for example a Render cron job) with `Authorization: Bearer $CRON_SECRET` against `/api/billing/reconcile`.

Use the same `JWT_SECRET` and database when moving an existing installation.
Changing either invalidates Store-extension sessions. Keep
`MIN_EXTENSION_VERSION` at or below the version currently approved in the
Chrome Web Store. The published version is presently `2.0.17`.

Free Render Postgres instances expire after 30 days; use a paid database plan
or an external PostgreSQL provider for production data. Free web services spin
down after inactivity, so ping `/api/health` periodically (UptimeRobot or a
similar monitor) to keep the API warm.

Production migrations run automatically during the Render build. Do not expose
a production database or production secrets to preview environments.

## Extension Cutover

The published extension has `https://nurxai.xyz` compiled into
`extension/scripts/config.js`. A server move therefore requires moving that
domain to the new deployment, not editing the already-published extension.
Keep the same `JWT_SECRET` and database so tokens issued by the previous
deployment remain valid; then `LEGACY_AUTH_FALLBACK_ENABLED=false` is safe.
Set `LEGACY_AUTH_FALLBACK_ENABLED=true` and point `LEGACY_AUTH_CHECK_URL` at
the old authority only if it must stay reachable for legacy tokens during a
gradual move.

## Manual Database Setup

For a Render or other production deployment, configure `DATABASE_URL` and run:

```powershell
cd dashboard
npm ci
npm run validate:env -- --strict
npm run migrate:deploy
npx prisma generate
npm run build
```

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
