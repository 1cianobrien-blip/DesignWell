# Design tokens — extracted from designwell.framer.website

Captured 2026-11-15 with Playwright (computed styles at 1440px desktop; screenshots at 1440 and 390 in `screenshots/`).
No `/design-reference/framer-css/` export was present in the repo, so these computed values are the source of truth.
If the Framer CSS export is added later, reconcile against it.

## Fonts (Google Fonts)
| Role | Family | Weights loaded |
|---|---|---|
| Wordmark only ("DesignWell") | Fraunces | 700 |
| Everything else | Manrope | 400, 500, 600, 700, 800 |

## Colours
| Token | Value | Used for |
|---|---|---|
| `brand` | `#B100DE` rgb(177,0,222) | Primary buttons, secondary-button text and border |
| `brand-ink` | `#F5F5F5` | Text on primary button |
| `ink` | `#000000` | Hero and section headings, card titles |
| `ink-strong` | `#121212` | Wordmark, nav links |
| `ink-body` | `#1F1F1F` | Company page body, h1 company name |
| `muted` | `#828282` | Hero subtitle |
| `muted-2` | `#878787` | Section subtitles |
| `muted-3` | `#8C8C8C` | Card meta ("100+ Designers") and dot separator |
| `muted-4` | `#7B7B7B` | Company meta line |
| `muted-5` | `#737373` | Step descriptions |
| `muted-6` | `#707070` | Small eyebrow labels ("Design Leadership") |
| `muted-7` | `#666666` | Mini company card text |
| `faint` | `#C9C9C9` | Large step numerals ("01") |
| `line` | `#EDEDED` | Nav bottom border (1px) |
| `line-2` | `#D9D9D9` | Tab rule / dividers |
| `field-border` | `#CCCCCC` | Select borders |
| `surface` | `#FFFFFF` | Page |
| `surface-alt` | `#F9F9F9` | Alternating full-bleed sections |
| `surface-card` | `#F5F5F5` | "Other companies" panel |
| `success` | `#46C14A` | "Actively Hiring Designers" text and dot |
| `error-bg` / `error-border` / `error-ink` | `#FEF2F2` / `#FECACA` / `#991B1B` | Error notice |
| `pill-bg` | `rgba(255,255,255,0.5)` | "Hiring" pill over card art |

## Type scale (Manrope unless noted)
| Name | Size / line-height | Weight | Tracking |
|---|---|---|---|
| wordmark (Fraunces) | 20 / 28 | 700 | -1.2px |
| hero (home) | 48 / 57.6 | 600 | -1.92px (-0.04em) |
| hero (jobs) | 36 / 43.2 | 600 | -1.44px |
| cta-heading | 32 / 38.4 | 700 | -1.28px |
| section-heading | 24 / 28.8 | 500 | -0.96px |
| company-name | 20 / 24 | 700 | — |
| body-lg / subtitle | 16 / 19.2 | 500 | — |
| card-title | 16 / 19.2 | 600 | — |
| step-title | 16 / 19.2 | 700 | — |
| button | 14 / 16.8 | 700 | — |
| small body | 14 / 16.8 | 500 | 0.28px |
| nav link | 13 / 15.6 | 500 | — |
| card meta | 13 / 15.6 | 400 | 0.26px |
| pill | 13 / 15.6 | 600 | — |
| step numeral | 24 / 28.8 | 800 | -0.96px |

## Shape & spacing
- Content max width: **956px** (home, left edge at x=242 on a 1440 viewport). Company page: **820px** column. Jobs page: **747px** column.
- Nav: 76px tall, 20px padding, 1px `#EDEDED` bottom border. Wordmark left, "Jobs" centred, primary button right.
- Buttons: radius **4px**, padding **12px 16px** (renders 32px tall), 14/700. Primary = brand fill; secondary = transparent with 1px brand border, brand text.
- Company card: square art tile **228×228**, radius **8px**, solid brand colour background with logo centred. Title 16/600 centred below (8px gap), meta 13/400 muted below that. 4-column grid with ~12px gaps.
- "Hiring" pill: radius 20px, padding 5px 10px, white 50% background, 13/600, inset 16px top-left on the tile.
- Section bands: full-bleed, 80px vertical padding, alternating `#FFFFFF` / `#F9F9F9`.
- Section header: 24/500 heading, 16/500 muted subtitle 8px below, ~40px gap before content.
- Panels: `#F5F5F5`, radius 8px (Other companies), padding 24px 0 32px.
- Selects / form fields: radius **16px**, 1px `#CCCCCC`, height 44px, padding 0 40px 0 14px.
- Error notice: radius 16px, 1px border, padding 16px.
- Company logo on company page: 85×85, radius 15px.
- Tabs: 16px, active 700 `#1F1F1F` with 2px black underline, inactive 500 `#858585`; 1px `#D9D9D9` rule.
- Footer: none on the Framer site. The pages end with a centred or left-aligned CTA block ("Know a company…" / "Contribute to DesignWell") plus a button, then 80px bottom padding.
- No shadows on content (only Framer's own badge).

## Mobile and tablet (measured at 390px and 810px)
The Framer breakpoint sits above 810px, so tablets get the mobile layout.
- Side gutters 20px; content fills the width.
- Hero 31/37.2, -1.24px. Section heading 20/24, -0.8px. CTA heading 24/28.8, -0.96px. Subtitles stay 16px.
- Card grid: 2 columns, 169px tiles, 12px column gap (rows step 262px).
- The nav keeps the wordmark, "Jobs" and the primary button on one row.
- How-it-works steps stack vertically.
See `screenshots/*-mobile.png`.
