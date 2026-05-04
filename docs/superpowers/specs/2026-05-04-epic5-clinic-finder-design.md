---
epic: 5
status: approved
date: 2026-05-04
scope: M + S items from sprints.md §Epic 5 (excludes "Save / favourite clinics")
---

# Epic 5 — Clinic Finder — Design

## Goal

A standalone clinic search page at `/clinics` that lets a user enter a keyword (e.g. "cervical screening") and a location (text or browser geolocation), and shows matching clinics as a synchronized list + map, with inline-expandable detail per clinic.

The page is **not** part of the agent pipeline — it calls `/api/clinics/search` directly, which proxies to the Google Places API (New) Text Search endpoint with the API key injected server-side.

## In Scope

| Sprint 5 feature (sprints.md) | MoSCoW | Ticket |
|---|---|---|
| `/api/clinics/search` (Google Places proxy) | M | EPIC5-03 |
| Clinic search page (keyword + location input) | M | EPIC5-04, EPIC5-05 |
| Google Maps display of results | M | EPIC5-06 |
| User geolocation (Geolocation API) | S | EPIC5-07 |
| Clinic detail view (inline expand) | S | EPIC5-08 |

## Out of Scope

- Save / favourite clinics (C item — deferred to v2; would require a `clinic_favourites` table + RLS)
- Persisting recent searches
- Custom distance / rating sorting
- Clinic-finder i18n (i18n is Epic 8)
- Persistent shareable detail URL (Google `place_id` is stable but v1 has no need)

## Architecture

### Page → API → Google flow

```
Browser
  └─ app/(app)/clinics/page.tsx           (client component)
       └─ fetch("/api/clinics/search?location=...&keyword=...")
            └─ app/api/clinics/search/route.ts   (server, no auth)
                 └─ POST https://places.googleapis.com/v1/places:searchText
                      Headers: X-Goog-Api-Key, X-Goog-FieldMask
```

Per `CLAUDE.md` and `docs/api-routes.md`: the page calls our route directly, no agent involvement; the Google Maps API key is server-side only and never returned in the response body.

### Component structure (post-port)

```
app/(app)/clinics/
  page.tsx                          # client component — top-level shell
components/clinics/
  clinic-search-bar.tsx             # keyword + location + "Use my location" + Search
  clinic-list.tsx                   # virtualized? no — bounded by Places API page size (≤20)
  clinic-card.tsx                   # collapsed card; controls inline expand
  clinic-detail-panel.tsx           # expanded detail (address, phone, hours, deep link)
  clinic-map.tsx                    # @vis.gl/react-google-maps wrapper, pins from list
  clinic-empty-state.tsx
  clinic-error-state.tsx
  clinic-loading-skeleton.tsx
types/clinic.ts                     # ClinicResult type + Zod schema
lib/schemas/clinic.ts               # search query Zod schema + clinic Zod schema
```

### State

Page-local React state — no Zustand store needed. Shape:

```ts
type SearchState = {
  keyword: string;
  location: string;
  results: ClinicResult[];
  status: "idle" | "loading" | "ok" | "empty" | "error";
  selectedPlaceId: string | null;   // for list ↔ map highlight + inline expand
};
```

`selectedPlaceId` is the single source of truth that drives both the inline-expanded card and the highlighted map pin.

### `ClinicResult` shape (from Google Places New API)

```ts
type ClinicResult = {
  placeId: string;                  // stable Google ID — also React key
  name: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  phone?: string;                   // internationalPhoneNumber
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;
  weekdayDescriptions?: string[];   // ["Monday: 9:00 AM – 5:00 PM", ...]
  distanceMeters?: number;          // computed client-side from user location if available
  googleMapsUri: string;            // for "Open in Google Maps"
};
```

The route handler maps Google's snake-cased fields (`place_id`, `formatted_address`, `current_opening_hours.open_now`, …) to this camelCase shape and validates with Zod before returning.

## Lovable Workflow

1. **EPIC5-01** — I author `docs/lovable/epic5-clinic-finder-prompt.md`. Two prompts: (a) main UI shell, (b) geolocation follow-up. Prompts include cream-palette tokens, weight-600 cap, mock data shape matching `ClinicResult`, and explicit instruction to use a placeholder grey rectangle for the map (not a real Maps integration).
2. **You** — Take the prompt to lovable.dev, iterate visually until satisfied, push the result to any GitHub repo (Lovable's built-in GitHub export).
3. **EPIC5-04** — Port the produced components into `app/(app)/clinics/` and `components/clinics/`. Steps: copy `.tsx` files; add `'use client'` to interactive components; rewrite `react-router` hooks as no-ops or remove (single page); fix import aliases to our `@/components/ui/*`; remove the Vite shell (`main.tsx`, `App.tsx`, `vite.config.ts`); diff Tailwind classes against `docs/design-tokens.md` and replace any `bg-white`, `font-bold`, or arbitrary greys.
4. **EPIC5-05+** — Wire to real backend, replace placeholder map, add geolocation, polish detail expand.

## Tickets (8 GitHub issues)

Each ticket maps to a single PR. Acceptance criteria below are the minimum bar for "done"; pick a Vitest where unit-testable, mock the network at the route boundary.

### EPIC5-01 — Author Lovable prompts
**Depends on:** —
**Deliverable:** `docs/lovable/epic5-clinic-finder-prompt.md` committed.

**AC:**
- Main prompt covers: visual tokens (cream/charcoal/no white, weight ≤ 600, font fallback), layout (60/40 desktop, stacked mobile), search bar, clinic card collapsed/expanded states, placeholder map, all loading/empty/error states, mock data with five Sydney women's-health-flavoured clinics matching the `ClinicResult` shape.
- Follow-up prompt isolates the geolocation permission UX (idle/granted/denied/unavailable copy + button states).
- File ends with a "Porting checklist" section enumerating the manual steps for EPIC5-04 (so future-me doesn't re-derive them).

### EPIC5-02 — `ClinicResult` type + Zod schema
**Depends on:** —
**Deliverable:** `types/clinic.ts`, `lib/schemas/clinic.ts`.

**AC:**
- `types/clinic.ts` exports the `ClinicResult` type (shape above).
- `lib/schemas/clinic.ts` exports `clinicResultSchema` (Zod) and `clinicSearchQuerySchema` for `{ location: string (1..200), keyword?: string (max 200) }`.
- Vitest snapshot of the schema's `safeParse` against a fixture `ClinicResult` and a malformed payload.

### EPIC5-03 — `/api/clinics/search` route
**Depends on:** EPIC5-02
**Deliverable:** `app/api/clinics/search/route.ts`.

**AC:**
- `GET` handler. Reads `location` and `keyword` from `request.nextUrl.searchParams`; validates with `clinicSearchQuerySchema`.
- `POST`s to `https://places.googleapis.com/v1/places:searchText` with body `{ textQuery: "<keyword> <location>" }` (or `{ textQuery: location }` when no keyword).
- Sends `X-Goog-Api-Key: process.env.GOOGLE_MAPS_API_KEY` and `X-Goog-FieldMask` set to: `places.id,places.displayName,places.formattedAddress,places.location,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.currentOpeningHours.openNow,places.currentOpeningHours.weekdayDescriptions,places.googleMapsUri`.
- Maps the upstream response to `ClinicResult[]` and validates each with `clinicResultSchema` (drops invalid entries with a server-side `console.warn`, never throws on a single bad row).
- Returns `Response.json({ clinics: ClinicResult[] })`.
- 400 on Zod fail; 502 on upstream non-2xx; 500 on unexpected error. None of those expose the API key.
- Vitest mocks `fetch` and asserts: header `X-Goog-Api-Key` present, body `textQuery` shape, mapped output shape, 502 on upstream 500.
- `GOOGLE_MAPS_API_KEY` documented in `docs/env-vars.md` and `.env.example`.

### EPIC5-04 — Port Lovable UI shell into `app/(app)/clinics/`
**Depends on:** EPIC5-01 (you complete the Lovable side externally), EPIC5-02
**Deliverable:** `app/(app)/clinics/page.tsx` + `components/clinics/*`.

**AC:**
- Page renders with the mock data the Lovable prompt specified (no live API yet).
- All interactive components have `'use client'`.
- Zero `bg-white`, zero `font-bold` / `font-extrabold`, zero arbitrary greys (`#xxx` not in design-tokens.md).
- Imports resolve through `@/components/ui/*` (shadcn) and `@/components/clinics/*`.
- Renders correctly at 375px, 768px, 1280px breakpoints.
- Vitest renders `page.tsx` with mock data and snapshot-tests the visible card list.

### EPIC5-05 — Wire UI to `/api/clinics/search`
**Depends on:** EPIC5-03, EPIC5-04
**Deliverable:** Replace mock data with real `fetch` call; add loading / empty / error states.

**AC:**
- Submitting the search bar calls `fetch("/api/clinics/search?location=…&keyword=…")`.
- `status` machine drives UI: skeleton during `loading`, friendly empty state when `clinics.length === 0`, error state with retry on non-2xx, results list otherwise.
- Network error renders the error component (no unhandled promise rejections).
- Vitest mocks `fetch` and asserts each of the four UI states renders given the matching response.

### EPIC5-06 — Google Maps integration with list↔pin sync
**Depends on:** EPIC5-04
**Deliverable:** Replace placeholder map with `@vis.gl/react-google-maps`.

**AC:**
- `@vis.gl/react-google-maps` added to `package.json` (pinned).
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` documented in `docs/env-vars.md` and `.env.example`. **This is a separately-scoped Google Maps JavaScript API key with referrer restrictions** — NOT the server-side Places key from EPIC5-03 (Google's quota and security model treat them as different surfaces).
- Map auto `fitBounds` to all result pins on each search.
- Hovering or selecting a list card highlights its pin (visual delta — colour or scale); clicking a pin sets `selectedPlaceId` and scrolls the corresponding card into view + expands it.
- Empty results: map shows the searched location centred, no pins.
- No Vitest for the map itself (third-party canvas); a render-without-crash assertion is enough.

### EPIC5-07 — User geolocation
**Depends on:** EPIC5-05
**Deliverable:** "Use my location" button + permission flow.

**AC:**
- Button calls `navigator.geolocation.getCurrentPosition`.
- `granted` → reverse-geocode lat/lng to a city string via Google Places `searchText` (re-using EPIC5-03 with a special `latlng` mode) **OR** simply pre-fill `location` with `"<lat>,<lng>"` (Google Places accepts coords). Pick the simpler path; document choice in the PR description.
- `denied` → inline message "Location permission denied — please type a city or postcode above." Button stays enabled so they can retry.
- `unavailable` (no `navigator.geolocation`) → button hidden.
- Computes `distanceMeters` per result client-side from the granted coords (Haversine; util in `lib/utils/geo.ts`).
- Vitest covers the three permission outcomes via a stubbed `navigator.geolocation`.

### EPIC5-08 — Clinic detail inline expand
**Depends on:** EPIC5-04
**Deliverable:** Detail accordion content.

**AC:**
- Clicking a card toggles `selectedPlaceId`; only one card expanded at a time.
- Expanded content shows: full `formattedAddress`, `internationalPhoneNumber` as `tel:` link, `weekdayDescriptions` rendered as a 7-row list with today highlighted, "Open in Google Maps" link → `googleMapsUri`.
- Missing fields render gracefully (no "undefined" strings).
- Keyboard accessible: `Enter`/`Space` on the card toggles expand; expanded panel has `aria-expanded` on the trigger.
- Vitest: render with one selected card and assert all conditional fields handle undefined.

## Cross-cutting decisions

- **Map library**: `@vis.gl/react-google-maps` — Google's official React wrapper, actively maintained (preferred over the older `@react-google-maps/api`).
- **Two Google API keys**: server-side Places (Text Search) key and browser Maps JS key. Keep them separate per Google's recommended security model (the browser key is referrer-locked; the Places key is server-only).
- **Distance calculation**: client-side Haversine; do not ask Google for it (extra cost + latency).
- **Caching**: none for v1 — Places searches are cheap and locale-dependent. Revisit if cost spikes.
- **Authentication**: page and `/api/clinics/search` are public per `docs/api-routes.md` (None auth). Do not add an auth gate.
- **No `clinics` table**: per `CLAUDE.md` constraint — clinic data lives in Google's API only. Favouriting (C item) would change this; out of scope.

## Risks

- **Lovable port friction**: Lovable may emit `react-router-dom` imports, default exports, `bg-white` defaults, font-weight 700 headings. EPIC5-04 acceptance criteria explicitly catch each of these. Budget ~3 hours for the port.
- **Places API field availability**: not every clinic has `internationalPhoneNumber` or `currentOpeningHours`. The schema marks them `.optional()` and the UI handles missing fields gracefully (EPIC5-08 AC).
- **Geolocation HTTPS requirement**: `navigator.geolocation` requires a secure context. `localhost` is treated as secure for dev; deployed to Vercel which is HTTPS by default. Not a blocker.

## Verification (epic completion)

Once EPIC5-08 is merged, run a single Playwright pass covering: keyword search → results render → click card → detail expands → "Use my location" → permission denied path. Per `CLAUDE.md`, Playwright runs only when manually requested — schedule this as a final epic-level verification, not per ticket.
