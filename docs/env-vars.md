# Environment Variables

Copy `.env.example` to `.env.local` to get started. Never commit `.env.local`.

Variables prefixed `NEXT_PUBLIC_` are available in the browser. All others are server-side only.

---

## Supabase

| Variable | Required | Environments | Where to get it |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | local, preview, production | Supabase dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | local, preview, production | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | local, preview, production | Supabase dashboard → Settings → API |

The service role key bypasses RLS — only use it in explicitly admin-only server routes.

## Anthropic

| Variable | Required | Environments | Where to get it |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | local, preview, production | https://console.anthropic.com → API Keys |

Used by all Claude Sonnet 4.6 agent calls in `lib/agents/`.

## OpenAI (Embeddings)

| Variable | Required | Environments | Where to get it |
|---|---|---|---|
| `OPENAI_API_KEY` | Yes | local, preview, production | https://platform.openai.com/api-keys |

Used exclusively for generating `text-embedding-3-small` vectors in the RAG pipeline.

## Google Maps

| Variable | Required | Environments | Where to get it |
|---|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Yes | local, preview, production | https://console.cloud.google.com → APIs & Services → Credentials |

Used by the `/clinics` page to render the Google Map (client-side) and by `/api/clinics/search` for the Places API (New) call (server-side). Enable both **Maps JavaScript API** and **Places API (New)** in Google Cloud Console (these are separate entries — do not enable the legacy "Places API").

## Resend (Email)

| Variable | Required | Environments | Where to get it |
|---|---|---|---|
| `RESEND_API_KEY` | Yes | local, preview, production | https://resend.com/api-keys |

Used for transactional email (password reset, account confirmation).

## News

| Variable | Required | Environments | Where to get it |
|---|---|---|---|
| `NEWS_API_KEY` | Yes | local, preview, production | https://newsapi.org/account (free tier: 100 req/day) |

Used by `/api/news` route handler. Never exposed to the browser.

## Events

| Variable | Required | Environments | Where to get it |
|---|---|---|---|
| `SERPAPI_KEY` | Yes | local, preview, production | https://serpapi.com/manage-api-key (free tier: 100 req/month) |

Used by `/api/events` route handler. Never exposed to the browser.

## Victoria Trusted Health MCP

| Variable | Required | Environments | Where to get it |
|---|---|---|---|
| `MCP_AUTH_TOKEN` | Yes | local, preview, production | Generate one: `openssl rand -hex 32` |
| `MCP_BASE_URL` | No | all | Defaults to `NEXT_PUBLIC_APP_URL` |

`MCP_AUTH_TOKEN` is the bearer token for the private, read-only MCP endpoint (`POST /api/mcp`).
It is **not** `NEXT_PUBLIC_`, and must never become so — that non-public status is one of the two
guards keeping the endpoint unreachable from a browser (`lib/mcp/auth.ts`). The only caller is
Vera's own server-side agent layer.

`MCP_BASE_URL` overrides the origin the server-side MCP client dials. The default is correct for
local dev and Vercel; set it only if the app is served behind a different internal origin.

## App

| Variable | Required | Environments | Default | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | local, preview, production | `http://localhost:3000` | Full URL including protocol; used for OAuth redirects and email links |

---

## Local Dev Notes

- For local Supabase (`supabase start`), use the credentials printed by that command — they differ from your cloud project credentials
- `SUPABASE_SERVICE_ROLE_KEY` from the local stack is safe to commit only in `.env.example` (it's a well-known local-only secret); production key must never be committed
- Google Maps API key should have HTTP referrer restrictions set in production
- The Places API (New) uses a different base URL (`https://places.googleapis.com/v1/`) and requires a `X-Goog-FieldMask` header — see `docs/api-routes.md` for the clinic search implementation
