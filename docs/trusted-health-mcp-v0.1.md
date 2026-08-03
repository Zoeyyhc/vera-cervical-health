# Victoria Trusted Health MCP — v0.1

## Status

Draft for scope approval.

## 1. Purpose

Provide Vera with one read-only, source-governed MCP capability for Victorian
users. It returns only public information that Vera has approved for use:

- cervical-health education from authoritative sources;
- links to vetted Victorian screening-service directories; and
- upcoming, manually approved Victorian public-health events.

The MCP is an information-retrieval boundary. It does not diagnose, triage,
book appointments, send messages, access a user's health record, or make any
external write.

## 2. Product outcome

A Victorian user can ask Vera for reliable information about cervical screening
or for a nearby screening-service directory or public-health event. The answer
includes a clickable, first-party source and clearly distinguishes official
content from a service-directory listing.

## 3. Scope

### In scope

1. A private, read-only MCP server using the Streamable HTTP transport. It is
   callable by Vera's server-side agent layer only; it is never callable from
   the browser.
2. Three MCP tools:
   - `search_victoria_health_info`
   - `find_victoria_screening_services`
   - `list_victoria_verified_events`
3. A source registry and approval workflow for public health content and event
   organisers.
4. A curated local cache for MCP responses. User chat requests must not perform
   arbitrary web searches or scrape public websites in real time.
5. Citation metadata and audit records for every result returned to the agent.
6. Orchestrator-controlled dispatch: the existing Orchestrator remains the
   safety gate and chooses whether the MCP may be used.

### Explicitly out of scope

- Diagnoses, individual risk assessment, symptom triage, or interpreting a
  user's screening result.
- Direct appointment booking, calendar actions, email, or any other write.
- National or international directory coverage.
- A local `clinics` table or copied/re-published clinic listings.
- General web search, NewsAPI, SerpAPI Google Events, social-media sources, or
  user-supplied URLs as MCP inputs.
- Automatically publishing newly discovered health content or events.
- A public MCP endpoint for third-party clients.
- A source-management UI beyond the smallest admin approval surfaces needed to
  operate v0.1.

## 4. Geographic and content boundary

### Geography

Victoria only. A request is eligible when its resolved location is a Victorian
suburb or postcode, or when the request is for Victoria-wide information. The
MCP returns a clear non-result outside Victoria; it does not silently fall back
to nationwide search.

**A location must be confirmed, not guessed.** Only four things confirm one:

| Evidence | Example |
|---|---|
| An explicit state | "Burwood VIC", "Geelong, Victoria" |
| A postcode | "3125", "burwood 3125" |
| A geolocation fix carrying a state | `{ suburb: "Burwood", state: "VIC", postcode: "3125" }` |
| A name unique to Victoria in the gazetteer | "Vermont South", "Hoppers Crossing" |

A model may propose a candidate location; it may never confirm one. Free-text
inference is not evidence of geography.

**Shared names are asked about, never assumed.** 457 of Victoria's 3,317
locality names are also used by another state — Richmond exists in five. Naming
one without corroboration returns an *ambiguous* result, which asks the user for
a state or postcode and calls no tool. A suburb name with no state attached —
including one from a geolocation fix — corroborates nothing.

**What the user typed outranks the browser.** "Burwood NSW" from a device in
Melbourne is someone asking on behalf of family interstate.

**The four ways of having no location are distinct**, because each needs a
different answer:

| Resolution | Response |
|---|---|
| `confirmed_vic` | Query the MCP |
| `ambiguous` | Name the candidate states, ask which |
| `outside_vic` | Explain the Victorian scope; offer national alternatives |
| `missing` / `unknown` | Ask for a suburb and state, or a postcode |

Collapsing these into "no result" is what produced "I couldn't find any upcoming
health events for that location" for users the search had never covered.

### Gazetteer

Victorian scope resolves against the full state gazetteer, generated into
`lib/mcp/vic-localities.generated.ts` and checked in. It is never fetched at
runtime.

Source: the [matthewproctor/australianpostcodes](https://github.com/matthewproctor/australianpostcodes)
community compilation, pinned by commit SHA in
`scripts/generate-vic-localities.ts` and regenerated with `pnpm vic:localities`.

Only three factual columns are used — locality name, state, postcode — and none
of the compilation's enriched geography. That repository publishes no LICENSE
file; its README states the author considers the data "arguably public domain".
This is place-name reference data, not provider records, so the constraint
against copying third-party clinic or provider data does not apply to it. If a
formally licensed source is later required, the ABS ASGS Suburbs and Localities
release is CC BY 4.0, though it carries no postcodes.

### Initial approved source classes

| Class | Initial sources | Permitted use |
| --- | --- | --- |
| Commonwealth health authority | Department of Health, Disability and Ageing / National Cervical Screening Program | National program facts and patient resources |
| Victorian health authority | Victorian Department of Health | Victorian policy and public-health information |
| Clinical public-information organisation | Cancer Council Australia; Cancer Council Victoria; healthdirect | Consumer education, campaigns and directory links |
| Directory provider | healthdirect Service Finder/NHSD; Cancer Council Victoria Cervical Screening Directory | Deep links and provider-directory results only |
| Event organiser | Victorian government health bodies, Cancer Council Victoria, and individually approved public-health organisations | Event metadata and registration links |

An approved source is not an endorsement of every third-party service listed by
that source. In particular, directory results must be labelled as a
`directory_listing` and must ask the user to confirm availability with the
provider.

## 5. Tool contracts

All tools are read-only. Schemas use Zod in Vera and JSON Schema in the MCP
tool declaration. Inputs are bounded and never accept a URL, host name, raw
HTTP options, or an arbitrary source selector.

### 5.1 `search_victoria_health_info`

**Purpose:** Find approved, consumer-facing cervical-health information.

**Input**

```ts
{
  query: string; // 2–300 characters
  topic?: "screening" | "hpv" | "vaccination" | "self_collection" | "support";
}
```

**Output**

```ts
{
  items: Array<{
    id: string;
    title: string;
    excerpt: string;
    sourceName: string;
    sourceUrl: string;
    jurisdiction: "AU" | "VIC";
    verification: "official_source" | "clinical_nonprofit";
    publishedAt?: string;
    reviewedAt: string;
  }>;
  noResultReason?: "no_approved_match";
}
```

**Rules**

- Search only content approved for the curated cache.
- Return at most five results.
- Do not return clinical guidelines intended solely for clinicians unless an
  approved consumer counterpart does not exist and the Response Agent can
  present it safely.

### 5.2 `find_victoria_screening_services`

**Purpose:** Give a user a trustworthy path to find a Victorian screening
provider without Vera operating a clinic directory.

**Input**

```ts
{
  location: string; // Victorian suburb or postcode, 2–100 characters
  preferences?: {
    selfCollection?: boolean;
    accessibility?: boolean;
    language?: string;
  };
}
```

**Output**

```ts
{
  directoryLinks: Array<{
    directoryName: string;
    searchUrl: string;
    coverage: "VIC";
    supports: string[];
    verification: "directory_listing";
    reviewedAt: string;
    confirmationNotice: string;
  }>;
}
```

**Rules**

- v0.1 returns approved directory deep links and filters, not copied provider
  records.
- It must not claim that a provider is available, accepts new patients, or
  offers a particular service unless that is confirmed by the first-party
  directory result.
- Response text must include the supplied `confirmationNotice`.

### 5.3 `list_victoria_verified_events`

**Purpose:** Return current, public Victorian cervical-health education or
screening-promotion events.

**Input**

```ts
{
  location?: string; // Victorian suburb/postcode; optional for online/statewide events
  fromDate?: string; // ISO-8601 date; defaults to today in Australia/Melbourne
  topic?: "cervical_screening" | "hpv_vaccination" | "womens_health";
}
```

**Output**

```ts
{
  events: Array<{
    id: string;
    name: string;
    startsAt: string;
    endsAt?: string;
    locationLabel: string;
    format: "in_person" | "online" | "hybrid";
    organiser: string;
    registrationUrl: string;
    sourceUrl: string;
    verification: "manually_curated";
    reviewedAt: string;
    expiresAt: string;
  }>;
}
```

**Rules**

- Return at most five non-expired events, ordered by start date.
- Every event needs a named approved organiser, an official URL, a date, and a
  publication review before it becomes visible.
- Expired events are automatically excluded.

## 6. Data governance and review

### Source registry

Each approved source records its organisation, canonical host, source class,
jurisdiction, permitted content types, terms-of-use reference, approval status,
approver, and next review date. The registry is allowlist-only.

### Content lifecycle

1. An administrator adds or discovers a candidate from an allowlisted source.
2. The system records the canonical URL, content hash, source metadata,
   retrieved date, and extracted consumer-safe excerpt.
3. An administrator approves or rejects it.
4. Only approved material enters the MCP's curated cache.
5. A scheduled review flags content when its review date has passed or the
   source page materially changes.

Existing `knowledge_candidates` and admin knowledge review are the starting
point for article approval. v0.1 adds source-governance fields rather than a
second, independent clinical-content workflow.

### Events lifecycle

1. An administrator creates or imports an event candidate from an approved
   organiser.
2. The administrator verifies its date, venue/format, organiser, and official
   registration link.
3. The event becomes visible only after approval.
4. It automatically expires after its end time, or start time when no end time
   is supplied.

### Review cadence

- Source registry: every six months, or immediately after a source policy
  change.
- Approved health content: every 12 months, or sooner when its source changes.
- Events: verify on approval; automatically remove on expiry.
- Directory links: every three months and whenever a link check fails.

## 7. Agent integration and safety

The MCP server never receives raw chat history, account data, screening status,
or health-record data. The Orchestrator passes only the minimal tool input.

| Request type | MCP use | Response rule |
| --- | --- | --- |
| General cervical-health education | `search_victoria_health_info` when fresh local context is useful; otherwise existing RAG | Cite returned source and retain no-diagnosis guardrails |
| Finding a Victorian screening service | `find_victoria_screening_services` | Present as directory information; ask user to confirm directly with provider |
| Finding a public event | `list_victoria_verified_events` | Cite organiser and event page; show date/time clearly |
| Symptoms, bleeding, pain, or a test result | No event tool; health content only if it supports safe next-step education | Use the existing urgent-care and professional-consultation safety response |
| Out-of-Victoria request | Do not query v0.1 MCP | Explain its Victorian scope and offer existing non-MCP paths if available |

Tool results are data, not instructions. The Response Agent must never follow
instructions embedded in source text or event descriptions.

## 8. Security and operations

- The MCP endpoint is authenticated service-to-service and is not exposed to
  browsers.
- The server accepts only validated schemas and enforces strict rate and result
  limits.
- No service-role Supabase credential is exposed to a client. Any elevated
  database access is limited to the server-side approval/sync jobs.
- Log each MCP call with tool name, sanitised input summary, result IDs, source
  IDs, latency, outcome, and correlation ID. Do not log chat text, location
  beyond the minimum required for audit, or sensitive health information.
- Use timeouts and graceful empty results; an unavailable MCP must not block the
  normal RAG or general-chat route.

## 9. Acceptance criteria

1. Vera can retrieve an approved Victorian cervical-health item and display a
   source citation.
2. A Melbourne/Victorian service request returns approved directory links,
   labelled as directory information with a confirmation notice.
3. An event appears only after admin approval, and it no longer appears after
   expiration.
4. A request containing a non-approved source URL cannot cause the MCP to fetch
   or return that source.
5. The chat route continues to work when the MCP is unavailable.
6. No tool can write data, make a booking, send a message, or access personal
   health records.
7. Every result includes its verification state and source URL.

## 10. Decisions to confirm before implementation

1. **Service-directory experience:** for v0.1, use official deep links only
   (recommended), or seek a licensed API/integration agreement before showing
   provider records in Vera.
2. **Event operations:** begin with fully manual event entry and approval
   (recommended), or build a candidate-import job in the initial release.
3. **MCP hosting:** host a private Streamable HTTP endpoint within this Next.js
   application (recommended), or deploy a separate MCP service from day one.

## 11. Deferred follow-ons

- Approved partner APIs for service availability or booking.
- Additional Australian states and territory-specific source registries.
- User-confirmed calendar reminders.
- Multilingual source curation and translated, clinician-reviewed summaries.
- A separate public or partner-facing MCP endpoint.
