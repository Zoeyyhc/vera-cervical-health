# Cervix Health Assistant — Epics & Features

**MoSCoW Key:** M = Must Have · S = Should Have · C = Could Have · W = Won't Have (v1)

---

## Epic 1 — Infrastructure & Project Scaffold

| Feature                                                        | MoSCoW | Notes                             |
| -------------------------------------------------------------- | ------ | --------------------------------- |
| Next.js 14 project init (App Router + TypeScript + Tailwind)   | M      | Foundation for everything         |
| Supabase project setup + local Docker environment              | M      | DB + Auth dependency              |
| Database migrations (all tables + pgvector extension)          | M      | Schema first                      |
| Vercel deployment + Git auto CI/CD                             | M      | Zero-infra deploy                 |
| Environment variable management (`.env.local` + Vercel config) | M      |                                   |
| Biome linting/formatting config                                | S      | Worth setting up even solo        |
| pnpm workspace config                                          | S      | MCP servers are separate packages |

---

## Epic 2 — Auth & User System

| Feature                                                  | MoSCoW | Notes                               |
| -------------------------------------------------------- | ------ | ----------------------------------- |
| Register / login / forgot password pages                 | M      |                                     |
| Supabase Auth email/password                             | M      |                                     |
| `profiles` table + auto-create profile trigger on signup | M      |                                     |
| RLS policies (all tables)                                | M      | Security baseline, non-negotiable   |
| Next.js middleware route guards                          | M      |                                     |
| Google OAuth login                                       | S      | Lowers signup friction              |
| User profile edit page                                   | S      |                                     |
| Guest mode (no login required, 5-message limit)          | C      | Increases reach but adds complexity |

---

## Epic 3 — AI Health Assistant (Core)

| Feature                                                               | MoSCoW | Notes                            |
| --------------------------------------------------------------------- | ------ | -------------------------------- |
| `/api/chat` basic conversation endpoint (single-turn)                 | M      |                                  |
| Claude Sonnet 4.6 integration                                         | M      |                                  |
| Conversation history persistence (`chat_sessions` + `chat_messages`)  | M      |                                  |
| Streaming responses (token-by-token output)                           | M      | Non-streaming UX is unacceptable |
| Safety guardrails (no diagnosis, recommend professional consultation) | M      | Medical context compliance       |
| Multi-turn conversation context window management                     | M      |                                  |
| Chat UI page (message list + input box)                               | M      |                                  |
| Chat session list + switching                                         | S      |                                  |
| Source citation display in responses                                  | S      | Builds trust                     |
| Intent classification (health / general)                              | S      | Core orchestrator logic          |
| Multi-agent orchestrator (RAG Agent + Response Agent)                 | S      | Can ship single-agent first      |
| Chinese language responses                                            | C      | Spec marks as v1 EN only         |
| `news_request` intent classification in Orchestrator                  | S      | Triggers News Agent              |
| `events_request` intent classification in Orchestrator                | S      | Triggers Events Agent            |

---

## Epic 4 — RAG Knowledge Base

| Feature                                                              | MoSCoW | Notes                                                   |
| -------------------------------------------------------------------- | ------ | ------------------------------------------------------- |
| Embedding model integration (OpenAI `text-embedding-3-small`)        | M      |                                                         |
| Document chunking pipeline (512 tokens + 64 overlap)                 | M      |                                                         |
| `knowledge_chunks` write + pgvector storage                          | M      |                                                         |
| pgvector cosine similarity retrieval (threshold > 0.75)              | M      |                                                         |
| RAG Agent — query embedding + retrieval + context injection          | M      |                                                         |
| Admin knowledge ingestion endpoint `/api/embeddings/ingest`          | M      | Required to upload documents                            |
| Initial knowledge base content (Cancer Council / WHO / HealthDirect) | M      | No content = RAG does nothing                           |
| Fallback response when no relevant chunks found                      | S      |                                                         |
| ivfflat index optimisation                                           | S      | Low impact at small doc volume, set up early            |
| `health-kb` MCP server                                               | C      | Can inline into API route first; extract for production |

---

## Epic 5 — Clinic Finder

Clinic search is a standalone page (`/clinics`) — no agent or MCP involvement. Results come directly from Google Places API, proxied through a Next.js route handler to keep the API key server-side.

| Feature                                                        | MoSCoW | Notes                                              |
| -------------------------------------------------------------- | ------ | -------------------------------------------------- |
| `/api/clinics/search` route (proxy to Google Places API)       | M      | Keeps API key server-side                          |
| Clinic search page — keyword + location input                  | M      |                                                    |
| Google Maps display of results                                 | M      | Core UX — list alone is insufficient for location  |
| User geolocation (Geolocation API)                             | S      | Pre-fill location field                            |
| Clinic detail view (name, address, phone, website)             | S      |                                                    |
| Save / favourite clinics                                       | C      |                                                    |

---

## Epic 6 — Health Information Hub

| Feature                                  | MoSCoW | Notes                            |
| ---------------------------------------- | ------ | -------------------------------- |
| Article list page (`/learn`)             | S      | Can reuse knowledge base content |
| Article detail page (Markdown rendering) | S      |                                  |
| Category / tag filtering                 | C      |                                  |
| Search                                   | C      |                                  |

---

## Epic 7 — Admin Dashboard

| Feature                                                     | MoSCoW | Notes                             |
| ----------------------------------------------------------- | ------ | --------------------------------- |
| Admin role + route guard                                    | M      | Required to manage content safely |
| Knowledge base document management (upload / view / delete) | M      | Operational necessity             |
| User list view                                              | S      |                                   |
| User role management                                        | S      |                                   |
| Analytics event logging (`analytics_events`)                | C      |                                   |
| Analytics data visualisation (Recharts)                     | C      | Not urgent for v1                 |

---

## Epic 8 — Internationalisation

| Feature                                             | MoSCoW | Notes              |
| --------------------------------------------------- | ------ | ------------------ |
| `next-intl` config (EN + ZH routing)                | S      | UI string i18n     |
| EN translation strings                              | S      |                    |
| ZH translation strings                              | C      | Can be added later |
| User language preference saved to `profiles.locale` | C      |                    |

---

---

## Epic 9 — External Data Tools (News & Events)

| Feature                                                                          | MoSCoW | Notes                                                       |
| -------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| News Agent — `lib/agents/news-agent.ts`                                          | S      | Fetches today's women's health headlines via `news` tool    |
| `fetchHealthNews` tool — `lib/tools/news.ts`                                     | S      | Calls NewsAPI; fixed query terms for relevance              |
| `/api/news` route handler (server-side NewsAPI proxy)                            | S      | Keeps `NEWS_API_KEY` out of the browser                     |
| Events Agent — `lib/agents/events-agent.ts`                                      | S      | Finds local women's health events via `events` tool         |
| `findHealthEvents` tool — `lib/tools/events.ts`                                  | S      | Calls SerpAPI Google Events; filters by user location       |
| `/api/events` route handler (server-side SerpAPI proxy)                          | S      | Same pattern as `/api/clinics/search`                       |
| Orchestrator routing for `news_request` and `events_request` intents             | S      | Required to wire agents into the pipeline                   |
| Graceful fallback when external APIs are unavailable or return no results        | S      | User-facing error messaging                                 |
| Eventbrite API as alternative/fallback events source                             | C      | Richer event data; requires separate key                    |

**New env vars required:** `NEWS_API_KEY` (NewsAPI), `SERPAPI_KEY` (SerpAPI)

---

## Suggested Delivery Order

```
Sprint 1  Epic 1 + Epic 2            Foundations — can log in
Sprint 2  Epic 3 (basic chat)        Claude can respond
Sprint 3  Epic 4                     RAG grounded responses
Sprint 4  Epic 3 (full) + Epic 7     Orchestrator + admin KB management
Sprint 5  Epic 5 + Epic 9            Clinic finder + news & events tools
Sprint 6  Epic 6 + Epic 8            Content hub + i18n
```
