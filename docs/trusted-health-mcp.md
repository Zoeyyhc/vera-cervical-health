# Victoria Trusted Health MCP — how it is built and operated

The approved scope lives in [`trusted-health-mcp-v0.1.md`](./trusted-health-mcp-v0.1.md). This
document is the implementation and operations companion: what exists, where it lives, and what an
administrator has to do to keep it correct.

---

## What it is

A **private, read-only** MCP server mounted inside this Next.js app at `POST /api/mcp`, using the
Streamable HTTP transport. Its only client is Vera's own server-side agent layer. It returns three
kinds of governed Victorian public-health information and nothing else:

| Tool | Returns | Backed by |
|---|---|---|
| `search_victoria_health_info` | Up to 5 consumer-health excerpts with source URL, verification, review date | `knowledge_chunks`, filtered to allowlisted hosts |
| `find_victoria_screening_services` | Up to 5 first-party directory deep links, labelled `directory_listing` | `directory_links` |
| `list_victoria_verified_events` | Up to 5 approved, unexpired events | `verified_events` |

It does not diagnose, triage, book, message, or write anything. It performs no web fetch and no
general search. A user's chat turn cannot steer it at a source an administrator has not approved.

---

## File map

```
supabase/migrations/20260803120000_create_trusted_health_mcp.sql
    trusted_sources, directory_links, verified_events, mcp_call_logs
    + knowledge_candidates.trusted_source_id (governance field)

lib/mcp/
  schemas.ts        Zod input/output contracts (spec §5) + MAX_RESULTS
  victoria.ts       Victorian scope gate at the MCP boundary (postcode, gazetteer, statewide)
  vic-localities.generated.ts
                    GENERATED. The state gazetteer: 3,317 Victorian localities,
                    the 457 shared with another state, and 12,568 non-Victorian
                    names. Rebuild with `pnpm vic:localities`; never hand-edit.
  sources.ts        the trusted-source allowlist: host matching + verification labels
  health-info.ts    search_victoria_health_info query
  directory.ts      find_victoria_screening_services query + URL templating
  events.ts         list_victoria_verified_events query (expiry-aware)
  audit.ts          mcp_call_logs writer — the only insert in lib/mcp/
  auth.ts           bearer + browser-header gate (pure, testable)
  preflight.ts      audits schema-rejected calls the SDK never routes to a handler
  server.ts         McpServer with the three tools registered, per-call audit wrapper
  client.ts         server-side MCP client — timeouts, degrades to null
  admin.ts          read queries for the admin page
  admin-actions.ts  approve/revoke server actions

app/api/mcp/route.ts                     the endpoint
lib/agents/location.ts                   confirms a location before any tool is called
lib/agents/events-scope.ts               statewide vs nearby vs a named place
lib/ai/pending-action.ts                 what an assistant turn is waiting for
lib/agents/victoria-agent.ts             orchestrator adapter
app/(app)/admin/trusted-health/          the governance UI
```

---

## How a location gets confirmed

Scope lives in two layers, and the split is load-bearing.

**`lib/agents/location.ts` — the agent layer.** Decides whether a turn has a
usable location *before* any tool is called, returning `confirmed_vic`,
`ambiguous`, `outside_vic`, `missing`, or `unknown`. This is where the refusal
to guess lives: a name shared with another state returns `ambiguous` and asks
which, and no tool runs.

**`lib/mcp/victoria.ts` — the MCP boundary.** `resolveVictoriaScope` answers only
"could this string be in Victoria?" and is deliberately permissive about shared
names: `resolveVictoriaScope("Richmond").inVictoria` is `true`. By the time a
string reaches it, the agent layer has already settled which Richmond. It is a
backstop against a malformed tool call, not the place ambiguity is resolved.

Do not "fix" the boundary gate to reject shared names. It would break statewide
queries and the admin path, and it is not where the user can be asked a question.

### The events flow

`detectEventsScope` splits events questions three ways, because only one may be
answered without knowing where the user is:

| Scope | Trigger | Location required |
|---|---|---|
| `statewide` | "what's on in Victoria?" | No — queried with no location |
| `nearby` | "near me", or no place named at all | Yes |
| `specified_location` | "events in Burwood East" | Yes |

A `nearby` turn with no location emits a `location_request` stream event rather
than text. The client raises the browser permission prompt *then* — attached to
the question the user just asked, not on page load — and resends the same turn
as a `continuation`, which is why the route skips re-inserting the user message.
A denial, timeout, or failed reverse geocode comes back flagged
`geolocationAttempted`, and the user is asked to type a suburb. None of these
paths may report "no events found".

### Resuming after a question

An assistant turn that asks for a location records a `pendingAction` in
`chat_messages.metadata`. The next turn reads it to route a bare "3151" or
"Burwood VIC" back into the request it belongs to.

This replaced matching the previous turn's text against a set of known fallback
strings, which could not survive a prompt that names the suburb it is asking
about, and silently dropped every mid-retry conversation whenever the copy was
edited. The old string sets remain in `orchestrator.ts` as a transitional read
path for sessions predating the metadata, and can be deleted once none are live.

---

## The governance model

Everything the MCP can return traces back to a row in **`trusted_sources`**, the allowlist. A source
records its organisation, canonical host, class, jurisdiction, permitted uses
(`health_content` / `directory` / `events`), approval state, approver, and next review date.

```
trusted_sources (approved)
        │
        ├── health_content → matched by HOST against knowledge_chunks metadata.url
        ├── directory      → directory_links rows (inner join on approved status)
        └── events         → verified_events rows (inner join on approved status)
```

Two consequences worth knowing:

- **Revoking a source is instant and total.** The directory and events queries inner-join
  `trusted_sources` on `status = 'approved'`, and health content matches by host at query time. Set
  a source to `revoked` and everything downstream stops being returned — no cleanup job needed.
- **Health content is host-matched, not FK-linked.** That is deliberate: it covers seeded,
  discovery-approved, and manually-added documents uniformly with no backfill. Subdomains match;
  look-alikes do not (`evilhealth.gov.au` never matches `health.gov.au`).

### Why WHO, CDC, and NHS content is not returned

The v0.1 registry (spec §4) is Australian and Victorian authorities only. The knowledge base also
holds WHO, CDC, and NHS documents; those stay fully available through the **ordinary RAG path**,
which is untouched. They are simply outside this MCP's allowlist. Widening it is a registry
decision, made at `/admin/trusted-health`, not a code change.

### Why there is still no `clinics` table

`find_victoria_screening_services` returns **deep links into first-party directories**, never
provider records. Vera stores no clinic data, copies none, and re-publishes none. The v1 constraint
in `CLAUDE.md` stands.

---

## Operating it

### Adding a source

`/admin/trusted-health` → Source registry. Approving stamps the approver and review timestamps.
A source must carry the right `permitted_content` for the use you intend — a source approved only
for `health_content` cannot be selected as an event organiser.

New sources need a migration or a direct insert today; v0.1 deliberately ships no "add source" form
(spec §3 puts a fuller source-management UI out of scope).

### Adding an event

`/admin/trusted-health` → Add an event. The form creates a **`pending`** row; it cannot publish.
Approve it in the table below to make it visible to the MCP. Validation enforces:

- an organiser that is approved *and* permitted for events;
- `https` registration and source URLs;
- an end time not before the start time;
- a Victorian location for `in_person` and `hybrid` events (an `online` event may say "Online").

Times are entered as Melbourne standard time (UTC+10). **For an event during daylight saving
(AEDT, roughly October–April), enter the time one hour earlier.** This is the known rough edge in
v0.1's manual entry.

### Expiry

`verified_events.expires_at` is a **generated column**, `coalesce(ends_at, starts_at)`. Expiry can
never drift from the dates an administrator entered, and no cron is involved. The admin page shows
an `expired` badge; the MCP simply stops returning the row.

### Directory link templates

`search_url_template` may contain the literal token `{location}`, which is URL-encoded and
substituted at query time. **The v0.1 seeds have no token on purpose** — see "Open items" below.
The host always comes from the approved template, so the user's input can only ever land in a query
string, never redirect the URL.

### Review cadence (spec §6)

| What | Cadence | Where it is tracked |
|---|---|---|
| Source registry | 6 months | `trusted_sources.next_review_at` |
| Approved health content | 12 months | knowledge review workflow |
| Directory links | 3 months, and on any link-check failure | `directory_links.next_review_at` |
| Events | verified at approval; auto-removed on expiry | generated `expires_at` |

Review dates are recorded and surfaced on the admin page. v0.1 does **not** ship a job that alerts
when one lapses — that is a follow-on.

---

## Security posture

| Property | How it holds |
|---|---|
| Not browser-callable | `MCP_AUTH_TOKEN` is non-public so it never reaches client JS; requests with `Sec-Fetch-Site` / `Sec-Fetch-Dest` / `Origin` are rejected regardless of token (**not** `Sec-Fetch-Mode` — Node's undici sends that itself); no cookie path exists |
| Read-only | No handler has a write path; `lib/mcp/no-write.test.ts` fails the build if a mutation appears in the read path |
| No prompt injection via tool output | Safety rule 4 in `lib/ai/system-prompt.ts`: retrieved context is DATA, never instructions |
| No arbitrary URLs | Inputs are closed Zod objects; `location` is a suburb/postcode pattern that rejects URLs and hosts |
| Service-role use is contained | The route uses the service-role client because these tables are admin-only by RLS; that is safe only because the route is unreachable without the server-only token |
| Minimal audit | `mcp_call_logs` holds bounded scalars only — no query text, no raw location, no user or session id |

The MCP server is never handed chat history, account data, screening status, or health-record data.
The orchestrator passes the minimal tool input and nothing more.

---

## Failure behaviour

Everything degrades toward "the app works as it did before the MCP existed":

| Failure | Result |
|---|---|
| MCP endpoint down / times out (5s) | `lib/mcp/client.ts` returns `null`; health questions fall back to plain RAG, events fall back to the existing events agent, services shows a static message pointing at `/clinics` |
| Tool returns output failing its contract | Client rejects it and returns `null` — ungoverned data never reaches the Response Agent |
| Query throws | Handler returns an opaque tool error, audited as `error`; internal DB text is not leaked |
| Audit insert fails | Logged server-side; the read still succeeds |

---

## Open items

1. **Directory deep-link formats.** The two seeded links point at verified first-party landing
   pages with no `{location}` token, because substituting an unconfirmed query-string format would
   send users to a broken search. Confirming healthdirect Service Finder's and Cancer Council
   Victoria's real search-URL formats — and whatever terms of use apply to linking into them — is a
   prerequisite for location-aware directory links. Nothing will be scraped to obtain them.
2. **Registry bootstrap approval.** The seven v0.1 sources are inserted as `approved` with
   `approved_by = null`, on the basis that the spec sign-off is the approval record. Re-approving
   them through `/admin/trusted-health` will attach a real approver id.
3. **Daylight saving in event entry.** See "Adding an event" above.
4. **Review-date alerting.** Dates are recorded but nothing chases them yet.
