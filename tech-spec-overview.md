# Tech Spec — Overview, Stack & Repo Structure

**Version:** 0.1 | **Author:** Zoey Cao | **Last Updated:** 2026-04-07 | **Status:** Draft

← [Back to index](tech-spec.md)

---

## 1. Project Overview

A solo-built cervical health education platform featuring an AI-powered Q&A assistant, interactive clinic finder, health information hub, and admin dashboard. This is a full refactor from the original Vue 3 + Firebase stack to a modern Next.js + Supabase + Claude multi-agent architecture.

### Goals

- Fast iteration loop: solo dev with AI-assisted development (Claude Code + Lovable)
- RAG-powered health assistant grounded in a curated cervical health knowledge base
- Multi-agent architecture for modular, extensible AI workflows
- Zero infrastructure management — fully managed services

---

## 2. Tech Stack

### Frontend

| Concern              | Choice                                                   |
| -------------------- | -------------------------------------------------------- |
| Framework            | Next.js 14 (App Router)                                  |
| Language             | TypeScript                                               |
| Styling              | Tailwind CSS + shadcn/ui                                 |
| State management     | Zustand                                                  |
| Maps                 | Google Maps JavaScript API                               |
| UI scaffolding       | Lovable → export → refine with Claude Code               |

### Backend

| Concern    | Choice                                         |
| ---------- | ---------------------------------------------- |
| API layer  | Next.js API routes (App Router Route Handlers) |
| Runtime    | Node.js 20                                     |
| Validation | Zod                                            |
| Email      | Resend                                         |

### Database & Auth

| Concern             | Choice                                           |
| ------------------- | ------------------------------------------------ |
| Database            | Supabase (PostgreSQL)                            |
| Vector search (RAG) | pgvector extension via Supabase                  |
| Auth                | Supabase Auth (email/password + Google OAuth)    |
| File storage        | Supabase Storage                                 |
| Realtime            | Supabase Realtime (presence, live analytics)     |
| ORM                 | Supabase JS client + raw SQL for complex queries |

### AI & Agents

| Concern                   | Choice                                                    |
| ------------------------- | --------------------------------------------------------- |
| LLM                       | Claude (Anthropic API) — claude-sonnet-4-6                |
| Agent SDK                 | `@anthropic-ai/sdk` with tool use                         |
| Multi-agent orchestration | Custom orchestrator — see [AI Agents spec](tech-spec-ai-agents.md) |
| Embeddings                | `text-embedding-3-small` (OpenAI) or Voyage AI `voyage-3` |
| RAG pipeline              | pgvector similarity search + context injection            |
| MCP servers               | Inlined into Next.js API routes (v1); extract to standalone servers in v2 |

### Deployment & Tooling

| Concern              | Choice                                       |
| -------------------- | -------------------------------------------- |
| Hosting              | Vercel (frontend + API routes)               |
| CI/CD                | Vercel Git integration (auto-deploy on push) |
| Package manager      | pnpm                                         |
| Linting / formatting | Biome                                        |
| Dev workflow         | Claude Code + Lovable                        |

---

## 3. Repository Structure

```
cervix-assistant/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Login, register, reset password
│   ├── (app)/                  # Authenticated app shell
│   │   ├── chat/               # AI assistant
│   │   ├── clinics/            # Clinic finder
│   │   ├── learn/              # Health information hub
│   │   ├── profile/            # User profile
│   │   └── admin/              # Admin dashboard (role-gated)
│   └── api/                    # Route handlers
│       ├── chat/               # Agent orchestration endpoint
│       ├── clinics/            # Clinic search proxy
│       ├── embeddings/         # Embedding ingestion
│       └── webhooks/           # Supabase / external webhooks
├── components/                 # Shared UI components (shadcn/ui base)
├── lib/
│   ├── supabase/               # Supabase client (server + browser)
│   ├── agents/                 # Multi-agent logic
│   │   ├── orchestrator.ts
│   │   ├── rag-agent.ts
│   │   └── response-agent.ts
│   ├── tools/                  # Claude tool definitions
│   │   └── health-kb.ts        # Inlined tool: pgvector similarity retrieval
│   └── rag/                    # Embedding, chunking, retrieval
├── stores/                     # Zustand stores
├── types/                      # Global TypeScript types
├── supabase/
│   ├── migrations/             # SQL migrations
│   └── seed.sql                # Dev seed data
└── tech-spec.md
```
