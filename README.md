# 🤖 Baymax-Shoppey

**Your private autonomous affiliate marketing AI** — runs your AliExpress affiliate store, writes & schedules TikTok/YouTube content, tracks clicks and sales. One owner. Full autopilot.

Live at **baymax-shoppey.vercel.app**

## ✨ What it does

| Area | Details |
|---|---|
| 🛍️ **Products** | Paste an AliExpress affiliate link → title, price & photo imported automatically |
| ✍️ **AI content** | Gemini (primary) + Groq (fallback) write TikTok scripts & YouTube Shorts — hooks, CTAs, hashtags |
| ⚡ **Autopilot** | Generates & schedules posts at your configured times, publishes via official APIs |
| 📱 **Publishing** | TikTok Content Posting API (photo/video) + YouTube Data API (OAuth connect in Settings) |
| 📊 **Tracking** | Every short link (`/c/:code`) logs clicks; sales recorded manually or by Baymax in chat |
| 💬 **Chat** | MUSE-style chat — Baymax can *take actions*: add products, generate/schedule posts, record sales |
| 🔒 **Private** | Password gate (hashed, server-side), single-owner store, first-run setup + mascot tour |

## 🧱 Stack

- **Frontend:** Next.js 15 (App Router) + React 19 + Tailwind CSS 4 — palette sampled from [baymaxhq.vercel.app](https://baymaxhq.vercel.app)
- **Backend:** Fastify 5 (TypeScript) — mounted in-process under `/api/*` on Vercel, or standalone via Docker/Render
- **Database:** Supabase (Postgres) — project `shoppey`, RLS enabled, service key server-side only
- **AI:** Gemini `gemini-2.5-pro` → Groq `llama-3.3-70b-versatile` fallback → demo mode without keys

## 🚀 Run locally

```bash
npm install
cp .env.example .env.local   # fill SUPABASE_SERVICE_KEY (+ optional AI keys)
npm run dev                  # http://localhost:3000
```

First visit → create your master password (stored as bcrypt hash) → 5-step tour → dashboard.

Standalone API only (optional, e.g. Render):

```bash
npm run server               # Fastify on :4000
API_ORIGIN=http://localhost:4000 npm run dev   # Next proxies /api → :4000
```

## 🔐 Environment variables

| Key | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | ✅ | `https://opcdbpbnhabdcqkfrjrt.supabase.co` |
| `SUPABASE_SERVICE_KEY` | ✅ | Server-side secret key (Supabase dashboard → Settings → API) |
| `GEMINI_API_KEY` | ⭐ | Primary AI brain |
| `GROQ_API_KEY` | ⭐ | Fallback AI |
| `APP_URL` | ✅ | `https://baymax-shoppey.vercel.app` |
| `CRON_SECRET` | ✅ | Auth for `/api/cron/tick` |
| `YOUTUBE_CLIENT_ID/SECRET` | optional | YouTube OAuth connect |
| `TIKTOK_CLIENT_KEY/SECRET` | optional | TikTok OAuth connect |
| `ALIEXPRESS_APP_KEY/SECRET/TRACKING_ID` | optional | Official affiliate API |

## 📁 Structure

```
app/                 # Next.js UI (login, dashboard, chat, products, content, analytics, settings)
components/          # AppShell, LoginGate, Tour (mascot), UI kit
pages/api/[[...path]].ts   # Fastify bridge (every /api/* → Fastify)
server/src/          # Fastify API: routes/, services/ (ai, agent, publishers, scheduler)
app/c/[code]/route.ts      # Click-tracker redirect
Dockerfile, render.yaml    # optional standalone backend
vercel.json               # cron: autopilot tick every 6h
```

## 🗓️ Autopilot loop

1. Lazy tick on dashboard reads + Vercel cron (`/api/cron/tick`, every 6h)
2. Publishes anything whose `scheduled_at` has passed (TikTok photo/video, YouTube video)
3. Generates the next batch for active products when today's quota isn't met
