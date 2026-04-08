# Environment Variables

Copy `.env.example` to `.env.local` to get started. Never commit `.env.local`.

Variables prefixed `NEXT_PUBLIC_` are available in the browser. All others are server-side only.

## Supabase

| Variable | Required | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase project dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase project dashboard → Settings → API (keep strictly server-side) |

The service role key bypasses RLS — only use it in explicitly admin-only server routes.

## Anthropic

| Variable | Required | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | https://console.anthropic.com → API Keys |

Used by all Claude Sonnet 4.6 agent calls in `lib/agents/`.

## OpenAI (Embeddings)

| Variable | Required | Where to get it |
|---|---|---|
| `OPENAI_API_KEY` | Yes | https://platform.openai.com/api-keys |

Used exclusively for generating `text-embedding-3-small` vectors in the RAG pipeline.

## Google Maps

| Variable | Required | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Yes | https://console.cloud.google.com → APIs & Services → Credentials |

Used by the `/clinics` page to render the Google Map (client-side) and by `/api/clinics/search` for the Places API call (server-side). Enable: Maps JavaScript API, Places API.

## Resend (Email)

| Variable | Required | Where to get it |
|---|---|---|
| `RESEND_API_KEY` | Yes | https://resend.com/api-keys |

Used for transactional email (password reset, account confirmation).

## News

| Variable | Required | Where to get it |
|---|---|---|
| `NEWS_API_KEY` | Yes | https://newsapi.org/account (free tier: 100 req/day) |

Used by `/api/news` route handler. Never exposed to the browser.

## Events

| Variable | Required | Where to get it |
|---|---|---|
| `SERPAPI_KEY` | Yes | https://serpapi.com/manage-api-key (free tier: 100 req/month) |

Used by `/api/events` route handler. Never exposed to the browser.

## App

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | `http://localhost:3000` | Full URL including protocol; used for OAuth redirects and email links |

## Local Dev Notes

- For local Supabase (`supabase start`), use the credentials printed by that command — they differ from your cloud project credentials
- `SUPABASE_SERVICE_ROLE_KEY` from the local stack is safe to commit only in `.env.example` (it's a well-known local-only secret); production key must never be committed
- Google Maps API key should have HTTP referrer restrictions set in production
