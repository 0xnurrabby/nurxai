<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=0,6,17&height=180&section=header&text=NurXai&fontSize=50&fontColor=000000&fontAlignY=38&desc=AI+reply+suggestions+for+X+with+a+Chrome+extension+and+Next.js+dashboard&descAlignY=58&descSize=14&animation=fadeIn" width="100%"/>

<div align="center">

![Extension](https://img.shields.io/badge/Extension-Manifest+V3-C7D2FE?style=for-the-badge&labelColor=1a1a1a&logoColor=1a1a1a)
[![Dashboard](https://img.shields.io/badge/Dashboard-Next.js+14-BBF7D0?style=for-the-badge&labelColor=1a1a1a&logoColor=1a1a1a)](https://nurxai.xyz)
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

## Setup

Dashboard env file:

```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require
JWT_SECRET=generate_a_long_random_secret
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
PUBLIC_URL=http://localhost:3000
AI_GATEWAY_API_KEY=vai_...
AI_GATEWAY_MODEL=your_grok_model_id
AI_GATEWAY_SEARCH_MODEL=your_gemini_model_id
AI_GATEWAY_GENERATION_MODEL=your_gpt_model_id
BASE_PAY_RECIPIENT=0x_your_usdc_receiver
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
ADMIN_EMAILS=owner@example.com,second-admin@example.com
MIN_EXTENSION_VERSION=2.0.15
EXTENSION_UPDATE_URL=https://chromewebstore.google.com/detail/odapbgkbdpalphekkmibliclmedgmlhb
```

If you do not need billing locally, leave NOWPayments values empty. `NOWPAYMENTS_KEY`
is still accepted for older deployments, but `NOWPAYMENTS_API_KEY` is preferred.

Set `MIN_EXTENSION_VERSION` only after that version is approved and live in the
Chrome Web Store. Any extension request below that version is blocked before AI
generation starts.

Production uses Supabase Postgres through Prisma. Point `DATABASE_URL` at the
Supabase direct connection string, then run:

```powershell
cd dashboard
npx prisma migrate deploy
npx prisma generate
```

Cloudflare Workers deployment uses OpenNext from the `dashboard` directory:

```powershell
cd dashboard
npm run cf:build
npm run deploy
```

The `nurxai` Worker uses the `HYPERDRIVE` binding declared in
`dashboard/wrangler.jsonc`. It is deployed as a preview and disaster-recovery
target; production traffic for `nurxai.xyz` is served by Vercel behind the
Cloudflare proxy. Do not attach the production domain to the Worker on the Free
plan: the OpenNext application exceeds the 10 ms CPU limit during some cold
starts. Runtime credentials belong in Worker secrets and must never be
committed.

Admin access is controlled by `ADMIN_EMAILS`; database `isAdmin` is only synced
for display and cannot grant access by itself.

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
