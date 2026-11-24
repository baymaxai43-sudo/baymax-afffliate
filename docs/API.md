# Baymax-Shoppey — API Reference

Complete HTTP API for the Baymax-Shoppey backend (Fastify).

---

## Architecture & base URLs

```
Browser ──► https://baymax-shoppey.vercel.app/api/*   (Vercel — proxies, frontend only)
                │
                └──► https://baymax-afffliate.onrender.com/*   (Render — all logic lives here)
                          │
                          └──► Supabase "shoppey" (data)
```

| Caller | Base URL | Notes |
|---|---|---|
| Browser (normal app usage) | `https://baymax-shoppey.vercel.app/api` | Same-origin; every path below is prefixed with `/api` |
| Server-to-server / Render direct | `https://baymax-afffliate.onrender.com` | No prefix — paths exactly as listed below |
| Local dev | `http://localhost:4000` | `npm run server` (add `/api` prefix via Next proxy when using `npm run dev` with `API_ORIGIN`) |

> **Rule of thumb:** the paths in this document are the *backend* paths.
> On Vercel, prepend `/api` (e.g. backend `/products` → `https://baymax-shoppey.vercel.app/api/products`).

---

## Authentication

Single-owner system — **no signup, no users table**. A bcrypt hash of your password lives in the backend env var `OWNER_PASSWORD_HASH` (Render).

1. `POST /auth/login` with `{ "password": "..." }` → server verifies against the hash (bcrypt cost 12) and sets an **`bs_session`** cookie (JWT, `httpOnly`, `Secure`, `SameSite=Lax`, 30 days).
2. All protected endpoints accept the session in either:
   - **Cookie**: `bs_session=<token>` (used by the web app), or
   - **Header**: `Authorization: Bearer <token>` (for scripts/tools).
3. `POST /auth/logout` clears the cookie.

**Errors:** `401 { "error": "Unauthorized" }` when the token is missing/invalid.

### CORS

The backend sends `Access-Control-Allow-Origin` only for these origins (with `credentials: true`):

- `https://baymax-shoppey.vercel.app`
- `https://baymax-shoppey.vercel.app` production alias(es)
- `http://localhost:3000` (local dev)

Any other origin gets **no CORS headers** (the request is still processed — browsers are the ones that enforce CORS). The web app normally never triggers CORS at all because it calls `/api/*` on its own origin, which Vercel proxies server-side.

### Error format

```json
{ "error": "human-readable message" }
```
Status codes: `400` validation · `401` unauthorized · `403/404` not found or conflict · `409` conflict · `500` server · `502` backend unreachable (Vercel proxy only).

---

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness probe |

```json
GET /health → { "ok": true, "app": "baymax-shoppey", "ai": true }
```
`ai: false` means the **running backend process** has no `GEMINI_API_KEY`/`GROQ_API_KEY` in its environment (AI disabled) — after fixing Render env vars, the service must restart for this to flip.

---

## Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/status` | — | Gate state for the landing page |
| POST | `/auth/setup` | — | **First run only** — creates the owner session from a chosen password (409 if a password already exists) |
| POST | `/auth/login` | — | Verify password → session cookie |
| POST | `/auth/logout` | — | Clear session cookie |
| POST | `/auth/password` | ✅ | Change password (`current` + `next`) — returns 409 if password is managed by `OWNER_PASSWORD_HASH` on Render |
| POST | `/auth/tour` | ✅ | Mark the first-time tour as completed |

**GET `/auth/status`**
```json
{
  "needsSetup": false,
  "tourCompleted": false,
  "authenticated": false,
  "dbReady": true,
  "passwordSource": "render_env",   // or "database" — where the hash lives
  "app": "baymax-shoppey"
}
```
`dbReady:false` means the backend cannot reach Supabase (missing/bad `SUPABASE_SERVICE_KEY`).

**POST `/auth/setup` / `/auth/login`** — body `{ "password": "<min 8 chars>" }` → `{ "ok": true, "token": "..." }` (cookie also set).

---

## Products

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/products` | ✅ | List (≤100) · `?q=` search title/description/category · `?status=` filter |
| POST | `/products` | ✅ | Add product (from AliExpress URL or manually) |
| PATCH | `/products/:id` | ✅ | Update fields |
| DELETE | `/products/:id` | ✅ | Remove |

**POST `/products`**
```jsonc
// Either give a URL — backend scrapes title/price/image and builds the affiliate link:
{ "url": "https://www.aliexpress.com/item/123456.html" }
// Or full manual body:
{
  "title": "Wireless Earbuds",
  "description": "…", "price": 19.99, "currency": "USD",
  "image_url": "https://…", "affiliate_url": "https://s.click.aliexpress.com/…",
  "category": "electronics"
}
```
→ `201` with the created product, including `id` and `short_code` (used by `/c/:code` links).

**GET `/products`** → `{ "products": [ { "id", "title", "price", "currency", "image_url", "affiliate_url", "short_code", "status", "created_at", … } ] }`

---

## Content (posts)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/content` | ✅ | List · `?status=draft\|scheduled\|published\|failed` · `?platform=tiktok\|youtube` · `?limit=` (≤200) |
| POST | `/content/generate` | ✅ | Batch-generate posts with the AI |
| POST | `/content/:id/schedule` | ✅ | Set `scheduled_at` (ISO) → status `scheduled` |
| POST | `/content/:id/publish` | ✅ | Publish immediately to the connected platform |
| POST | `/content/:id/regenerate` | ✅ | Re-generate this post's text |
| DELETE | `/content/:id` | ✅ | Delete |

**POST `/content/generate`**
```json
{
  "product_ids": ["uuid-1"],        // required, 1–10
  "platforms": ["tiktok", "youtube"], // optional, default both
  "count": 1,                       // optional, 1–4 per product×platform
  "schedule": true                  // optional — true → status "scheduled" at next slot
}
```
→ `{ "created": [ …content rows… ], "count": 3 }`

**GET `/content`** → `{ "content": [ { "id", "platform", "format", "title", "body", "hashtags", "status", "scheduled_at", "products": { … }, … } ] }`

---

## Analytics

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/analytics/summary` | ✅ | Dashboard counters (also triggers a throttled lazy autopilot tick) |
| GET | `/analytics/timeseries` | ✅ | `?days=30` — clicks/sales per day |
| GET | `/analytics/top-products` | ✅ | Best performers |
| GET | `/analytics/sales` | ✅ | `?limit=` sales list |
| POST | `/analytics/sales` | ✅ | Record a sale `{ product_id?, value, currency?, note? }` |

**GET `/analytics/summary`**
```json
{ "products": 4, "scheduled": 6, "published": 12, "clicks7d": 58, "sales7d": 3, "revenue7d": 47.97 }
```

---

## Chat (AI assistant)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/chat/messages` | ✅ | History · `?limit=` (default recent window) |
| POST | `/chat` | ✅ | Send a message → AI reply |
| DELETE | `/chat/messages` | ✅ | Clear history |

**POST `/chat`** — body `{ "message": "…" }` (1–4000 chars)
```json
{
  "reply": "…",
  "provider": "gemini",          // "gemini" | "groq" | "error"
  "toolTrace": [ { "name": "list_products", "args": {…}, "result": "…" } ]
}
```
The agent may call **tools** (products, scheduling, analytics…) in a loop before answering — `toolTrace` shows what it did.

### How AI requests flow

```
Browser POST /api/chat (same-origin, cookie)
   └─► Vercel proxy ──► Render POST /chat
                          ├─ load recent history from Supabase
                          ├─ runAgent() ──► ai.ts gateway:
                          │     1. GEMINI_API_KEY  → generativelanguage.googleapis.com (primary)
                          │     2. GROQ_API_KEY    → api.groq.com           (fallback)
                          │     3. neither/both fail → explicit error (provider: "error", no canned replies)
                          ├─ save user + assistant rows to chat_messages
                          └─► { reply, provider, toolTrace } ──► proxy ──► Browser
```
Same gateway powers **content generation** (`/content/generate`, autopilot tick) with JSON-mode output → posts saved to `content`.

---

## Settings & autopilot

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/settings` | ✅ | AI/social config state + autopilot settings |
| PATCH | `/settings/autopilot` | ✅ | Update autopilot |
| POST | `/settings/run-now` | ✅ | Run an autopilot tick immediately |

**GET `/settings`**
```json
{
  "autopilot": { "enabled": true, "dailyPerPlatform": 2, "times": ["09:00"], "brandVoice": "…" },
  "ai": { "configured": true, "primary": "Gemini (gemini-2.5-pro)", "gemini": true, "groq": false },
  "social": { "youtube": true, "tiktok": false }
}
```
> `ai.configured:false` / `primary:"unavailable"` → the backend process has no AI keys in its env.

**PATCH `/settings/autopilot`** — any of:
```json
{ "enabled": true, "dailyPerPlatform": 2, "times": ["09:00","17:00"], "brandVoice": "witty Gen-z tone" }
```

---

## Social connections (OAuth)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/connections` | ✅ | Status of both platforms |
| GET | `/connections/:platform/start` | — | Begins OAuth (`platform` = `youtube` \| `tiktok`) → redirects to the provider |
| GET | `/connections/youtube/callback` | — | OAuth return (Google) |
| GET | `/connections/tiktok/callback` | — | OAuth return (TikTok) |
| DELETE | `/connections/:platform` | ✅ | Disconnect |

**GET `/connections`**
```json
{
  "youtube": { "configured": true, "connected": true, "channel": "My Channel" },
  "tiktok":  { "configured": false, "connected": false, "username": null }
}
```
`configured` requires `YOUTUBE_CLIENT_ID/SECRET` (or `TIKTOK_CLIENT_KEY/SECRET`) in the backend env.

---

## Click tracking

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/track/:code` | — | 302 → affiliate URL, logs a `click` event (fails open to AliExpress homepage) |

Frontend-facing equivalent: **`GET /c/:code`** on Vercel (proxied/forwarded to `/track/:code` in split mode). Use `https://baymax-shoppey.vercel.app/c/<short_code>` in your promotions.

---

## Cron (autopilot schedule)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET/POST | `/cron/tick` | Bearer `CRON_SECRET` | Runs one autopilot pass: generates + publishes due content |

```bash
curl -X POST https://baymax-afffliate.onrender.com/cron/tick \
  -H "Authorization: Bearer $CRON_SECRET"
→ { "ok": true, …tick stats }
```
Triggered daily at **09:00 UTC** by Vercel Cron (`/api/cron/tick`), and lazily by `GET /analytics/summary` (throttled).

---

## AI unavailable (missing or invalid keys)

There is **no demo mode**. When neither `GEMINI_API_KEY` nor `GROQ_API_KEY` works:

- `GET /health` → `"ai":false` (presence check at process boot)
- `GET /settings` → `ai.configured:false`, `ai.primary:"unavailable"`
- `POST /chat` → `provider:"error"` with reply `⚠️ AI request failed: <reason>…`
- `POST /content/generate` → `500 { "error": "<reason>" }`
- The backend logs `[ai] all providers failed: …` — check Render → Logs

Keys are read **once at process start** — after adding/changing them in Render: **save → let it redeploy (or Manual Deploy → Restart) → `GET /health` shows `"ai":true`**.

---

## Quick test sequence

```bash
B=https://baymax-afffliate.onrender.com

curl $B/health
curl -c jar -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"password":"YOUR_PASSWORD"}'
curl -b jar $B/settings                 # ai.configured should be true once keys are set
curl -b jar $B/products
curl -b jar -X POST $B/content/generate -H 'Content-Type: application/json' \
     -d '{"product_ids":["<id>"],"platforms":["tiktok"],"count":1,"schedule":true}'
curl -b jar -X POST $B/chat -H 'Content-Type: application/json' -d '{"message":"What products do I have?"}'
```

*(Use the `https://baymax-shoppey.vercel.app/api` prefix instead of `$B` when going through the frontend.)*
