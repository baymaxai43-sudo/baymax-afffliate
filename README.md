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

Backend standalone (this is what Render runs):

```bash
npm run server               # Fastify on :4000 (Docker/Render entry: see Dockerfile)
npm run hash -- "my-password"   # generate OWNER_PASSWORD_HASH for Render
```

Frontend pointed at that backend:

```bash
API_ORIGIN=http://localhost:4000 npm run dev   # Next proxies /api + /c → :4000
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

## 📚 API Reference

Every endpoint (auth, products, content, analytics, chat, settings, OAuth, tracking, cron), request/response examples, the AI request flow, and CORS rules → **[docs/API.md](docs/API.md)**.

## 🏗️ Architecture (Vercel + Render)

```
                        ┌──────────────────────────────────────┐
   browser ──────────►  │  Vercel — baymax-shoppey.vercel.app  │
                        │  Next.js frontend (UI only)          │
                        │  • landing / dashboard / chat / …    │
                        │  • proxies /api/* and /c/* ──────────────┐
                        └──────────────────────────────────────┘  │
                                                                  ▼
                        ┌──────────────────────────────────────┐
                        │  Render — baymax-shoppey-api         │
                        │  Fastify backend (all logic)         │
                        │  • OWNER_PASSWORD_HASH (hashed pw)   │
                        │  • auth, products, content, chat     │
                        │  • AI: Gemini → Groq                 │
                        │  • TikTok / YouTube publishers       │
                        │  • scheduler (autopilot)             │
                        └──────────────┬───────────────────────┘
                                       ▼
                        ┌──────────────────────────────────────┐
                        │  Supabase project “shoppey”          │
                        │  products · content · events ·       │
                        │  connections · chat · settings       │
                        └──────────────────────────────────────┘
```

- **Password**: bcrypt hash stored in the **Render env var `OWNER_PASSWORD_HASH`** (generate with `npm run hash -- "your-password"`). The frontend never sees it — it POSTs to the backend, which compares hashes and returns a JWT cookie.
- **Split mode**: set `API_ORIGIN=https://<your-render-service>.onrender.com` on Vercel → all `/api/*` and `/c/:code` requests proxy to Render.
- **All-in-one mode** (no `API_ORIGIN`): the same Fastify app runs inside Next.js on Vercel — useful before Render exists, or with `LOCAL_STORE=1` for offline dev.

### Deploy the backend to Render
1. Push the repo → Render → **New → Blueprint** → pick this repo (`render.yaml` is included)
2. Fill the `sync: false` env vars: `SUPABASE_SERVICE_KEY`, `OWNER_PASSWORD_HASH`, `GEMINI_API_KEY`, `GROQ_API_KEY`
3. Copy the service URL → set `API_ORIGIN` on Vercel → redeploy the frontend

## 🗓️ Autopilot loop

1. Lazy tick on dashboard reads + Vercel cron (`/api/cron/tick`, every 6h)
2. Publishes anything whose `scheduled_at` has passed (TikTok photo/video, YouTube video)
3. Generates the next batch for active products when today's quota isn't met
