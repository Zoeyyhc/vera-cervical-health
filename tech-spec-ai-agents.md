# Tech Spec — Multi-Agent Architecture & Tools

**Version:** 0.2 | **Author:** Zoey Cao | **Last Updated:** 2026-04-08 | **Status:** Draft

← [Back to index](tech-spec.md)

---

## 5. Multi-Agent Architecture

```
User message
      │
      ▼
┌─────────────────────────────────────────────┐
│   Orchestrator                              │
│   (Claude Sonnet)                           │
│                                             │
│   Intent: health_question                   │
│          | news_request                     │
│          | events_request                   │
│          | general_chat                     │
└─────────────────────────────────────────────┘
        │
        ├─────────────────────┬──────────────────────┐
        ▼                     ▼                      ▼
┌──────────────┐    ┌──────────────────┐   ┌──────────────────┐
│  RAG Agent   │    │   News Agent     │   │  Events Agent    │
│              │    │                  │   │                  │
│ - Embed query│    │ - Call NewsAPI   │   │ - Call SerpAPI   │
│ - pgvector   │    │ - Filter by      │   │   Google Events  │
│   similarity │    │   relevance      │   │   or Eventbrite  │
│   search     │    │ - Return today's │   │ - Filter by      │
│ - Return top │    │   headlines      │   │   user location  │
│   k chunks   │    │                  │   │ - Return events  │
└──────────────┘    └──────────────────┘   └──────────────────┘
        │                     │                      │
        └─────────────────────┴──────────────────────┘
                              │
                              ▼
                  ┌──────────────────┐
                  │  Response Agent  │
                  │  (Claude Sonnet) │
                  │                  │
                  │  Synthesises     │
                  │  context into    │
                  │  a grounded,     │
                  │  cited response  │
                  └──────────────────┘
                              │
                              ▼
                        User response
                        (with sources)
```

### Agent Responsibilities

**Orchestrator**

- Classifies intent: `health_question` | `news_request` | `events_request` | `general_chat`
- Routes to RAG Agent for health questions
- Routes to News Agent for news requests
- Routes to Events Agent for local event discovery
- Manages conversation history window
- Injects user profile context (language preference)

**RAG Agent**

- Embeds the user query
- Runs pgvector cosine similarity search against `knowledge_chunks`
- Returns top-k chunks with source metadata
- Threshold: cosine similarity > 0.75; fallback: "I don't have reliable information on this"

**News Agent**

- Triggered by `news_request` intent (e.g. "any news about cervical cancer?", "latest women's health news")
- Calls the `fetchHealthNews` tool → proxies NewsAPI with fixed query terms (`cervical health`, `HPV`, `women's health`)
- Filters results to today ± 7 days; returns up to 5 headlines with title, source, URL, and published date
- Falls back gracefully if NewsAPI is unavailable

**Events Agent**

- Triggered by `events_request` intent (e.g. "any women's health events near me?", "cervical screening events in Sydney")
- Calls the `findHealthEvents` tool → proxies SerpAPI Google Events (or Eventbrite API) with user location + keyword
- Requires user to provide or confirm their location; uses `profiles.locale` as a hint if present
- Returns up to 5 upcoming events with name, date, location, and URL
- Falls back gracefully if no events are found

**Response Agent**

- Receives retrieved context from RAG Agent, News Agent, or Events Agent
- Generates a grounded response citing sources
- Enforces safety guardrails: no diagnosis, recommend professional consultation

> **Note:** Clinic search is a standalone page (`/clinics`) — not part of the agent pipeline. See Section 6.

---

## 6. Tools & Clinic Finder

### Clinic Finder — standalone page, no agent involvement

The clinic finder is a self-contained page at `/clinics`. It does **not** go through the AI agent pipeline. Users search directly via the page UI; the API route proxies to Google Places API and returns results for display on a Google Map.

```
/clinics page (React)
      │
      │  user submits location + keyword
      ▼
/api/clinics/search (Next.js route handler)
      │
      │  server-side fetch — API key never exposed to browser
      ▼
Google Places Text Search API
      │
      ▼
Return clinic list → render on Google Map + list view
```

**No Supabase `clinics` table required for v1.** Results are returned directly from Google Places — no local caching in v1 (add cache layer in v2 if API costs become a concern).

### `health-kb` tool — `lib/tools/health-kb.ts`

**Function:** `retrieveHealthContext`  
**Input:** `{ query: string, top_k?: number }`  
**Output:** Array of `{ content, source, similarity_score }`  
**Implementation:** Embed query → pgvector hnsw similarity search on `knowledge_chunks`

```typescript
export async function retrieveHealthContext({ query, top_k = 5 }: RetrieveInput) {
  const embedding = await embedText(query);
  const { data } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: embedding,
    match_threshold: 0.75,
    match_count: top_k,
  });
  return data;
}
```

---

### `news` tool — `lib/tools/news.ts`

**Function:** `fetchHealthNews`  
**Input:** `{ query?: string, max_results?: number }`  
**Output:** Array of `{ title, source, url, published_at, description }`  
**External API:** NewsAPI (`/v2/everything`)  
**API route:** `/api/news` (proxied — keeps `NEWS_API_KEY` server-side)

Fixed search terms appended to every query: `cervical health OR HPV OR "women's health"`.  
Date range: last 7 days. Sorted by `publishedAt` descending.

```typescript
export async function fetchHealthNews({ query = "", max_results = 5 }: NewsInput) {
  const res = await fetch(`/api/news?q=${encodeURIComponent(query)}&max=${max_results}`);
  return res.json() as NewsArticle[];
}
```

**`/api/news` route handler (Next.js)**

```typescript
// app/api/news/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const max = Number(searchParams.get("max") ?? 5);
  const base = "cervical health OR HPV OR women's health";
  const query = q ? `(${q}) AND (${base})` : base;
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${from}&sortBy=publishedAt&pageSize=${max}&apiKey=${process.env.NEWS_API_KEY}`;
  const data = await fetch(url).then((r) => r.json());
  return Response.json(data.articles ?? []);
}
```

**New environment variable:** `NEWS_API_KEY`

---

### `events` tool — `lib/tools/events.ts`

**Function:** `findHealthEvents`  
**Input:** `{ location: string, query?: string, max_results?: number }`  
**Output:** Array of `{ name, date, location, url, description }`  
**External API:** SerpAPI (`/search?engine=google_events`) — same server-side proxy pattern as clinic finder  
**API route:** `/api/events` (proxied — keeps `SERPAPI_KEY` server-side)

Default keyword appended: `women's health OR cervical screening OR HPV`.

```typescript
export async function findHealthEvents({ location, query = "", max_results = 5 }: EventsInput) {
  const res = await fetch(
    `/api/events?location=${encodeURIComponent(location)}&q=${encodeURIComponent(query)}&max=${max_results}`
  );
  return res.json() as HealthEvent[];
}
```

**`/api/events` route handler (Next.js)**

```typescript
// app/api/events/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const location = searchParams.get("location") ?? "";
  const q = searchParams.get("q") ?? "";
  const max = Number(searchParams.get("max") ?? 5);
  const keyword = `${q} women's health cervical screening HPV`.trim();

  const url = `https://serpapi.com/search?engine=google_events&q=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&num=${max}&api_key=${process.env.SERPAPI_KEY}`;
  const data = await fetch(url).then((r) => r.json());

  const events = (data.events_results ?? []).slice(0, max).map((e: any) => ({
    name: e.title,
    date: e.date?.when,
    location: e.address?.join(", "),
    url: e.link,
    description: e.description,
  }));
  return Response.json(events);
}
```

**New environment variable:** `SERPAPI_KEY`

---

### Updated environment variables

```env
# News
NEWS_API_KEY=        # https://newsapi.org — free tier: 100 req/day

# Events
SERPAPI_KEY=         # https://serpapi.com — free tier: 100 req/month
```
