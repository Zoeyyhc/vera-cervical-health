# Design Tokens

Condensed reference for development. For the full design system rationale, see `DESIGN.md`.

## Colors

### Primary

| Name | Value | Usage |
|---|---|---|
| Cream | `#f7f4ed` | Page background, card surfaces, button surfaces — the foundation |
| Charcoal | `#1c1c1c` | Primary text, headings, dark button backgrounds |
| Off-White | `#fcfbf8` | Button text on dark backgrounds |

### Neutral Scale (Opacity-Based)

All grays are derived from `#1c1c1c` at varying opacity levels — do not introduce arbitrary hex grays.

| Name | Value | Usage |
|---|---|---|
| Charcoal 100% | `#1c1c1c` | Primary text, headings, dark surfaces |
| Charcoal 83% | `rgba(28,28,28,0.83)` | Strong secondary text |
| Charcoal 82% | `rgba(28,28,28,0.82)` | Body copy |
| Muted Gray | `#5f5f5d` | Secondary text, descriptions, captions, placeholders |
| Charcoal 40% | `rgba(28,28,28,0.4)` | Interactive borders, button outlines |
| Charcoal 4% | `rgba(28,28,28,0.04)` | Subtle hover backgrounds |
| Charcoal 3% | `rgba(28,28,28,0.03)` | Barely-visible overlays |

### Surface & Border

| Name | Value | Usage |
|---|---|---|
| Light Cream | `#eceae4` | Card borders, dividers — passive containment |
| Interactive Border | `rgba(28,28,28,0.4)` | Interactive element outlines |

### Focus & Ring

| Name | Value | Usage |
|---|---|---|
| Focus Shadow | `rgba(0,0,0,0.1) 0px 4px 12px` | Soft focus/active state shadow |
| Ring Blue | `rgba(59,130,246,0.5)` | Keyboard focus ring on inputs (accessibility) |

## Typography

Font: **Camera Plain Variable** — `ui-sans-serif, system-ui` fallback. No other fonts.

| Role | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|
| Display Hero | 60px | 600 | 1.00–1.10 | -1.5px |
| Display Alt | 60px | 480 | 1.00 | normal |
| Section Heading | 48px | 600 | 1.00 | -1.2px |
| Sub-heading | 36px | 600 | 1.10 | -0.9px |
| Card Title | 20px | 400 | 1.25 | normal |
| Body Large | 18px | 400 | 1.38 | normal |
| Body | 16px | 400 | 1.50 | normal |
| Button | 16px | 400 | 1.50 | normal |
| Button Small | 14px | 400 | 1.50 | normal |
| Caption / Link Small | 14px | 400 | 1.50 | normal |

**Weight rule:** 400 for body/UI/buttons/links, 600 for headings. **Maximum weight is 600 — never use 700.**

**Letter-spacing rule:** Negative spacing scales with size (-1.5px at 60px, -1.2px at 48px, -0.9px at 36px, normal at ≤20px). Do not increase letter-spacing on headings.

## Spacing

Base unit: 8px.

Scale: `8, 10, 12, 16, 24, 32, 40, 56, 80, 96, 128, 176, 192, 208` (px)

Section spacing uses the generous upper end (80px–208px) for editorial breathing room.

## Border Radius

| Name | Value | Usage |
|---|---|---|
| Micro | 4px | Small buttons, interactive elements |
| Standard | 6px | Buttons, inputs, navigation |
| Comfortable | 8px | Compact cards, divs |
| Card | 12px | Standard cards, image containers |
| Container | 16px | Large containers, footer sections |
| Full Pill | 9999px | Action pills and icon buttons only |

## Button Variants

**Primary Dark**
- Background: `#1c1c1c`, Text: `#fcfbf8`, Radius: 6px, Padding: 8px 16px
- Shadow: `rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px`
- Active: opacity 0.8. Use for primary CTAs.

**Ghost / Outline**
- Background: transparent, Text: `#1c1c1c`, Radius: 6px, Padding: 8px 16px
- Border: `1px solid rgba(28,28,28,0.4)`. Active: opacity 0.8. Use for secondary actions.

**Cream Surface**
- Background: `#f7f4ed`, Text: `#1c1c1c`, Radius: 6px, Padding: 8px 16px, No border.
- Use for tertiary/toolbar actions.

**Pill / Icon Button**
- Background: `#f7f4ed`, Text: `#1c1c1c`, Radius: 9999px
- Same inset shadow as Primary Dark. Opacity: 0.5 default, 0.8 active.
- Use **only** for icon buttons and action toggles.

## Elevation

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow, cream background | Page surface, most content |
| Bordered | `1px solid #eceae4` | Cards, images — preferred over shadows |
| Inset | Multi-layer inset shadow (see Primary Dark button) | Dark buttons |
| Focus | `rgba(0,0,0,0.1) 0px 4px 12px` | Active/focus states |

Cards use **borders, not box-shadows**, for containment.

## Critical Do / Don't

1. **DO** use `#f7f4ed` as every background — never `#ffffff`
2. **DO** derive all grays from `#1c1c1c` at opacity levels
3. **DO** use `#eceae4` borders for passive containment; `rgba(28,28,28,0.4)` for interactive borders
4. **DO** use the inset shadow technique on dark buttons
5. **DO** use 9999px radius only for action pills and icon buttons
6. **DO NOT** use weight 700 — maximum is 600
7. **DO NOT** apply 9999px radius to rectangular buttons
8. **DO NOT** use heavy box-shadows on cards
9. **DO NOT** introduce saturated accent colors — palette is intentionally warm-neutral
10. **DO NOT** add letter-spacing increases to headings — Camera Plain runs tight at scale
