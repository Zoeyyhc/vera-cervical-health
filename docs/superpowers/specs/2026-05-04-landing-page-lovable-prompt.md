# Landing Page — Lovable Prompt

**Date:** 2026-05-04
**Deliverable:** A single hand-off prompt for Lovable that produces a landing page consistent with the Cervix design system. No code is written in this repo.

---

## Design Decisions (Locked)

| Decision | Choice | Rationale |
|---|---|---|
| Audience | Women 25–70, with extra warmth for 18–35 anxious cohort | Confirmed by user (A + B) |
| Primary CTA | "Start with the basics" → `/learn` (content-first) | Confirmed by user (D); authority before conversion |
| Secondary CTA | "Ask a question" → `/chat` (no-signup try) | Lets curious visitors sample the assistant |
| Visual richness | Hybrid (D): type-led structure + signature soft botanical illustration + watercolor wash | Editorial spine of existing system, softened for sensitive topic |
| Illustration motif | Abstract botanical line drawings (eucalyptus / ginkgo / willow) — NOT flowers, NOT anatomy, NOT pink ribbons | Calm, universal, non-clichéd |
| Soft accent palette | Dusty rose `#e9d5ce` · sage `#cdd6c1` · terracotta `#d8b4a0` — all <30% opacity | Whisper of warmth without competing with type |
| Sign-up placement | Section 9 (near footer) | Authority-first per Q2 |
| Source treatment | Text only, no logos | Avoids false-endorsement risk |
| i18n | EN/中文 toggle in footer (placeholder only) | i18n implementation belongs to Epic 8 |
| AI assistant on landing | Static mockup, no live call | Lovable scope is presentational only |

---

## Page Structure (10 sections)

1. **Sticky top nav** — Wordmark · Learn · Find a clinic · Sign in · primary "Try the assistant"
2. **Hero** — Watercolor wash + botanical line drawing · headline + subhead + dual CTAs
3. **Start here** — 3 entry cards: Understanding HPV / What is screening / After an abnormal result
4. **How it works** — 3 steps: Read · Ask · Find
5. **Trust strip** — Source attribution (Cancer Council Australia · WHO · HealthDirect) + non-diagnosis disclaimer
6. **Featured topics** — 6-card grid pulling from Learn hub
7. **Ask anything** — AI assistant preview (static mockup) with privacy + non-diagnosis assurance
8. **Find a clinic** — Compact utility row with input + abstract map illustration
9. **Sign-up CTA band** — "Save what you read, in one place"
10. **Footer** — Multi-column links · medical disclaimer · EN/中文 toggle

---

## The Lovable Prompt

Hand the block below verbatim to Lovable.

````markdown
# Build a landing page for Cervix — a cervical health education platform

## Context
Cervix is a cervical health education platform for women aged 25–70 (with extra
care for the 18–35 cohort who may be anxious about HPV, screening, or recent
results). The product offers: an AI assistant grounded in cited medical sources,
a Learn hub with explainer articles, and a clinic finder. The landing page must
build trust and warmth before asking for any commitment. The primary action is
to send visitors into the Learn hub, NOT to sign up.

Audience tone: warm, demystifying, second-person ("you"), short sentences, no
medical jargon without immediate explanation, never alarmist, never
clinical-cold.

## Visual System (strict — do not deviate)

### Color
- Page background: cream `#f7f4ed` — NEVER pure white (`#ffffff`)
- Primary text / dark surfaces: charcoal `#1c1c1c` (not pure black)
- Button text on dark: off-white `#fcfbf8`
- Body / secondary text: muted gray `#5f5f5d`
- Borders (passive): `#eceae4`
- Borders (interactive): `rgba(28,28,28,0.4)`
- All grays must be derived from `#1c1c1c` at varying opacities (3%, 4%, 40%,
  82%, 83%) — do NOT introduce arbitrary gray hex values.

### Soft accent palette (for the watercolor wash and illustration ink only)
- Dusty rose: `#e9d5ce`
- Sage: `#cdd6c1`
- Terracotta: `#d8b4a0`
- Use ALL accents at <30% opacity. They must feel like a whisper behind cream,
  never compete with type.

### Typography
- Font: `Camera Plain Variable`, with fallback `ui-sans-serif, system-ui`
- Use ONLY weights 400 (body, UI, links, buttons) and 600 (headings). NEVER 700.
- Letter-spacing: -1.5px at 60px, -1.2px at 48px, -0.9px at 36px, normal at
  <=20px.
- Display hero: 60px / weight 600 / line-height 1.1 / letter-spacing -1.5px
- Section headings: 48px / weight 600 / line-height 1.0 / letter-spacing -1.2px
- Sub-headings: 36px / weight 600 / line-height 1.1 / letter-spacing -0.9px
- Body large (intros): 18px / weight 400 / line-height 1.38
- Body: 16px / weight 400 / line-height 1.5
- Captions: 14px / weight 400

### Buttons
- Primary dark: bg `#1c1c1c`, text `#fcfbf8`, padding 8px 16px, radius 6px,
  inset shadow:
  `rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset,
   rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset,
   rgba(0,0,0,0.05) 0px 1px 2px 0px`.
  Active state: opacity 0.8.
- Ghost / secondary: transparent bg, text `#1c1c1c`, padding 8px 16px,
  radius 6px, border `1px solid rgba(28,28,28,0.4)`. Active: opacity 0.8.
- Focus state on any button: shadow `rgba(0,0,0,0.1) 0px 4px 12px`.

### Cards
- Background `#f7f4ed` (same as page — seamless), border `1px solid #eceae4`,
  radius 12px, no box-shadow. Borders define containment, never shadows.

### Inputs
- Background `#f7f4ed`, border `1px solid #eceae4`, radius 6px,
  placeholder color `#5f5f5d`, focus ring `rgba(59,130,246,0.5)` 2px.

### Spacing
- 8px base unit. Section vertical padding: 96px desktop, 64px mobile.
- Max content width: 1200px, centered.

### Illustration direction (custom — not stock)
- Hero backdrop: a soft watercolor wash (dusty rose → sage → cream gradient at
  <30% opacity), placed behind hero content, edges feathered, shaped organically
  (NOT a rectangle with a hard edge).
- Hero focal illustration: ONE abstract botanical line drawing — eucalyptus
  sprig, ginkgo leaf, or simple branch. Single-stroke charcoal `#1c1c1c` line,
  ~1.5px weight, NO color fill, placed to the right of the headline at large
  sizes, hidden or moved below copy on mobile.
- Section header accents: tiny ~24px botanical motifs (a single leaf, a small
  sprig, three dots) to the left of section headings. Same line treatment.
- NO photography. NO clinical imagery. NO pink ribbons. NO uteruses or
  anatomical diagrams. NO emoji. NO florals that look feminine-decorative —
  choose botanicals that read calm and universal (eucalyptus, ginkgo, willow,
  fern).

## Page Structure

### 1. Sticky Top Nav
- Cream background, no border at top, subtle `1px solid #eceae4` bottom border
  on scroll.
- Left: wordmark "Cervix" in Camera Plain 18px weight 600.
- Center / right: text links — "Learn", "Find a clinic", "Sign in" — Camera
  Plain 16px weight 400, charcoal, underline on hover only.
- Far right: primary dark button "Try the assistant".
- Mobile: hamburger menu, 6px radius button.

### 2. Hero (centered, single column, 96px+ vertical padding)
- Soft watercolor wash backdrop (see illustration direction).
- Eyebrow tag above headline: "Cervical health education" in 14px weight 400,
  muted gray, centered.
- Headline (centered, max-width ~880px):
  **"Cervical health, in language you can hold onto."**
- Subhead (centered, max-width ~640px, body large 18px, muted gray):
  "A quiet place to learn what screening is, what HPV means, and what your
  results actually say — grounded in trusted sources, never a diagnosis."
- Two CTAs side-by-side, centered, 16px gap:
  - Primary dark: "Start with the basics"
  - Ghost: "Ask a question →"
- Botanical line drawing positioned right of headline at desktop sizes,
  decorative-only.

### 3. Start here — Three entry cards (3-column grid → stacked on mobile)
- Section heading (left-aligned, 36px weight 600, with tiny leaf accent to its
  left): "Start here."
- Three cards, each 12px radius, `1px solid #eceae4` border, 32px internal
  padding:
  - "Understanding HPV" — short blurb (2 lines, muted gray) + arrow link "Read →"
  - "What is cervical screening?" — same pattern
  - "After an abnormal result" — same pattern
- All link to `/learn/<slug>`.

### 4. How it works — Three steps (horizontal row → stacked mobile)
- Section heading: "How Cervix works."
- Three columns, each with a small charcoal line icon (a book, a chat bubble,
  a pin), step number ("01", "02", "03") in 14px weight 400 muted gray, then a
  short title in 20px weight 400, then one sentence of body in 16px muted gray:
  - 01 · Read — "Browse plain-language explainers, written from trusted sources."
  - 02 · Ask — "Talk to an AI assistant grounded in citations, not guesses."
  - 03 · Find — "Locate a screening clinic near you, when you're ready."

### 5. Trust strip
- Cream surface, `1px solid #eceae4` top and bottom border, 64px vertical
  padding.
- Centered eyebrow: "Grounded in" in 14px muted gray.
- Three source names in 20px weight 400 charcoal, separated by 48px gap:
  "Cancer Council Australia" · "World Health Organization" · "HealthDirect"
- Below, a single line in 16px muted gray, centered, max-width 640px:
  "Every answer the assistant gives is traceable to a cited source.
  Cervix is not a diagnostic tool — always consult a healthcare professional."

### 6. Featured topics — 6-card grid (3 columns desktop → 2 tablet → 1 mobile)
- Section heading: "Read at your own pace."
- 6 article cards from the Learn hub. Each card:
  - 12px radius, `1px solid #eceae4` border, 24px padding
  - Optional small botanical motif top-left (~24px)
  - Category label in 14px muted gray ("Screening", "HPV", "Results",
    "Vaccines", "Anatomy basics", "Talking to your doctor")
  - Card title in 20px weight 400 charcoal (1–2 lines)
  - 2-line excerpt in 14px muted gray
  - "Read →" link in 14px charcoal, underlined
- Below grid, centered ghost button: "See all topics".

### 7. Ask anything — AI assistant preview
- Two-column layout (text left, mockup right) → stacked mobile.
- Left text:
  - Sub-heading 36px weight 600: "Ask anything you'd ask a doctor — without
    booking the appointment."
  - Body 18px muted gray: "The Cervix assistant answers in plain language,
    cites its sources, and never replaces a clinician. Your conversations
    stay private."
  - Bullet list (3 items, small leaf accent each):
    - "Cited from medical sources you can verify"
    - "Powered by Claude, with safety guardrails"
    - "Will always recommend a professional when it matters"
- Right mockup:
  - A faux assistant input card, cream bg, `1px solid #eceae4`, 16px radius,
    24px padding.
  - Show a sample question typed in: "What does a HPV-positive result actually
    mean?"
  - Show a 3-line preview answer with a cited source link below in muted gray:
    "Source: Cancer Council Australia"
  - Below the card, a tiny pill button "Try it →" linking to /chat.

### 8. Find a clinic (compact utility row)
- Section heading 36px weight 600: "Find a screening clinic near you."
- One sentence in 16px muted gray: "Powered by Google Maps. Search by suburb
  or postcode."
- Single input field (cream bg, `1px solid #eceae4`, 6px radius, full-width on
  mobile, 480px desktop), placeholder "e.g. Carlton or 3053", with a primary
  dark button "Find clinics" attached to the right.
- Below the input, a small map illustration (botanical-style line drawing of
  an abstract map with a single pin) — purely decorative, not interactive.

### 9. Sign-up CTA band (LAST — only after value has been shown)
- Cream surface, no border, 96px vertical padding, centered.
- Optional botanical line drawing centered above headline.
- Sub-heading 36px weight 600: "Save what you read, in one place."
- Body 18px muted gray, max-width 560px: "Create a free account to bookmark
  articles, keep your conversation history, and pick up where you left off."
- Primary dark CTA: "Create your account"
- Below CTA, 14px muted gray link: "or continue without an account →"

### 10. Footer
- Cream surface, `1px solid #eceae4` top border, 16px radius on the container.
- Multi-column on desktop, stacked on mobile:
  - Column 1: Cervix wordmark + one-line description "Cervical health
    education, grounded in trusted sources."
  - Column 2: Product — Learn, Assistant, Find a clinic
  - Column 3: About — Our sources, How we built this, Contact
  - Column 4: Legal — Privacy, Terms, Medical disclaimer
- Bottom strip: "© 2026 Cervix · EN | 中文 (language toggle, EN active)"
- Final line in 14px muted gray, centered:
  "Cervix is an educational tool. It is not a substitute for medical advice,
  diagnosis, or treatment."

## Responsive Rules
- Hero headline scales: 60px → 48px → 36px (with proportional letter-spacing).
- Section vertical padding: 96px desktop → 64px mobile.
- Multi-column grids collapse: 3 → 2 → 1.
- Botanical hero illustration moves below headline or is hidden on <768px.
- Watercolor wash softens / simplifies on mobile to avoid mud.

## Hard constraints (do NOT violate)
- Never use pure white `#ffffff` as a background.
- Never use font weight 700 — 600 is the maximum.
- Never use heavy box-shadows on cards — borders are the containment mechanism.
- Never introduce saturated brand colors — palette stays warm-neutral.
- Never use stock photography or pink-ribbon visual clichés.
- Never imply diagnosis, treatment, or medical certainty in any copy.
- Always include the "not a diagnostic tool" disclaimer in hero subhead, trust
  strip, AI preview section, and footer.
- All third-party logos / source names appear as TEXT only (no real logos), to
  avoid any false-endorsement implication.

## Deliverable
A single responsive landing page as the home route ("/"). Use Tailwind CSS
with the exact tokens above defined as theme extensions. Built with semantic
HTML, accessible focus states, and the soft warm focus shadow
`rgba(0,0,0,0.1) 0px 4px 12px` on all interactive elements.
````

---

## Notes on use

- This prompt is self-contained — Lovable does not need access to the rest of the codebase.
- The `Camera Plain Variable` font is custom and won't be available in Lovable's environment. Lovable will fall back to `ui-sans-serif, system-ui`. Re-apply Camera Plain when porting the output back to this repo.
- The output is presentational only. Wiring the CTAs to real routes (`/learn`, `/chat`, etc.) happens after porting.
- If Lovable substitutes any color, font weight, or removes the inset-shadow detail, push back — the design system explicitly forbids those drifts.
