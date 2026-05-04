# Epic 5 — Clinic Finder — Lovable Prompts

> Deliverable for **EPIC5-01**. Two prompts to give to lovable.dev. The output gets ported into this repo's `app/(app)/clinics/` and `components/clinics/` per the porting checklist at the bottom.
>
> **Important**: Lovable does *not* know our Google Maps API key and should not try to integrate real Google Maps. The map is rendered as a styled placeholder rectangle with mock pins. Real `@vis.gl/react-google-maps` is wired up later in EPIC5-06.

---

## Prompt 1 — Main UI shell

Paste the entire block below into a new Lovable project. Iterate visually until satisfied, then push to GitHub via Lovable's built-in export.

```
Build a single-page React + TypeScript + Tailwind + shadcn/ui app: a "Clinic Finder" for a women's cervical health platform. The page is calm, supportive, and information-dense — never clinical or alarming.

## Visual identity (HARD CONSTRAINTS — do not deviate)

- **Background**: cream `#f7f4ed` for the entire page and all surfaces. Never use pure white `#ffffff`. Off-white `#fcfbf8` is allowed only for text on dark buttons.
- **Text**: charcoal `#1c1c1c` (primary), `#5f5f5d` (secondary/captions/placeholders).
- **Borders**: passive containment uses `#eceae4` (light cream); interactive borders use `rgba(28,28,28,0.4)`.
- **Font**: stack `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. Do not load Google Fonts.
- **Font weight**: 400 for body / UI / buttons / links. 600 for headings. **Never use 700 or higher.** Tailwind: `font-normal`, `font-semibold` only — never `font-bold`.
- **Headings**: tight letter-spacing at scale (e.g. `tracking-tight` on 24px+).
- **Border radius**: 6px buttons/inputs, 8px small cards, 12px standard cards, 9999px only for icon/pill buttons.
- **Elevation**: cards use `1px solid #eceae4`, NOT box-shadows. Only dark buttons use a subtle inset shadow.
- **No saturated accent colours.** The palette is intentionally warm-neutral. Status indicators (e.g. "Open now") use a muted green `#3a6e4a`; error/closed uses muted brown-red `#8a4a3a`. No bright primary colours.

## Layout

- **Desktop ≥ 1024px**: 60% / 40% split. Left column = scrollable list of clinics with sticky search bar at top. Right column = sticky map placeholder filling viewport height.
- **Tablet 768–1023px**: full-width list with search bar; a "Show map" toggle button at top right swaps to a full-width map view with a "Back to list" button.
- **Mobile < 768px**: same toggle pattern as tablet; default view is the list.

Page max-width: 1280px, centred.

## Top search bar (sticky on the list column)

- Two text inputs side by side on desktop, stacked on mobile:
  1. **Keyword** — placeholder `"Cervical screening, Pap test, women's health…"`. Optional.
  2. **Location** — placeholder `"City, suburb, or postcode"`. Required.
- Right of the inputs:
  - A **"Use my location"** ghost button with a small pin icon (lucide-react `MapPin`).
  - A **"Search"** primary dark button.
- Below the inputs, a single line of helper text in muted gray: `"Results powered by Google Places. Always confirm details with the clinic before visiting."`

## Clinic list (collapsed card)

Each card uses `1px solid #eceae4`, 12px radius, 16px internal padding. Cards stack with 12px vertical gap. The full card surface is the click target (cursor pointer).

Layout per card (collapsed):
- **Top row**: clinic name (16px, weight 600) on the left; distance pill on the right (`"1.2 km"`, 14px, muted gray, no background).
- **Second row**: address (14px, weight 400, charcoal at 82% opacity) — single line, truncate with ellipsis.
- **Third row**: a small horizontal stack:
  - Open status badge — `"Open now"` (muted green) or `"Closed"` (muted brown-red). 12px, weight 400, 4px radius, 6px horizontal padding.
  - Phone number (14px, muted gray, prefixed by lucide `Phone` icon at 12px).
  - Rating (14px) — star glyph + `"4.6 (128)"`.
- **Right edge**: a chevron-down icon (lucide `ChevronDown`) that rotates 180° when expanded.

When the user clicks the card, it expands inline (accordion). Only one card may be expanded at a time. The selected card has a slightly darker border (`rgba(28,28,28,0.4)` instead of `#eceae4`).

## Clinic card (expanded — accordion content)

Below the collapsed content, with a `1px solid #eceae4` divider above:

- **Full address** — same line as collapsed but no truncation, with a small "Copy" ghost icon button to the right.
- **Phone** — `tel:` link, 16px charcoal, prefixed by `Phone` icon.
- **Opening hours** — a 7-row list (`Monday`–`Sunday`), each row: day name (left, 14px, muted) + hours (right, 14px, charcoal). Today's row is bold-ish (weight 600) and has a `rgba(28,28,28,0.04)` background. Use the `weekdayDescriptions` strings from the mock data verbatim.
- **"Open in Google Maps"** — outline ghost button, full-width on mobile, auto width on desktop. Icon: lucide `ExternalLink`.

All animations use a 150ms ease for hover/expand. No bouncy transitions.

## Map placeholder (right column on desktop, full-screen on mobile toggle)

Render a **placeholder rectangle** — not a real map:
- Background: `#eceae4` with a subtle dot grid overlay (`background-image: radial-gradient(circle at 1px 1px, rgba(28,28,28,0.1) 1px, transparent 0); background-size: 20px 20px;`).
- 5 circular pins absolutely positioned at varying coordinates inside the rectangle. Each pin: 24px circle, charcoal `#1c1c1c` background, white pin icon centred, 2px white outline.
- Below each pin, a small numeric badge `1`–`5` matching the list card index.
- A small floating caption in the corner: `"Map preview — interactive map will load here"` (12px, muted gray, white-cream pill background).
- The **selected** pin scales to 1.15× and gets a soft `rgba(0,0,0,0.1) 0px 4px 12px` shadow.

This is intentionally a placeholder — do NOT try to integrate Google Maps, Mapbox, or Leaflet.

## States

- **Loading**: list shows 5 skeleton cards (cream surface, animated shimmer at 4% opacity); map shows the placeholder rectangle without pins, with a centred small spinner.
- **Empty** (`results.length === 0`): list shows a centred empty state — small map-pin illustration (use lucide `MapPinOff` at 48px, charcoal at 40% opacity), heading `"No clinics found near that location"` (20px, weight 600), body `"Try a different city or broaden your keyword."` (16px, muted gray). Map placeholder shows the searched location centred with no pins.
- **Error**: similar centred layout, heading `"We couldn't reach the clinic search service"`, body `"Please try again in a moment."`, plus a primary dark `"Retry"` button.
- **Idle** (page just loaded, no search yet): list shows a friendly intro card at the top — heading `"Find a clinic near you"`, body `"Enter a city or use your current location to see clinics offering cervical health services."`, no error treatment. Map placeholder shows pins at default positions.

## Mock data (use this verbatim — matches the production `ClinicResult` type)

```ts
export const MOCK_CLINICS = [
  {
    placeId: "ChIJ_mock_01",
    name: "Inner West Women's Health Centre",
    formattedAddress: "12 Marrickville Rd, Marrickville NSW 2204",
    location: { lat: -33.9114, lng: 151.1551 },
    phone: "+61 2 9560 0001",
    websiteUri: "https://example.org/iwwhc",
    rating: 4.7,
    userRatingCount: 184,
    openNow: true,
    weekdayDescriptions: [
      "Monday: 9:00 AM – 5:30 PM",
      "Tuesday: 9:00 AM – 5:30 PM",
      "Wednesday: 9:00 AM – 7:00 PM",
      "Thursday: 9:00 AM – 5:30 PM",
      "Friday: 9:00 AM – 4:00 PM",
      "Saturday: 9:00 AM – 1:00 PM",
      "Sunday: Closed",
    ],
    distanceMeters: 1200,
    googleMapsUri: "https://www.google.com/maps/place/?q=place_id:ChIJ_mock_01",
  },
  {
    placeId: "ChIJ_mock_02",
    name: "Central Sydney Sexual Health",
    formattedAddress: "Level 3, 100 King St, Sydney NSW 2000",
    location: { lat: -33.8688, lng: 151.2093 },
    phone: "+61 2 9382 7440",
    rating: 4.5,
    userRatingCount: 96,
    openNow: false,
    weekdayDescriptions: [
      "Monday: 8:30 AM – 4:30 PM",
      "Tuesday: 8:30 AM – 4:30 PM",
      "Wednesday: 8:30 AM – 4:30 PM",
      "Thursday: 8:30 AM – 4:30 PM",
      "Friday: 8:30 AM – 4:00 PM",
      "Saturday: Closed",
      "Sunday: Closed",
    ],
    distanceMeters: 3400,
    googleMapsUri: "https://www.google.com/maps/place/?q=place_id:ChIJ_mock_02",
  },
  {
    placeId: "ChIJ_mock_03",
    name: "Family Planning Clinic — Newtown",
    formattedAddress: "328 Liverpool St, Darlinghurst NSW 2010",
    location: { lat: -33.8788, lng: 151.2167 },
    phone: "+61 2 8752 4300",
    rating: 4.8,
    userRatingCount: 312,
    openNow: true,
    weekdayDescriptions: [
      "Monday: 9:00 AM – 6:00 PM",
      "Tuesday: 9:00 AM – 6:00 PM",
      "Wednesday: 9:00 AM – 8:00 PM",
      "Thursday: 9:00 AM – 6:00 PM",
      "Friday: 9:00 AM – 5:00 PM",
      "Saturday: 9:00 AM – 1:00 PM",
      "Sunday: Closed",
    ],
    distanceMeters: 2100,
    googleMapsUri: "https://www.google.com/maps/place/?q=place_id:ChIJ_mock_03",
  },
  {
    placeId: "ChIJ_mock_04",
    name: "Northside Women's GP",
    formattedAddress: "55 Berry St, North Sydney NSW 2060",
    location: { lat: -33.8389, lng: 151.2073 },
    phone: "+61 2 9959 4321",
    rating: 4.3,
    userRatingCount: 58,
    openNow: true,
    weekdayDescriptions: [
      "Monday: 8:00 AM – 6:00 PM",
      "Tuesday: 8:00 AM – 6:00 PM",
      "Wednesday: 8:00 AM – 6:00 PM",
      "Thursday: 8:00 AM – 6:00 PM",
      "Friday: 8:00 AM – 5:00 PM",
      "Saturday: Closed",
      "Sunday: Closed",
    ],
    distanceMeters: 5600,
    googleMapsUri: "https://www.google.com/maps/place/?q=place_id:ChIJ_mock_04",
  },
  {
    placeId: "ChIJ_mock_05",
    name: "Eastern Suburbs Women's Wellness",
    formattedAddress: "201 Bondi Rd, Bondi NSW 2026",
    location: { lat: -33.8915, lng: 151.2647 },
    phone: "+61 2 9387 8800",
    rating: 4.6,
    userRatingCount: 211,
    openNow: false,
    weekdayDescriptions: [
      "Monday: 9:00 AM – 5:00 PM",
      "Tuesday: 9:00 AM – 5:00 PM",
      "Wednesday: 9:00 AM – 5:00 PM",
      "Thursday: 9:00 AM – 7:00 PM",
      "Friday: 9:00 AM – 5:00 PM",
      "Saturday: 9:00 AM – 12:00 PM",
      "Sunday: Closed",
    ],
    distanceMeters: 8900,
    googleMapsUri: "https://www.google.com/maps/place/?q=place_id:ChIJ_mock_05",
  },
];
```

## Component shape

Produce these files (named exports only — no default exports):

- `src/pages/ClinicsPage.tsx` — top-level shell.
- `src/components/clinics/ClinicSearchBar.tsx`
- `src/components/clinics/ClinicList.tsx`
- `src/components/clinics/ClinicCard.tsx` (handles its own collapsed/expanded state via props from parent)
- `src/components/clinics/ClinicMap.tsx` (the placeholder)
- `src/components/clinics/ClinicEmptyState.tsx`
- `src/components/clinics/ClinicErrorState.tsx`
- `src/components/clinics/ClinicLoadingSkeleton.tsx`
- `src/types/clinic.ts` — the `ClinicResult` TypeScript type matching the mock data shape above.

State lives in `ClinicsPage.tsx` (no global store): `keyword`, `location`, `results`, `status: "idle" | "loading" | "ok" | "empty" | "error"`, `selectedPlaceId: string | null`. The parent passes `isExpanded` and `onToggle(placeId)` to each `ClinicCard`.

## Accessibility

- Card expand button: `aria-expanded={isExpanded}` on the card-level element; the chevron is `aria-hidden`.
- All icon-only buttons have `aria-label`.
- Focus rings: 2px `rgba(59,130,246,0.5)` outline, 2px offset.
- Search inputs labelled (visually hidden labels are fine if you want a clean look).

## What NOT to do (reminders)

- No real Google Maps / Mapbox / Leaflet — placeholder only.
- No `bg-white`, no `font-bold`, no Google Fonts.
- No saturated colours. No emoji. No animations longer than 200ms.
- No login / signup / navigation chrome — this page slots into a wider app shell that already exists.
- No "Save / favourite" feature — out of scope for v1.
```

---

## Prompt 2 — Geolocation permission UX (follow-up)

After Prompt 1's output is satisfactory, paste this as a follow-up message in the same Lovable session.

```
Refine the "Use my location" button in the search bar to handle four states explicitly. Update `ClinicSearchBar.tsx` only.

State machine: `"idle" | "requesting" | "granted" | "denied" | "unavailable"`.

- **idle** (default on load when `navigator.geolocation` is available): button shows pin icon + label `"Use my location"`. Ghost style.
- **unavailable** (`!navigator.geolocation`): button is hidden entirely.
- **requesting** (after click, awaiting browser permission prompt): button disabled, label `"Locating…"`, replace pin icon with a small spinner.
- **granted**: button shows a small check icon + label `"Using your location"`. Ghost style with a subtle muted-green tint to the icon. Clicking again re-requests (returns to `requesting`).
- **denied**: button stays in idle visual style (pin icon + `"Use my location"`). Below the search bar, render a small inline message in muted brown-red: `"Location permission was denied. You can still search by city or postcode above, or update your browser permissions and try again."` The message disappears once the user types in the location input.

Wire the click handler to call `navigator.geolocation.getCurrentPosition(success, error)`. On success: set state to `granted`, fill the location input with `"<lat>,<lng>"` formatted to 4 decimal places, and trigger a search. On error with `error.code === 1` (PERMISSION_DENIED): set state to `denied`. Other error codes: set state back to `idle` and show a small toast `"Couldn't get your location — please try again."` (use shadcn `useToast`).

Do not change anything else about the page.
```

---

## Porting checklist (for EPIC5-04)

Steps to move Lovable's output into this repo. Estimate: ~3 hours.

1. **Pull the Lovable repo** locally (or download the zip). Identify the files listed under "Component shape" above.
2. **Copy files into our repo**:
   - `src/pages/ClinicsPage.tsx` → `app/(app)/clinics/page.tsx`
   - `src/components/clinics/*` → `components/clinics/*`
   - `src/types/clinic.ts` → already covered by EPIC5-02; reconcile any field differences (EPIC5-02 is the source of truth).
3. **Add `'use client'`** as the very first line of every file that uses `useState`, `useEffect`, event handlers, or `navigator`.
4. **Strip the Vite shell**: do NOT copy `main.tsx`, `App.tsx`, `vite.config.ts`, `index.html`, `react-router-dom` imports, or any `BrowserRouter`/`Route` JSX.
5. **Rewrite imports**:
   - `@/components/ui/<x>` → keep as-is (shadcn paths align between Lovable and this repo).
   - Any `react-router-dom` imports → remove. The page is single-route.
   - Lucide icons: `lucide-react` already in our `package.json`; verify version compatibility with `pnpm ls lucide-react`.
6. **Convert default exports to named exports** if Lovable emitted defaults.
7. **Audit Tailwind classes** — grep the ported files for:
   - `bg-white` → replace with `bg-[#f7f4ed]`
   - `text-white` (except inside dark-button context) → `text-[#1c1c1c]`
   - `font-bold`, `font-extrabold`, `font-black` → `font-semibold` (max 600)
   - Any `bg-gray-*` or `text-gray-*` Tailwind palette → replace with the cream/charcoal tokens from `docs/design-tokens.md`
   - Any hex colours that aren't in `docs/design-tokens.md`
8. **Verify mock data shape** matches `types/clinic.ts` from EPIC5-02 exactly (rename fields if Lovable emitted snake_case).
9. **Run** `pnpm biome check --write .` to fix formatting.
10. **Run** `pnpm dev` and visit `/clinics`. Confirm cards expand, mock map placeholder renders, three breakpoints look correct.
11. **Run** `pnpm exec vitest run` to ensure no regressions.

Once the port is green, EPIC5-05 wires the real API.
