# Vera

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
- Claude model strings are hard-coded (not from env), one per use class in `lib/ai/anthropic.ts`: the user-facing response agent uses `CLAUDE_MODEL` (`claude-sonnet-4-6`); the intent classifier and discovery pipeline use the cheaper `CLAUDE_FAST_MODEL` (`claude-haiku-4-5`). Add a `pricing.ts` entry for any new model or its cost logging silently returns null.

### Database
- All migrations in `supabase/migrations/` with sequential numbering
- Migrations may be edited freely during local development — re-run `supabase db reset` to re-apply
- Use `supabase.rpc()` for pgvector queries
- RLS is always on — test policies after creating new tables

### Linting
- Biome is the sole linter/formatter — do not use ESLint or Prettier
- Run `pnpm biome check --write .` before committing

### Verification (Proofrun)
After implementing any change that has UI acceptance criteria, run `/proofrun` to produce auditable evidence of the behavior. Proofrun interacts with the running app in a simulator/emulator, captures screenshots at each step, and generates an interactive HTML report for human review.

Trigger proofrun when:
- You have finished implementing a feature or bug fix with verifiable UI acceptance criteria
- The user asks you to verify app behavior (e.g. "check if it works", "verify the flow")

Quick reference:
```bash
npx proofrun info          # Check readiness and active sessions
npx proofrun --help        # Full command reference
```

Workflow summary:
1. `npx proofrun info` — confirm diagnostics pass
2. `npx proofrun session start --change <slug> --device <id>` — lock a device and start a session
3. Record prerequisites, build a verification plan (`npx proofrun plan add`), then verify each criterion with steps + screenshots + judgments
4. `npx proofrun session stop` — release the device lock
5. `npx proofrun report --change <slug>` — generate the HTML report
6. `npx proofrun serve --change <slug>` — serve the report for human review; wait for feedback

Every judgment must be preceded by at least one screenshot. Never judge a criterion without visual evidence.

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
- **DO NOT** use font weight 700 (bold) — maximum weight in the design system is 600
- **DO NOT** add MCP server infrastructure beyond the approved Victoria Trusted Health MCP — the RAG, News, and Events tools stay inlined into Next.js API routes. The one MCP server (`app/api/mcp`, `lib/mcp/`) is private, read-only, and server-to-server only; see `docs/trusted-health-mcp-v0.1.md` for its approved scope
- **DO NOT** make the MCP endpoint reachable from the browser, give it a write tool, or let it fetch a user-supplied URL — `lib/mcp/no-write.test.ts` and `lib/mcp/auth.test.ts` enforce this
- **DO NOT** copy, cache, or re-publish third-party clinic or provider records — the MCP returns first-party directory *deep links* only, and the no-`clinics`-table constraint above still holds

---

## Workflow

This is a solo project. The following superpowers skills are **disabled** here — do not invoke them:

- `superpowers:requesting-code-review` / `superpowers:receiving-code-review` — no human reviewer on this project. For self-review, use the `simplify` skill instead.
- `superpowers:using-git-worktrees` — local Supabase runs a single DB instance and `pnpm dev` binds one port; parallel worktrees cause collisions, not speed.
- `superpowers:dispatching-parallel-agents` — agents, types, and migrations in this repo share files, so parallel execution creates merge overhead instead of savings. `Explore` and `Plan` subagents (read-only research) are still fine.
- `superpowers:executing-plans` strict checkpoint flow — the solo developer is the decision-maker; execute plans directly without per-step approval gates. Still read the plan file and follow it; just skip the checkpoint pauses.

Still actively used: `brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `simplify`.

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
| `docs/discovery-pipeline.md` | Gap-driven knowledge discovery: rag_gap capture, stages, thresholds, triggers |
| `docs/trusted-health-mcp-v0.1.md` | Victoria Trusted Health MCP — approved scope, tool contracts, governance |
| `docs/trusted-health-mcp.md` | Same MCP — implementation, file map, admin operations, security posture |
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
