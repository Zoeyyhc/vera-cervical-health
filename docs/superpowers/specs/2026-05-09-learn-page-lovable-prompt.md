# /learn Page  -  Lovable Prompt

**Date:** 2026-05-09
**Deliverable:** A single hand-off prompt for Lovable that produces the `/learn` hub and `/learn/[slug]` article detail pages, consistent with the Cervix design system established in the landing page prompt (`2026-05-04-landing-page-lovable-prompt.md`). No code is written in this repo.

---

## Design Decisions (Locked)

| Decision | Choice | Rationale |
|---|---|---|
| Routes covered | `/learn` (hub) + `/learn/[slug]` (article detail) in one prompt | Both share the design system; one prompt avoids drift |
| Interaction model | **B + D + E** : exploratory hub + one scrollytelling article (#04) + chat/clinic CTAs at every endpoint | Confirmed by user; richest signal-to-effort ratio |
| Article layout variants | **3 variants** : Standard (5 articles), Scrollytelling (#04), Card Grid (#07) | One template per editorial intent; selectable via frontmatter `layout` field |
| Categories | HPV Basics  ·  Screening  ·  HPV Vaccine  ·  Myths and Facts | Matches the four `theme` values in `docs/learn-content/v1/*.md` frontmatter |
| Visual richness | Inherits landing page system (cream + charcoal + botanical line illustration + soft accent wash) | Continuity, no token redesign |
| Internal review state | NOT shown in product UI. Drafting status stays in source markdown frontmatter only. | Visible review markers degrade trust on a health platform |
| Inline source quotes | Italic body with thin sage left border + small caption attribution below | Distinguishes quoted source material from authored prose |
| AI assistant on detail pages | Right-rail "Ask the AI about this" pill (desktop) + bottom band (mobile) | Keeps E-style CTA always one click away |
| Search on hub | Placeholder input only (no live search) | Per Epic 6 MoSCoW, search is C priority - wire later |
| i18n | EN only at this stage | Per Epic 8, ZH translations come later |

---

## Page Structure

### `/learn` hub  -  9 sections

1. **Sticky top nav**  -  wordmark  ·  Learn (active)  ·  Find a clinic  ·  Sign in  ·  primary "Try the assistant"
2. **Hero**  -  "Learn at your own pace." headline + subhead + soft watercolor wash + botanical illustration + placeholder search input
3. **Start here**  -  3 persona entry cards: "I'm new to all this" links to #01  ·  "I just got my results" links to #05  ·  "I'm thinking about the vaccine" links to #06
4. **Featured deep dive**  -  #04 "What to expect at your screening appointment" with prominent "Step-by-step walkthrough" badge, larger card treatment
5. **All topics**  -  remaining article cards organised by category (HPV Basics  ·  Screening  ·  HPV Vaccine  ·  Myths and Facts)
6. **Myths spotlight**  -  #07 preview: 3 of 7 myth cards visible + "See all 7 myths" link
7. **Ask the AI band**  -  E-style CTA, sample question + chat link
8. **Find a clinic band**  -  E-style CTA, postcode input + clinic finder link
9. **Footer**  -  same as landing

### `/learn/[slug]` article detail  -  3 variants

**Standard** (used by #01, #02, #03, #05, #06):
1. Top nav
2. Article header  -  category eyebrow, title, target reader, last updated, ~N min read
3. Sticky table of contents (left rail desktop, accordion top mobile)
4. Article body  -  typography-led, soft accent for callouts and inline quotes
5. Right rail (desktop)  -  "Ask the AI about this" pill + "Find a clinic" pill
6. Related articles row (3 cards)
7. Attribution section
8. Footer

**Scrollytelling** (used by #04 only):
1. Top nav
2. Article header
3. Intro paragraph (standard layout)
4. **Sticky left rail with stepper** (01/06 to 06/06) + **right column scroll-triggered illustrations**
5. Outro section (standard layout)
6. Right rail / bottom band CTAs (chat / clinics)
7. Attribution section
8. Footer

**Card grid** (used by #07 only):
1. Top nav
2. Article header
3. Intro paragraph
4. **Numbered card grid** (01-07), 1 column mobile / 2 columns desktop, fade-up on scroll
5. CTAs
6. Attribution section
7. Footer

---

## The Lovable Prompt

Hand the block below verbatim to Lovable.

````markdown
# Build the Learn hub and article detail pages for Cervix

## Context
Cervix is a cervical health education platform. You have already built the landing
page (`/`) for this product, using a cream-and-charcoal warm-neutral design system,
Camera Plain Variable typography (with system-ui fallback), and abstract botanical
line illustrations. This task extends the same product to two new routes:

- `/learn`  -  the article hub (browse all topics)
- `/learn/[slug]`  -  the individual article detail page, with three layout variants

ALL design tokens, colors, typography, button styles, and illustration direction
from the landing page apply here unchanged. Re-state them below for completeness;
do not deviate from them.

Audience tone: warm, demystifying, second-person ("you"), short sentences, no
medical jargon without immediate explanation, never alarmist, never clinical-cold.
The product is an educational resource. Never imply diagnosis, treatment, or
medical certainty.

## Visual System (strict  -  do not deviate)

### Color
- Page background: cream `#f7f4ed`. NEVER pure white (`#ffffff`).
- Primary text / dark surfaces: charcoal `#1c1c1c` (not pure black).
- Button text on dark: off-white `#fcfbf8`.
- Body / secondary text: muted gray `#5f5f5d`.
- Borders (passive): `#eceae4`.
- Borders (interactive): `rgba(28,28,28,0.4)`.
- Subtle hover bg: `rgba(28,28,28,0.04)`.
- All grays must be derived from `#1c1c1c` at varying opacities. Do NOT introduce
  arbitrary gray hex values.

### Soft accent palette (for illustration ink, callout borders, and washes only)
- Dusty rose: `#e9d5ce`
- Sage: `#cdd6c1`
- Terracotta: `#d8b4a0`
- Use ALL accents at less than 30% opacity. They must feel like a whisper behind
  cream, never compete with type.

### Typography
- Font: `Camera Plain Variable`, fallback `ui-sans-serif, system-ui`.
- Use ONLY weights 400 (body, UI, links, buttons) and 600 (headings). NEVER 700.
- Letter-spacing: -1.5px at 60px, -1.2px at 48px, -0.9px at 36px, normal at <=20px.
- Display hero: 60px / weight 600 / line-height 1.1 / letter-spacing -1.5px.
- Section headings: 48px / weight 600 / line-height 1.0 / letter-spacing -1.2px.
- Sub-headings: 36px / weight 600 / line-height 1.1 / letter-spacing -0.9px.
- Article H2: 28px / weight 600 / line-height 1.15 / letter-spacing -0.5px.
- Article H3: 22px / weight 600 / line-height 1.2 / letter-spacing -0.3px.
- Body large (intros): 18px / weight 400 / line-height 1.55.
- Body: 16px / weight 400 / line-height 1.65 (longer than landing because of
  long-form reading).
- Captions / source attribution: 14px / weight 400 / muted gray.

### Buttons
- Primary dark: bg `#1c1c1c`, text `#fcfbf8`, padding 8px 16px, radius 6px,
  inset shadow:
  `rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset,
   rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset,
   rgba(0,0,0,0.05) 0px 1px 2px 0px`.
  Active state: opacity 0.8.
- Ghost / secondary: transparent bg, text `#1c1c1c`, padding 8px 16px,
  radius 6px, border `1px solid rgba(28,28,28,0.4)`. Active: opacity 0.8.
- Pill (used for right-rail CTAs and small action buttons): bg `#f7f4ed`, text
  `#1c1c1c`, radius 9999px, padding 8px 16px, same inset shadow as Primary Dark.
  Default opacity 0.5, active 0.8.
- Focus state on any button: shadow `rgba(0,0,0,0.1) 0px 4px 12px`.

### Cards
- Background `#f7f4ed` (same as page, seamless), border `1px solid #eceae4`,
  radius 12px, no box-shadow. Borders define containment, never shadows.

### Inputs
- Background `#f7f4ed`, border `1px solid #eceae4`, radius 6px,
  placeholder color `#5f5f5d`, focus ring `rgba(59,130,246,0.5)` 2px outline.

### Spacing
- 8px base unit. Section vertical padding: 96px desktop, 64px mobile.
- Article max-width: 720px (reading column), centered.
- Hub max content width: 1200px, centered.

### Illustration direction (custom, same as landing page)
- Abstract botanical line drawings only: eucalyptus sprig, ginkgo leaf, simple
  branch, fern frond. Single-stroke charcoal `#1c1c1c` line, ~1.5px weight, NO
  color fill.
- Section header accents: tiny ~24px botanical motifs to the left of section
  headings.
- Soft watercolor washes (dusty rose / sage / terracotta gradients at less than
  30% opacity) with feathered edges, NEVER hard rectangles.
- NO photography. NO clinical imagery. NO pink ribbons. NO uteruses or
  anatomical diagrams. NO emoji. NO florals that look feminine-decorative.

---

## Route 1: `/learn` - the hub

### Section 1. Sticky Top Nav
- Same as landing. "Learn" link in nav is active state (charcoal underline 1.5px,
  offset 4px below text).

### Section 2. Hero (centered, single column, 96px+ vertical padding)
- Eyebrow tag: "The Learn hub" in 14px weight 400 muted gray, centered.
- Headline (centered, max-width ~720px):
  **"Learn at your own pace."**
- Subhead (centered, max-width ~640px, body large 18px, muted gray):
  "Plain-language explainers about HPV, cervical screening, the vaccine, and
  what your results mean. Grounded in cited sources, never a diagnosis."
- Below subhead, a single placeholder search input (36px tall, full-width on
  mobile, 480px desktop, centered): placeholder "Search topics  -  coming soon".
  This input is non-functional in this build.
- A small botanical line drawing (a fern frond) sits to the right of the
  headline at desktop sizes, hidden below 768px.

### Section 3. Start here  -  Three persona entry cards
- Section heading (left-aligned, 36px weight 600, with tiny leaf accent to its
  left): "Start here."
- Sub-heading line in 16px muted gray: "Pick the door that fits where you are."
- Three cards in a 3-column grid (stacked on mobile), each 12px radius,
  `1px solid #eceae4` border, 32px internal padding:
  - Card 1: eyebrow "New to all this", title "Start with what HPV actually is",
    body 14px muted gray (1 line) "A 4-minute read covering the basics."
    Link "Read" (with small chevron arrow ASCII `>`) routes to
    `/learn/what-is-hpv`.
  - Card 2: eyebrow "Just got your results", title "Understanding your screening
    results", body "What each result category really means.",
    link "Read >" routes to `/learn/understanding-results`.
  - Card 3: eyebrow "Thinking about the vaccine", title "The HPV vaccine: who,
    when, why", body "Australia's program, eligibility, and the adult catch-up
    question.", link "Read >" routes to `/learn/hpv-vaccine`.

### Section 4. Featured deep dive (one large card)
- Section heading: "Step inside the appointment."
- A single full-width card, 12px radius, `1px solid #eceae4` border, 48px padding.
- Inside the card, two-column layout (text left, illustration placeholder right;
  stacked on mobile):
  - Left:
    - Small badge in dusty rose at less than 20% opacity: "Step-by-step walkthrough"
    - Title 28px weight 600: "What to expect at your screening appointment"
    - Body 16px muted gray, max-width 480px: "Six short steps, with the
      cervix-shaped clinic chair finally explained. For first-time screeners
      and anyone who's been putting it off."
    - Primary dark CTA: "Walk through it >" routing to
      `/learn/screening-appointment`.
  - Right: a calm botanical line illustration (e.g. a willow branch) inside a
    soft watercolor wash bubble. Decorative only.

### Section 5. All topics  -  Category-organised grid
- Section heading: "All topics."
- Below the heading, four category sections stacked vertically. Each category
  has its own sub-heading (24px weight 600, charcoal) followed by article cards
  in a 3-column grid (2 columns tablet, 1 column mobile).

  **HPV Basics**
  - Card: "What is HPV?". Category eyebrow "HPV Basics" 14px muted gray;
    title 20px weight 400; 2-line excerpt 14px muted gray; "Read >" 14px link.
    Routes to `/learn/what-is-hpv`.
  - Card: "HPV vs Cervical Cancer: How are they connected?". Same pattern,
    routes to `/learn/hpv-vs-cervical-cancer`.

  **Screening**
  - Card: "Cervical Screening Test: what it is and why it matters" routes to
    `/learn/screening-test-overview`.
  - Card: "What to expect at your screening appointment" routes to
    `/learn/screening-appointment`. (This article also features in section 4.
    Showing it again here is intentional, the hub is a browse surface.)
  - Card: "Understanding your screening results" routes to
    `/learn/understanding-results`.

  **HPV Vaccine**
  - Card: "The HPV vaccine: who, when, why" routes to `/learn/hpv-vaccine`.

  **Myths and Facts**
  - Card: "7 myths about cervical health, debunked" routes to
    `/learn/myths-debunked`. Add a small dusty-rose pill badge "Card series"
    to indicate the unique layout.

- All cards: cream bg, `1px solid #eceae4`, 12px radius, 24px padding. Optional
  small botanical motif top-left (~20px). On hover: subtle bg shift to
  `rgba(28,28,28,0.04)`.

### Section 6. Myths spotlight
- Section heading: "Common myths, plainly answered."
- Show a horizontal preview of THREE myth cards (1 row desktop, horizontal
  scroll on mobile). Each preview card:
  - Small charcoal numeral "01", "02", "03" top-left, 24px weight 600.
  - Strikethrough muted gray "Myth: ..." (truncated to one line).
  - Bold charcoal "Reality: ..." (one line).
  - Cream bg, `1px solid #eceae4`, 12px radius, 24px padding, ~280px wide.
- The three preview myths to show:
  - 01  ·  Myth: "If I have HPV, I'm going to get cancer."  ·  Reality: 9 in 10
    HPV infections clear on their own within 2 years.
  - 02  ·  Myth: "The test is painful, I keep avoiding it."  ·  Reality: It is
    uncomfortable for most, painful for few. Self-collection is now an option.
  - 03  ·  Myth: "Once you're through menopause, you can stop being screened."
    Reality: In Australia, eligibility runs to age 74.
- Below the row, centered: ghost button "See all 7 myths >" routing to
  `/learn/myths-debunked`.

### Section 7. Ask the AI band
- Cream surface, `1px solid #eceae4` top and bottom border, 64px vertical padding.
- Two-column layout (text left, sample question card right; stacked mobile).
- Left:
  - Sub-heading 28px weight 600: "Have a question we haven't answered?"
  - Body 16px muted gray: "Ask the Cervix assistant. Every answer cites its
    sources, and it will always recommend a clinician when the question needs
    one."
  - Primary dark CTA: "Open the assistant >" routes to `/chat`.
- Right: a faux assistant card showing one sample question typed in:
  "What does a HPV-positive result actually mean?" and a 3-line preview
  reply with a "Source: Cancer Council Australia" caption below in 14px muted
  gray. Cream bg, `1px solid #eceae4`, 16px radius, 24px padding.

### Section 8. Find a clinic band
- Section heading 28px weight 600: "Ready to book?"
- One-line body 16px muted gray: "Find a screening clinic near you."
- Single input (cream bg, `1px solid #eceae4`, 6px radius, 480px on desktop,
  full width on mobile), placeholder "e.g. Carlton or 3053", with a primary
  dark button "Find clinics" attached to the right.
- Routes to `/clinics` on submit (input non-functional in this build, button
  routes plain).

### Section 9. Footer
- Same as landing page footer.

---

## Route 2: `/learn/[slug]` - Article detail (3 variants)

The article page selects a layout based on the article's frontmatter `layout`
field: `standard`, `scrollytelling`, or `card-grid`.

### Common across all variants

#### Sticky top nav
Same as hub. "Learn" still active.

#### Article header (used by all 3 variants)
- 64px top padding above content area.
- Eyebrow row: small leaf accent + category name in 14px weight 400 muted gray
  (e.g. "Screening"). Linked back to the relevant category section in the hub.
- Title in 48px weight 600 charcoal, max-width 720px, line-height 1.0,
  letter-spacing -1.2px.
- Below the title, a meta row in 14px muted gray: "For: First-time screeners
  and anyone anxious about the procedure  ·  ~5 min read  ·  Last updated
  9 May 2026". Each item separated by ` · `.
- Below the meta row, a thin `#eceae4` divider, full content width.
- Do NOT show any "draft", "review", or status badge in the product UI.

#### Inline source quote styling (used in article body)
- Italic body text, 16px weight 400.
- Left border: 2px solid sage `#cdd6c1` at 60% opacity.
- Padding: 8px 0 8px 16px.
- Followed by an attribution line in 14px muted gray, no italic, e.g.
  "Source: Cancer Council Australia". Indented to match the quote left padding.

#### Right rail CTAs (desktop only, hidden below 1024px)
- Sticks to the right of the reading column at top: 16px gap from column.
- Two pill buttons stacked vertically with 12px gap between:
  - Pill: "Ask the AI about this >" routes to `/chat?q=<article-title>`
    (use placeholder query string).
  - Pill: "Find a clinic >" routes to `/clinics`.
- Below 1024px, replace right rail with a sticky bottom band (cream bg,
  `1px solid #eceae4` top border, 16px padding) with the same two pills
  side-by-side, centered.

#### Related articles row (used by all 3 variants, before attribution)
- Section heading 22px weight 600: "Keep reading."
- Three cards in a 3-column grid (stacked mobile). Each card same style as
  hub topic card. Pick three articles different from the current one.

#### Attribution section
- Charcoal heading 22px weight 600: "Sources."
- Bullet list of source attributions in 14px muted gray:
  - One bullet per source, with: title (italic), license note, full URL on a
    second line (truncate visually with ellipsis at 60ch on mobile, hover
    reveals full).
- Final paragraph in 14px muted gray, centered: "This article is general
  education, not medical advice. Please speak with your GP about any personal
  concerns."

#### Footer
Same as landing.

---

### Variant A: Standard (used by 5 of 7 articles)

Used when frontmatter `layout: standard`.

Apply this to: `what-is-hpv`, `hpv-vs-cervical-cancer`, `screening-test-overview`,
`understanding-results`, `hpv-vaccine`.

**Layout (desktop, 1024px and up):**
- 3-column grid: left rail (TOC, ~200px), center reading column (720px), right
  rail (CTAs, ~200px). 32px gutters.
- Below 1024px: TOC collapses to a top accordion above the article body, right
  rail collapses to sticky bottom band.

**Sticky table of contents (left rail desktop):**
- Heading 14px weight 600 muted gray: "On this page".
- Auto-generated list of H2 headings within the article body. Each item 14px
  weight 400, 8px vertical padding, charcoal at full color, muted gray for
  inactive items. Active item (currently in viewport) gets a 2px sage left
  border.
- TOC sticks at 96px from top of viewport.

**Article body (center column):**
- All H2 headings get a tiny botanical accent (~16px sprig) to the left.
- 32px vertical spacing between H2 sections.
- Body text 16px line-height 1.65, generous spacing. This is long-form reading.
- Lists: 16px body, 8px between items, charcoal bullet.
- Tables: full width of reading column, `1px solid #eceae4` border, header row
  cream bg with charcoal text 14px weight 600, body row 14px weight 400, cell
  padding 12px.
- Internal links to other `/learn/...` slugs: rendered with a small leaf icon
  prefix and underline.
- Final CTA inside body (e.g. "Have a personal question? Ask the AI") rendered
  as a primary dark button on its own line, centered.

**Sample article content to render fully (use this as the example for `/learn/what-is-hpv`):**

```
EYEBROW: HPV Basics
TITLE: What is HPV?
META: For: People with no prior knowledge of HPV  ·  ~5 min read  ·  Last updated 9 May 2026

If you haven't heard of HPV, you're in good company. But you almost certainly
will encounter it at some point. It's the most common sexually transmitted
infection in the world, and most people who get it never know. This article
walks through what HPV actually is, why most cases are nothing to worry about,
and the small share that matter.

## What is HPV?

HPV stands for **Human Papillomavirus**. It's not one virus but a family of
more than 200 related viruses. Some cause harmless warts on hands or feet.
Some cause genital warts. A small group can cause cancer, including cervical
cancer, if they don't clear from your body over many years.

HPV spreads through intimate skin-to-skin contact. The CDC notes you can catch
it [INLINE QUOTE]"by having vaginal, anal, or oral sex with someone who has
the virus, even if they don't have signs or symptoms."[/INLINE QUOTE]
[ATTRIBUTION: Source: Centers for Disease Control and Prevention]

## How common is it?

**Most sexually active people get HPV at some point.** It's that common.

In the United States, the CDC estimates over 42 million people currently carry
a disease-causing type of HPV, with around 13 million new infections every
year.

## Most infections clear on their own

Here's the news that should change how you read everything that follows: most
HPV infections clear on their own.

[INLINE QUOTE]"Most people clear the virus naturally through immune
response."[/INLINE QUOTE]
[ATTRIBUTION: Source: World Health Organization]

[INLINE QUOTE]"Most HPV infections (9 out of 10) go away by themselves within
2 years."[/INLINE QUOTE]
[ATTRIBUTION: Source: Centers for Disease Control and Prevention]

## What you can do

Two things have strong evidence for protecting against cervical cancer:

- **HPV vaccination** covers the most dangerous types. [Read more about the HPV
  vaccine](/learn/hpv-vaccine)
- **Cervical screening** finds changes early, when treatment is simple. [Read
  more about cervical screening](/learn/screening-test-overview)

[CENTERED PRIMARY CTA BUTTON: "Have a personal question about HPV? Ask the AI"]
```

Render the full article using the typography rules above. The other four
standard articles follow the same pattern with placeholder content of similar
density.

---

### Variant B: Scrollytelling (used by ONE article: `screening-appointment`)

Used when frontmatter `layout: scrollytelling`.

**Structure:**
- Top nav, header (same as standard).
- Intro paragraph (standard layout, centered max-width 720px column).
- **Scrollytelling block (this is the special part):**
  - Two-column layout, full viewport height per step:
    - Left rail (sticky, ~280px wide): vertical stepper. Each step shows
      "STEP 01", "STEP 02" etc. in 14px weight 600 muted gray; active step in
      charcoal with a 2px sage left border. Step title in 18px weight 600
      below the step number.
    - Right column (560px wide, centered in remaining width): the **scroll-
      triggered illustration area**. As the user scrolls into each step's
      section, a different botanical line illustration fades in (or morphs)
      to suggest the appointment moment. For this build, use simple
      placeholder line drawings:
      - Step 1: an open envelope with a fern frond
      - Step 2: a calendar page
      - Step 3: a clinic chair (abstract: a soft curved line)
      - Step 4: a small leaf hovering over an abstract shape (kept abstract)
      - Step 5: a dotted-line swab arc
      - Step 6: an open door with a leaf
    All illustrations: charcoal `#1c1c1c` line, ~1.5px weight, ~280px square,
    centered in the right column.
  - Below the illustration, the step's body text (16px line-height 1.65,
    max-width 480px, centered in the right column).
  - Below the body, a thin `#eceae4` divider before the next step begins.
- Below 1024px, the layout collapses to single column: stepper becomes a
  horizontal progress bar at top (sticky), and illustrations + body stack
  in normal flow.

**Sample step content to render (for `/learn/screening-appointment`):**

```
INTRO PARAGRAPH:
If this is your first cervical screening, or your first one in a long time,
you may be feeling some mix of nervous, awkward, or unsure what's about to
happen. Most of that can be eased by knowing exactly what the appointment
involves. The procedure is short, the discomfort is mild for most people,
and there is more flexibility than you might think.

STEP 01  -  Booking
You can book through your usual GP, a women's health clinic, a sexual health
clinic, or some community health centres. When you book, you can ask whether
the appointment will be bulk-billed (most are), and whether a female provider
can do the test.
[Quote, Source: HealthDirect Australia]: "tell them if you would prefer a
female to do the test."

STEP 02  -  On the day
Wear something easy to take off below the waist. The clinic provides a sheet
for coverage. Try to book outside your period if possible. Cells are easier
to read without menstrual blood in the sample.

STEP 03  -  Position
Lie on your back with knees bent. A staff member explains what they're about
to do.
[Quote, Source: HealthDirect Australia]: "Lie on your back with knees bent
while a staff member explains the procedure."

STEP 04  -  Speculum
A small device, metal or plastic, is gently inserted into the vagina to make
the cervix visible. This is the part most people associate with discomfort.
You can ask for a smaller speculum, or to slow down, at any point.

STEP 05  -  Swab (about 30 seconds)
A small soft brush collects cells from the cervix.
[Quote, Source: HealthDirect Australia]: "This should not hurt. If you do
feel any pain, let the doctor or nurse know straight away."

STEP 06  -  Done
The speculum is removed. You're given privacy to dress. Most people are out
the door within ten minutes.
```

After the last step, an outro section (standard layout, centered 720px column)
covers the "After the test" + "Tips if you're nervous" + "Where to book"
sections, ending with a primary dark CTA "Find a screening clinic near you"
linking to `/clinics`.

---

### Variant C: Card grid (used by ONE article: `myths-debunked`)

Used when frontmatter `layout: card-grid`.

**Structure:**
- Top nav, header (same as standard).
- Intro paragraph (standard layout, centered max-width 720px column).
- **Card grid block:**
  - Below the intro, a grid of 7 numbered cards, 1 column on mobile, 2 columns
    on desktop (768px and up). 24px gap between cards.
  - Each card: cream bg, `1px solid #eceae4`, 12px radius, 32px padding.
  - Card structure (top to bottom):
    - Large numeral (e.g. "01") in 48px weight 600 charcoal, top-left.
    - "Myth:" label in 14px muted gray uppercase tracking +0.5px.
    - The myth statement: 18px weight 400 muted gray with strikethrough.
    - 16px gap.
    - "Reality:" label in 14px charcoal uppercase tracking +0.5px.
    - The reality statement: 18px weight 600 charcoal.
    - 16px gap.
    - "Evidence:" label in 14px muted gray uppercase tracking +0.5px.
    - The evidence quote in italic 14px charcoal, with a thin sage left border
      (same style as inline quote in standard variant). Attribution in 14px
      muted gray below the quote.
  - Each card fades up + 8px translate on scroll into viewport (Intersection
    Observer, 60% threshold, 400ms ease-out).
- Below the card grid, an outro paragraph + a primary dark CTA "Have a
  question we didn't cover? Ask the AI" routing to `/chat`.

**Sample card content to render (use these 7 verbatim):**

```
01  -  Myth: "If I have HPV, I'm going to get cancer."
Reality: Almost all HPV infections clear on their own. Only the small share
that persist for many years carry a real cancer risk, and screening catches
changes long before then.
Evidence: "Most HPV infections (9 out of 10) go away by themselves within
2 years." Source: Centers for Disease Control and Prevention.

02  -  Myth: "The test is painful, I keep avoiding it."
Reality: Uncomfortable, sometimes. Painful for most people, no. The whole
sample takes around ten seconds. And since 2022 in Australia, you can
self-collect with a swab if a clinician collection feels like too much.
Evidence: "You collect your own sample using a simple swab under healthcare
provider guidance, equally effective and suitable for those uncomfortable
with clinician collection." Source: Cancer Council Australia.

03  -  Myth: "Once you're through menopause, you can stop being screened."
Reality: In Australia, eligibility runs to age 74. Cervical cancer can develop
at any age, and post-menopausal screening still matters.
Evidence: Eligibility "applies regardless of...menopausal status." Source:
Cancer Council Australia.

04  -  Myth: "I'm only at risk if I'm having vaginal sex with men."
Reality: HPV spreads through any intimate skin-to-skin contact: vaginal,
anal, or oral. People in same-sex relationships can have HPV. People who've
never had penetrative sex can have HPV. People with one lifetime partner can
have HPV.
Evidence: "You can contract it by having vaginal, anal, or oral sex with
someone who has the virus, even if they don't have signs or symptoms."
Source: Centers for Disease Control and Prevention.

05  -  Myth: "The vaccine covers it, I'm done."
Reality: The vaccine protects against the highest-risk HPV types, 16 and 18,
which cause about 76% of cervical cancers. It doesn't cover every high-risk
type. Screening catches what the vaccine misses.
Evidence: HPV vaccines all protect against types 16 and 18, which "cause
approximately 76% of cervical cancers." Source: World Health Organization.

06  -  Myth: "Cervical cancer is in my genes, or it isn't."
Reality: Almost all cervical cancers are caused by long-term HPV infection,
not inherited genes. Family history is much less predictive than your
screening status.
Evidence: "Almost all cervical cancer cases result from infection with
oncogenic (cancer-causing) types of HPV." Source: World Health Organization.

07  -  Myth: "We're monogamous, HPV isn't relevant to me."
Reality: HPV can stay dormant for years before being detected. You may be
carrying it from a relationship years ago and only see it now. A new HPV
diagnosis doesn't mean a partner has cheated.
Evidence: Progression "typically requires 15-20 years," and HPV transmits
"even if they don't have signs or symptoms." Source: World Health Organization
and Centers for Disease Control and Prevention.
```

---

## Responsive Rules
- All standard breakpoints from the landing page apply.
- TOC: visible left rail at 1024px and up, accordion at top below.
- Right rail CTAs: visible at 1024px and up, sticky bottom band below.
- Article max-width: 720px reading column on all desktop sizes.
- Card grids: 2 columns at 768px and up, 1 column below.
- Scrollytelling: two-column at 1024px and up, single column with sticky
  horizontal progress bar below.

## Hard constraints (do NOT violate)
- Never use pure white `#ffffff` as a background.
- Never use font weight 700. 600 is the maximum.
- Never use heavy box-shadows on cards. Borders are the containment mechanism.
- Never introduce saturated brand colors. Palette stays warm-neutral with
  whisper accents.
- Never use stock photography or pink-ribbon visual clichés.
- Never imply diagnosis, treatment, or medical certainty in any copy.
- Never show a "draft", "WIP", "review", or status badge in the product UI.
  Internal review state belongs in source files only, never in rendered output.
- Always show source attribution for every direct quote. Quote and attribution
  must be visually paired.
- All third-party source names appear as TEXT only (no real logos).

## Deliverable
Two routes: `/learn` (the hub) and `/learn/[slug]` (the article detail with
three layout variants selectable via frontmatter `layout` field). Use Tailwind
CSS with the exact tokens above defined as theme extensions. Built with
semantic HTML, accessible focus states, and the soft warm focus shadow
`rgba(0,0,0,0.1) 0px 4px 12px` on all interactive elements. Use shadcn/ui
primitives where they fit. Article body content can be hard-coded for the
sample articles listed in this prompt; do not wire to a CMS.
````

---

## Notes on use

- This prompt is self-contained and inherits the visual system from the
  landing page prompt (`2026-05-04-landing-page-lovable-prompt.md`). Lovable
  does not need access to the rest of the codebase, but **provide both prompts
  in the same Lovable project** so the design system stays consistent.
- The `Camera Plain Variable` font is custom and won't be available in
  Lovable's environment. Lovable will fall back to `ui-sans-serif, system-ui`.
  Re-apply Camera Plain when porting the output back to this repo.
- The output is presentational only. The article frontmatter `layout` field
  selection mechanism is conceptual. Lovable can hard-code the three sample
  articles to render their respective variants. The full content/frontmatter
  pipeline (markdown loading, dynamic routing) is implemented separately when
  this is ported into the Next.js codebase.
- Source files in `docs/learn-content/v1/*.md` carry a "Drafting note" callout
  in their working state. That note is INTERNAL ONLY and must NOT appear in
  the rendered product UI. When article content is migrated into the
  production pages, the Drafting note section is dropped at the page-render
  boundary.
- Source attribution must be preserved exactly as paired in the prompt. The
  visual pairing of quote-and-attribution is a deliberate trust signal and a
  license-compliance requirement.
- If Lovable substitutes any color, font weight, or removes the inset-shadow
  detail, push back. The design system explicitly forbids those drifts.
