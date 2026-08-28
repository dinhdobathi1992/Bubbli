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
| `puppeteer` | absent | `scripts/capture-sections.js` cannot run |
| `rws` + `RWEB_API_KEY` | absent / unset | screenshot fallback unavailable |
| `agentwiki` | absent | cannot publish by the skill's route |

Neither capture path exists, so the capture task is **blocked**, not skipped —
the preference asked for screenshots and the environment cannot supply them.
Publishing is redirected to the harness Artifact surface, which is available.

## Tasks

- [x] request-analysis — five sections, evidence read from the repository
- [x] content — `content.md`, bilingual VI/EN
- [x] HTML — `index.html`, built on the product's own Forest token layer
- [x] local open/review — self-review gate run, seven failures found and fixed
- [x] publish — https://claude.ai/code/artifact/61269ffa-2cbc-4638-bc41-8df60d2c8256
- [ ] capture — **BLOCKED**: no puppeteer, no `rws`, no `RWEB_API_KEY`

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

## Not verified

The artifact preview pane did not respond to synthetic scrolling and clips at
its right edge, and the browser extension refuses `file://`, so the sections
below the hero, the control cluster, and the 375px layout were **not** confirmed
in a browser. They are reasoned from the CSS, not measured. `open index.html`
shows the page in a normal window if you want to check.

## Acceptance criteria

- [ ] Every claim traced to a file in this repository, not to a plan document
- [ ] Database section reflects `src/db/schema.ts` and `drizzle/` as applied
- [ ] Application section reflects the real route tree and module boundaries
- [ ] Bilingual VI/EN with a working toggle
- [ ] Sections fit 16:9, 9:16 and 1:1 without clipping
