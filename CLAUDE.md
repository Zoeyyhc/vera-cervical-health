# Cervix Health Assistant

A solo-built cervical health education platform with an AI-powered Q&A assistant, clinic finder, health information hub, and admin dashboard. Built on Next.js 14 + Supabase + Claude Sonnet multi-agent architecture.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| Database | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| AI | Claude Sonnet 4.6 via `@anthropic-ai/sdk` |
| Embeddings | OpenAI `text-embedding-3-small` |
| Package manager | pnpm |
| Linting | Biome |
| Testing | Playwright (E2E) |
| Deployment | Vercel |

---

## Commands

```bash
# Development
pnpm dev                          # Start Next.js dev server (http://localhost:3000)
supabase start                    # Start local Supabase stack (Docker required)
supabase stop                     # Stop local Supabase stack

# Build
pnpm build                        # Production build
pnpm start                        # Serve production build locally

# Linting & Formatting
pnpm biome check .                # Check all files
pnpm biome check --write .        # Check and auto-fix

# Testing
pnpm exec playwright test         # Run all E2E tests (Chromium + Firefox + WebKit)
pnpm exec playwright test --ui    # Run with interactive Playwright UI
pnpm exec playwright test <file>  # Run a single test file

# Database
supabase migration new <name>     # Create a new SQL migration file
supabase db push                  # Apply pending migrations to local Supabase
supabase db reset                 # Reset local DB and re-apply all migrations + seed.sql
```

---

## Structure

```
cervix-assistant/
├── app/
│   ├── (auth)/          # Login, register, reset password — public routes
│   ├── (app)/           # Authenticated shell
│   │   ├── chat/        # AI assistant UI
│   │   ├── clinics/     # Clinic finder (standalone — no agent involvement)
│   │   ├── learn/       # Health information hub
│   │   ├── profile/     # User profile
│   │   └── admin/       # Admin dashboard (role-gated, server-side check on every request)
│   └── api/
│       ├── chat/        # Agent orchestration entry point (POST, streaming)
│       ├── clinics/     # Google Places proxy
│       ├── news/        # NewsAPI proxy (keeps NEWS_API_KEY server-side)
│       ├── events/      # SerpAPI proxy (keeps SERPAPI_KEY server-side)
│       ├── embeddings/  # Knowledge ingestion (admin only)
│       └── webhooks/    # Supabase / external webhooks
├── components/          # Shared UI (shadcn/ui base + custom extensions)
├── lib/
│   ├── supabase/        # Supabase client — server.ts and browser.ts
│   ├── agents/          # Multi-agent logic (one file per agent)
│   │   ├── orchestrator.ts
│   │   ├── rag-agent.ts
│   │   ├── news-agent.ts
│   │   ├── events-agent.ts
│   │   └── response-agent.ts
│   ├── tools/           # Claude tool definitions (one file per tool)
│   │   ├── health-kb.ts # retrieveHealthContext — pgvector similarity search
│   │   ├── news.ts      # fetchHealthNews — NewsAPI
│   │   └── events.ts    # findHealthEvents — SerpAPI
│   └── rag/             # Embedding, chunking, retrieval utilities
├── stores/              # Zustand stores
├── types/               # Global TypeScript types
├── supabase/
│   ├── migrations/      # SQL migrations (numbered, never edit after applying)
│   └── seed.sql         # Dev seed data
└── docs/                # Project documentation (see Documentation section below)
```

---

## Architecture

### Agent Pipeline

```
User message
      │
      ▼
Orchestrator (classifies intent)
      │
      ├── health_question  → RAG Agent → Response Agent → user
      ├── news_request     → News Agent → Response Agent → user
      ├── events_request   → Events Agent → Response Agent → user
      └── general_chat     → Response Agent directly → user
```

The Orchestrator manages the conversation history window and injects user locale from `profiles`.

**The `/clinics` page is NOT part of the agent pipeline.** It calls `/api/clinics/search` directly, which proxies to Google Places API. No agent, no orchestrator.

### RAG Pipeline

1. Admin uploads document → `POST /api/embeddings/ingest`
2. Text extracted, chunked (512 tokens, 64-token overlap)
3. Each chunk embedded via OpenAI `text-embedding-3-small`
4. Embeddings stored in `knowledge_chunks` (pgvector, 1536 dimensions)
5. At query time: embed user query → cosine similarity search (threshold 0.75)
6. Top-k chunks injected as context into Response Agent

### Auth Model

Three roles: `guest` (limited), `user` (full), `admin` (management).

- RLS enforced at DB level on **all** tables — never bypass with service role key in routes accessible to non-admin users
- Next.js middleware handles route-level guards
- Admin routes (`app/(app)/admin/`) do a server-side role check on every request

### External API Proxy Pattern

All third-party API keys are server-side only. The browser never calls external APIs directly:

```
Browser → /api/<service>/... → External API (key injected server-side)
```

This applies to: Google Maps, NewsAPI, SerpAPI.

---

## Conventions

### Naming
- Files: `kebab-case` (`my-component.tsx`, `health-kb.ts`)
- Components: `PascalCase` (`ChatMessage`, `ClinicCard`)
- Functions/variables: `camelCase`
- Database tables/columns: `snake_case`
- Supabase types: auto-generated — do not hand-edit the generated types file

### TypeScript
- Strict mode is on — no `any` except when parsing untyped third-party API responses
- Use Zod for all API input validation (route handler inputs and tool inputs)
- Prefer named exports over default exports in `lib/` and `components/`

### Components
- Use shadcn/ui primitives as the base — extend, don't replace
- All new components go in `components/` unless page-specific (then co-locate in `app/`)
- Design tokens: cream `#f7f4ed` bg, charcoal `#1c1c1c` text, warm borders `#eceae4` — see `docs/design-tokens.md`

### API Routes
- All route handlers live in `app/api/` using App Router conventions (`route.ts`)
- Return `Response.json()` — not `NextResponse` from `next/server`
- Validate all inputs with Zod before processing
- Proxy routes must never expose the API key in the response body

### Agents
- Each agent is a pure function: takes context, returns a typed result
- One file per agent in `lib/agents/`; one file per tool in `lib/tools/`
- No agent calls another agent directly — the Orchestrator coordinates
- All Claude API calls use model string `claude-sonnet-4-6` (hard-coded, not from env)

### Database
- All migrations in `supabase/migrations/` with sequential numbering
- Never edit a migration after it has been applied to any environment — create a new one
- Use `supabase.rpc()` for pgvector queries
- RLS is always on — test policies after creating new tables

### Linting
- Biome is the sole linter/formatter — do not use ESLint or Prettier
- Run `pnpm biome check --write .` before committing

---

## Constraints

- **DO NOT** use pure white (`#ffffff`) as a background — the design uses cream (`#f7f4ed`)
- **DO NOT** expose API keys client-side — all third-party keys are proxied server-side
- **DO NOT** bypass RLS with the service role key in routes accessible to non-admin users
- **DO NOT** call external APIs directly from the browser — always proxy through `/api/`
- **DO NOT** generate diagnosis language — the Response Agent must always recommend professional medical consultation; never state or imply a diagnosis
- **DO NOT** use the `any` TypeScript type except when parsing untyped third-party API responses
- **DO NOT** create a `clinics` table in the database for v1 — clinic data comes from Google Places API
- **DO NOT** use ESLint or Prettier — Biome is the sole linter/formatter
- **DO NOT** add fonts other than Camera Plain Variable (with `ui-sans-serif, system-ui` fallback) — no Google Fonts
- **DO NOT** amend migrations that have already been applied — create a new migration instead
- **DO NOT** use font weight 700 (bold) — maximum weight in the design system is 600
- **DO NOT** add MCP server infrastructure in v1 — agent tools are inlined into Next.js API routes

---

## Environment Setup

1. Copy `.env.example` to `.env.local` — never commit `.env.local`
2. Fill in all required variables — see `docs/env-vars.md` for provider links
3. Install dependencies: `pnpm install`
4. Start local Supabase: `supabase start` (requires Docker Desktop running)
5. Apply migrations: `supabase db push`
6. Seed dev data: `supabase db reset` (runs migrations + `seed.sql`)
7. Start dev server: `pnpm dev`

Required external accounts for full local dev: Supabase, Anthropic, OpenAI, Google Maps, Resend, NewsAPI, SerpAPI.

---

## Documentation

| File | Contents |
|---|---|
| `docs/architecture.md` | Agent pipeline, RAG flow, tool call chain |
| `docs/database.md` | Full schema reference, RLS roles, pgvector setup |
| `docs/api-routes.md` | All API routes with auth requirements |
| `docs/env-vars.md` | All environment variables with provider links |
| `docs/design-tokens.md` | Colors, typography, spacing, component rules |
| `docs/sprints.md` | Sprint plan, MoSCoW priorities, open questions |
| `DESIGN.md` | Full design system (Lovable-inspired) |
| `tech-spec-overview.md` | Project overview and repo structure |
| `tech-spec-ai-agents.md` | Multi-agent spec (detailed) |
| `tech-spec-database.md` | Database schema and RAG pipeline spec |
| `tech-spec-app.md` | Auth, API routes, dev workflow, testing |
| `epic.md` | All 9 feature epics with MoSCoW prioritization |
