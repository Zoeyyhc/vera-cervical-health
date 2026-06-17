# Vera

A cervical health education platform with an AI-powered Q&A assistant, clinic finder, health information hub, and admin dashboard. Built on Next.js 14, Supabase, and a multi-agent Claude Sonnet 4.6 pipeline.

> Educational tool only — never provides diagnosis. The Response Agent always recommends professional medical consultation.

---

## Features

- **AI assistant** — multi-agent chat backed by a RAG pipeline over a curated knowledge base of public health sources (CDC, NHS, healthdirect AU).
- **Self-improving knowledge base** — a scheduled discovery pipeline detects questions the knowledge base answers poorly, finds authoritative sources to fill the gap, and stages them for one-click admin review. Runs every 3 days via Vercel Cron.
- **Clinic finder** — proxied Google Places search; no clinic data stored locally.
- **Learn hub** — curated health articles plus live news and events feeds.
- **Auth & roles** — Supabase Auth (email/password + Google OAuth) with `guest`, `user`, `admin` roles enforced via RLS.
- **Admin dashboard** — knowledge ingestion, discovery review queue, content management, role-gated server-side.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript strict |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| Database | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| AI | Claude Sonnet 4.6 via `@anthropic-ai/sdk` |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| Package manager | pnpm |
| Lint/Format | Biome |
| Testing | Vitest (unit) + Playwright (E2E) |
| Deployment | Vercel |

---

## Architecture

### Agent pipeline

```
User message
      │
      ▼
Orchestrator (intent classification + history window + locale injection)
      │
      ├── health_question  → RAG Agent     → Response Agent → user
      ├── news_request     → News Agent    → Response Agent → user
      ├── events_request   → Events Agent  → Response Agent → user
      └── general_chat     → Response Agent directly        → user
```

Each agent is a pure function in `lib/agents/`. Tools (`retrieveHealthContext`, `fetchHealthNews`, `findHealthEvents`) live in `lib/tools/`. The Orchestrator is the only coordinator — agents never call each other directly. The `/clinics` page is **not** part of the pipeline; it talks to `/api/clinics/search` directly.

### RAG flow

1. Admin uploads source → `POST /api/embeddings/ingest`
2. Chunked at 512 tokens with 64-token overlap
3. Each chunk embedded via OpenAI `text-embedding-3-small`
4. Stored in `knowledge_chunks` (pgvector, 1536 dimensions)
5. Query time: embed → cosine similarity (threshold 0.75) → top-k chunks injected as Response Agent context

### Knowledge discovery pipeline

The knowledge base improves itself in response to real demand — it is **gap-driven, not keyword-driven**:

```
User asks a health question
      │
      ▼
RAG retrieval scores below the coverage threshold (0.52)
      │   orchestrator logs a `rag_gap` analytics event
      ▼
Cron (every 3 days) or admin "Run discovery now"
      │
      ├── mine gaps        cluster recent rag_gap events → top themes
      ├── synthesize        LLM generates search queries per theme
      ├── search + score    SerpAPI → authority allowlist/denylist + LLM judge
      ├── fetch + dedup      extract main text, skip near-duplicates of the KB
      └── stage candidate   summarize + tag → knowledge_candidates (pending)
      │
      ▼
Admin reviews at /admin/knowledge → Approve (ingest) or Reject
```

If there are no fresh gaps, a run stages nothing — the pipeline is reactive and never invents work. Authority gates (WHO, CDC, NHS, ACOG, healthdirect AU, …), per-run bounds, and a mandatory human-review step keep low-quality or off-domain content out of `knowledge_chunks`. Triggered by `GET /api/embeddings/discover`, authenticated by either a Vercel Cron bearer token (`CRON_SECRET`) or an admin session. See [`docs/discovery-pipeline.md`](docs/discovery-pipeline.md) for thresholds, bounds, and tuning.

### External API proxy pattern

All third-party API keys are server-side only. The browser never calls external APIs directly:

```
Browser → /api/<service>/... → External API (key injected server-side)
```

Applies to: Google Maps, NewsAPI, SerpAPI.

---

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop (for local Supabase)
- Supabase CLI

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and fill environment variables
cp .env.example .env.local
#    See docs/env-vars.md for provider links and required keys.

# 3. Start local Supabase (requires Docker)
supabase start

# 4. Apply migrations and seed dev data
supabase db reset

# 5. Start the dev server
pnpm dev
```

The app is now at http://localhost:3000.

### Required external accounts

Supabase, Anthropic, OpenAI, Google Maps, Resend, NewsAPI, SerpAPI. See [`docs/env-vars.md`](docs/env-vars.md) for setup details.

---

## Commands

```bash
# Development
pnpm dev                          # Next.js dev server
supabase start | stop             # Local Supabase stack

# Build
pnpm build                        # Production build
pnpm start                        # Serve production build

# Quality
pnpm lint                         # Biome check
pnpm format                       # Biome check --write
pnpm test                         # Vitest run
pnpm test:watch                   # Vitest watch
pnpm exec playwright test         # E2E tests (Chromium + Firefox + WebKit)

# Database
supabase migration new <name>     # New SQL migration
supabase db push                  # Apply pending migrations
supabase db reset                 # Reset and re-apply migrations + seed.sql

# Knowledge base
pnpm seed:kb                      # Seed knowledge base from supabase/seeds/knowledge/
pnpm rag:query                    # CLI for ad-hoc RAG queries
```

---

## Project structure

```
cervix-assistant/
├── app/
│   ├── (auth)/          # Login, register, reset password
│   ├── (app)/           # Authenticated shell: chat, clinics, learn, profile, admin
│   └── api/             # Route handlers: chat, clinics, news, events, embeddings, webhooks
├── components/          # Shared UI (shadcn/ui base + custom extensions)
├── lib/
│   ├── supabase/        # server.ts and browser.ts clients
│   ├── agents/          # Orchestrator, RAG, news, events, response
│   ├── tools/           # Claude tool definitions (one file per tool)
│   └── rag/             # Embedding, chunking, retrieval utilities
├── stores/              # Zustand stores
├── types/               # Global TypeScript types
├── supabase/
│   ├── migrations/      # Numbered SQL migrations
│   ├── seeds/knowledge/ # Curated knowledge base sources
│   └── seed.sql         # Dev seed data
├── tests/               # Vitest unit/integration tests
├── e2e/                 # Playwright E2E tests
└── docs/                # Architecture, database, API, env, design docs
```

---

## Documentation

| Doc | Contents |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Agent pipeline, RAG flow, tool call chain |
| [`docs/discovery-pipeline.md`](docs/discovery-pipeline.md) | Gap-driven knowledge discovery: rag_gap capture, stages, thresholds, triggers |
| [`docs/database.md`](docs/database.md) | Full schema, RLS roles, pgvector setup |
| [`docs/api-routes.md`](docs/api-routes.md) | Every API route with auth requirements |
| [`docs/env-vars.md`](docs/env-vars.md) | All env vars with provider links |
| [`docs/design-tokens.md`](docs/design-tokens.md) | Colors, typography, spacing, component rules |
| [`docs/sprints.md`](docs/sprints.md) | Sprint plan, MoSCoW priorities |
| [`DESIGN.md`](DESIGN.md) | Full Lovable-inspired design system |
| [`CLAUDE.md`](CLAUDE.md) | Conventions, constraints, workflow |
| [`tech-spec-overview.md`](tech-spec-overview.md) | Project overview |
| [`tech-spec-ai-agents.md`](tech-spec-ai-agents.md) | Multi-agent spec (detailed) |
| [`tech-spec-database.md`](tech-spec-database.md) | Database and RAG spec |
| [`tech-spec-app.md`](tech-spec-app.md) | Auth, API, dev workflow, testing |
| [`epic.md`](epic.md) | Feature epics with MoSCoW prioritization |

---

## Conventions

- Files: `kebab-case`. Components: `PascalCase`. DB: `snake_case`.
- TypeScript strict; `any` only for untyped third-party API responses.
- All API input validated with Zod.
- shadcn/ui primitives extended, not replaced.
- RLS is always on — never bypass with the service role key in routes accessible to non-admin users.
- Claude model string is hard-coded as `claude-sonnet-4-6` in agents (not from env).
- Biome is the only linter/formatter — no ESLint, no Prettier.

See [`CLAUDE.md`](CLAUDE.md) for the full set of conventions and constraints.

---

## Security

- Third-party API keys are **never** exposed client-side — all calls proxy through `/api/`.
- Row-Level Security policies are enforced at the database level on every table.
- Admin routes do a server-side role check on every request (not just client-side).
- The Supabase service role key is only used in admin-only server routes.

---

## Status

Solo-built and actively developed. The core product is in place — multi-agent chat, RAG knowledge base, self-improving discovery pipeline, clinic finder, learn hub, auth/roles, and an admin dashboard. See [`docs/sprints.md`](docs/sprints.md) for current priorities and [`docs/discovery-pipeline.md`](docs/discovery-pipeline.md) for planned enhancements (topic-driven discovery, background-job UX, run history).

---

## License

Not yet licensed for public use.
