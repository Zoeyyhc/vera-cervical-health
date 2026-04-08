# Sprints & Priorities

## Delivery Order

| Sprint | Epics | Goal |
|---|---|---|
| Sprint 1 | Epic 1 + Epic 2 | Foundations — project scaffold + can log in |
| Sprint 2 | Epic 3 (basic chat) | Claude can respond (single-agent, no RAG) |
| Sprint 3 | Epic 4 | RAG grounded responses with pgvector |
| Sprint 4 | Epic 3 (full) + Epic 7 | Multi-agent orchestrator + admin KB management |
| Sprint 5 | Epic 5 + Epic 9 | Clinic finder + news & events tools |
| Sprint 6 | Epic 6 + Epic 8 | Health content hub + i18n |

---

## Epic 1 — Infrastructure & Project Scaffold

| Feature | MoSCoW |
|---|---|
| Next.js 14 init (App Router + TypeScript + Tailwind) | M |
| Supabase project setup + local Docker | M |
| Database migrations (all tables + pgvector extension) | M |
| Vercel deployment + Git auto CI/CD | M |
| Environment variable management | M |
| Biome linting/formatting config | S |
| pnpm workspace config | S |

## Epic 2 — Auth & User System

| Feature | MoSCoW |
|---|---|
| Register / login / forgot password pages | M |
| Supabase Auth email/password | M |
| `profiles` table + auto-create trigger on signup | M |
| RLS policies (all tables) | M |
| Next.js middleware route guards | M |
| Google OAuth login | S |
| User profile edit page | S |
| Guest mode (no login, 5-message limit) | C |

## Epic 3 — AI Health Assistant (Core)

| Feature | MoSCoW |
|---|---|
| `/api/chat` basic endpoint (single-turn) | M |
| Claude Sonnet 4.6 integration | M |
| Conversation history persistence | M |
| Streaming responses (token-by-token) | M |
| Safety guardrails (no diagnosis, recommend consultation) | M |
| Multi-turn context window management | M |
| Chat UI page (message list + input box) | M |
| Chat session list + switching | S |
| Source citation display | S |
| Intent classification (health / general) | S |
| Multi-agent orchestrator (RAG + Response Agent) | S |
| `news_request` / `events_request` intent routing | S |
| Chinese language AI responses | C |

## Epic 4 — RAG Knowledge Base

| Feature | MoSCoW |
|---|---|
| OpenAI `text-embedding-3-small` integration | M |
| Document chunking (512 tokens, 64-token overlap) | M |
| `knowledge_chunks` write + pgvector storage | M |
| pgvector cosine similarity retrieval (threshold > 0.75) | M |
| RAG Agent — query embed + retrieval + context injection | M |
| Admin ingestion endpoint `/api/embeddings/ingest` | M |
| Initial knowledge base content (Cancer Council / WHO / HealthDirect) | M |
| Fallback when no relevant chunks found | S |
| HNSW index tuning | S |

## Epic 5 — Clinic Finder

| Feature | MoSCoW |
|---|---|
| `/api/clinics/search` (Google Places proxy) | M |
| Clinic search page (keyword + location input) | M |
| Google Maps display of results | M |
| User geolocation (Geolocation API) | S |
| Clinic detail view | S |
| Save / favourite clinics | C |

## Epic 6 — Health Information Hub

| Feature | MoSCoW |
|---|---|
| Article list page (`/learn`) | S |
| Article detail page (Markdown rendering) | S |
| Category / tag filtering | C |
| Search | C |

## Epic 7 — Admin Dashboard

| Feature | MoSCoW |
|---|---|
| Admin role + route guard | M |
| Knowledge base document management (upload / view / delete) | M |
| User list view | S |
| User role management | S |
| Analytics event logging (`analytics_events`) | C |
| Analytics data visualisation (Recharts) | C |

## Epic 8 — Internationalisation

| Feature | MoSCoW |
|---|---|
| `next-intl` config (EN + ZH routing) | S |
| EN translation strings | S |
| ZH translation strings | C |
| User language preference saved to `profiles.locale` | C |

## Epic 9 — External Data Tools (News & Events)

| Feature | MoSCoW |
|---|---|
| News Agent (`lib/agents/news-agent.ts`) | S |
| `fetchHealthNews` tool (`lib/tools/news.ts`) | S |
| `/api/news` route handler (NewsAPI proxy) | S |
| Events Agent (`lib/agents/events-agent.ts`) | S |
| `findHealthEvents` tool (`lib/tools/events.ts`) | S |
| `/api/events` route handler (SerpAPI proxy) | S |
| Orchestrator routing for `news_request` / `events_request` | S |
| Graceful fallback when external APIs are unavailable | S |
| Eventbrite API as alternative events source | C |

---

## Out of Scope (v1)

- Mobile app
- Telehealth / appointment booking
- Real-time clinic availability
- Payment / premium tier
- Multi-language AI responses (EN only; i18n UI strings are included)

---

## Open Questions

- [ ] **Embedding model:** OpenAI `text-embedding-3-small` vs Voyage AI `voyage-3` — cost/quality tradeoff
- [ ] **Clinic data source:** Manual seed vs scraping HealthDirect / NPS MedicineWise
- [ ] **Safety guardrails:** Rule-based filters vs a dedicated safety classifier agent
- [ ] **MCP transport:** Resolved for v1 — tools inlined into API routes. Revisit HTTP SSE extraction for v2 if multi-consumer access is needed.
