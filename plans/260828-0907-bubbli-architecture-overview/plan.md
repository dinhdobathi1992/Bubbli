---
title: Bubbli architecture overview (show-off)
status: completed
priority: P2
effort: small
branch: main-rebuild
tags: [showcase, architecture, docs]
created: 2026-08-28
---

# Bubbli architecture overview

A showcase page covering the database structure and the application structure,
built from the repository as it stands rather than from the plans.

## Invocation

`/ak-show-off "overview of the application — db structure, app structure"`

## Resolved preferences

Source: `~/.agentkit/show-off/preferences.json` (absent — defaults applied).

| Preference | Value |
|---|---|
| `screenshots` | `true` |
| `publishing` | `true` |
| `languages` | `["vi", "en"]` (bilingual, toggle required) |

## Environment findings

| Tool | State | Consequence |
|---|---|---|
| `puppeteer` | installed on request | `scripts/capture-sections.js` runs |
| `rws` + `RWEB_API_KEY` | absent / unset | fallback unneeded once the local path worked |
| `agentwiki` | absent | publishing redirected to the harness Artifact surface |

`puppeteer` and `sharp` were installed into the skill's own `scripts/` with
`PUPPETEER_SKIP_DOWNLOAD=true`, pointing at the system Chrome through
`CHROME_EXECUTABLE_PATH`, so no second Chromium was downloaded.

## Capture

15 images: 5 sections at 3 ratios, `images/`.

The capture script screenshots the section ELEMENT, and that box excludes the
classic scrollbar headless Chrome draws, so every image came out 30 device
pixels short of its target width. Padding each one with its own right-edge
colour corrects the ratio without distorting type; stretching would have skewed
it by the same 0.8%. Verified: 3840x2160, 2160x2160, 2160x3840 exactly.

## Tasks

- [x] request-analysis — five sections, evidence read from the repository
- [x] content — `content.md`, bilingual VI/EN
- [x] HTML — `index.html`, built on the product's own Forest token layer
- [x] local open/review — self-review gate run, seven failures found and fixed
- [x] publish — https://claude.ai/code/artifact/61269ffa-2cbc-4638-bc41-8df60d2c8256
- [x] capture — 15 images, `images/`

## Defects found by running the gate, not by reading

| # | Defect | Fix |
|---|---|---|
| 1 | `data-lang` on `:root` collided with an attribute the artifact host also stamps, so the page opened in Vietnamese although English is the coded default | Namespaced to `data-bubbli-lang`. Verified: the published page now opens in English |
| 2 | Hero H1 broke to four lines, failing the 2-line iron rule | Display scale capped at 3.35rem. Verified at three lines in both languages |
| 3 | `--subtle` (#75897d) measures about 3.3:1 on the light ground, below AA, and was carrying every small label | All label text moved to `--muted` |
| 4 | `.rise` started at `opacity: 0`, so a page with no JS shipped blank | Visible by default; hidden only after script confirms it is running |
| 5 | Three uppercase kickers against a budget of two | Dropped the decorative one; the two that remain are file paths |
| 6 | Malformed attribute `data-en"` | Closed |
| 7 | Control buttons only dimmed on hover | They now move |

## Verified

Rendered in Chrome at the published URL: fonts load, the Forest palette and
severity ramp render, the hero composes at three lines in English and in
Vietnamese, and the English default holds.

Then closed by the captures, which render the real file at controlled
viewports: every section composes, the control cluster IS present at the top
right (it was only clipped by the artifact viewer's pane), the dark theme
resolves, and the portrait case holds the four-column step table at 1080px
without clipping.

## Still not verified

The 375px phone layout. The capture ratios bottom out at 1080px wide, and no
capture was taken below the 560px breakpoint.

## Acceptance criteria

- [ ] Every claim traced to a file in this repository, not to a plan document
- [ ] Database section reflects `src/db/schema.ts` and `drizzle/` as applied
- [ ] Application section reflects the real route tree and module boundaries
- [ ] Bilingual VI/EN with a working toggle
- [ ] Sections fit 16:9, 9:16 and 1:1 without clipping
