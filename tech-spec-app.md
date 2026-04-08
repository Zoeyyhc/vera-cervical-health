# Tech Spec — Auth, API, Workflow & Testing

**Version:** 0.1 | **Author:** Zoey Cao | **Last Updated:** 2026-04-07 | **Status:** Draft

← [Back to index](tech-spec.md)

---

## 8. Auth & Access Control

| Role    | Permissions                                                            |
| ------- | ---------------------------------------------------------------------- |
| `guest` | Read health info hub, limited chat (5 messages/session), clinic finder |
| `user`  | Full chat history, profile management, saved clinics                   |
| `admin` | User management, analytics dashboard, knowledge base management        |

- Supabase Row Level Security (RLS) enforced at DB level for all tables
- Route-level guards in Next.js middleware
- Admin routes: `app/admin/*` — server-side role check on every request

---

## 9. Key API Routes

| Route                    | Method    | Description                               |
| ------------------------ | --------- | ----------------------------------------- |
| `/api/chat`              | POST      | Main agent orchestration entry point      |
| `/api/chat/[sessionId]`  | GET       | Fetch message history                     |
| `/api/clinics/search`    | GET       | Clinic search (proxies Google Places API) |
| `/api/embeddings/ingest` | POST      | Admin: ingest new knowledge document      |
| `/api/analytics/event`   | POST      | Log analytics event                       |
| `/api/admin/users`       | GET/PATCH | User management                           |

---

## 10. Development Workflow

```
Lovable
  └── Scaffold UI page/component (Tailwind + shadcn)
  └── Export to app/ or components/

Claude Code
  └── Wire component to Supabase + API route
  └── Implement agent logic in lib/agents/
  └── Write Supabase migration in supabase/migrations/
  └── Build MCP server in mcp-servers/

Vercel
  └── Auto-deploys on push to main
  └── Preview deployments on PRs
```

**Local dev:**

```bash
pnpm dev              # Next.js dev server
supabase start        # Local Supabase (Docker)
```

No separate MCP server processes required — tool logic runs inside the Next.js API route.

---

## 11. Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# OpenAI (embeddings)
OPENAI_API_KEY=

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_KEY=

# Resend (email)
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
```

---

## 12. Out of Scope (v1)

- Mobile app
- Telehealth / appointment booking
- Real-time clinic availability
- Payment / premium tier
- Multi-language AI responses (EN only for v1; i18n UI strings included)

---

## 13. Testing

### End-to-End Testing

We will use **Playwright** for end-to-end testing.

| Concern        | Choice                          |
| -------------- | ------------------------------- |
| E2E framework  | Playwright                      |
| Test runner    | `@playwright/test`              |
| Browsers       | Chromium, Firefox, WebKit       |

Key flows to cover:

- User registration and login (Supabase Auth)
- Chat assistant: sending a health question and receiving a grounded response
- Clinic finder: searching by location and viewing results on map
- Admin dashboard: ingesting a knowledge document, viewing analytics
- Guest limits: chat message cap enforcement

**Local test run:**

```bash
pnpm exec playwright test
```

---

## 14. Open Questions

- [ ] Embedding model: OpenAI `text-embedding-3-small` vs Voyage AI `voyage-3` — cost/quality tradeoff
- [ ] Clinic data source: manual seed vs scraping HealthDirect / NPS MedicineWise
- [ ] Safety guardrails: rule-based filters vs a dedicated safety classifier agent
- [ ] MCP transport: resolved for v1 — tools inlined into API routes; revisit HTTP SSE extraction for v2 if multi-consumer access is needed
