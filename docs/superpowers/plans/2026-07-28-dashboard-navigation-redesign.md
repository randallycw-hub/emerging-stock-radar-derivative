# Dashboard Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the existing stock radar homepage, responsive layout, visual tokens, data transparency, and company/bond/IPO navigation without changing the approved data boundaries.

**Architecture:** Keep the existing `Homepage` composition and route structure. Update shared CSS tokens/layout first, then add reusable status and navigation copy in the existing page components, preserving fixture/API contracts and avoiding new network requests.

**Tech Stack:** Next/Vinext, React, TypeScript, CSS, Node test runner.

## Global Constraints

- Use Cloud Dancer off-white, Transformative Teal, deep ink blue, and restrained warm gold.
- Do not add quote, recommendation, arbitrage, or invented fallback data.
- Keep all production external sources and D1 contracts unchanged.
- Mobile layouts must keep page width stable; only local tables may scroll horizontally.
- All user-facing metadata and labels must be valid Traditional Chinese.

---

### Task 1: Homepage and mobile information hierarchy

**Files:**
- Modify: `app/Homepage.tsx`
- Modify: `app/globals.css`
- Test: existing homepage/style tests under `tests/`

**Interfaces:** Preserve existing homepage props, route links, and fixture/API DTO usage. Produce a first viewport ordered as status, summary, data entry points, then detail surfaces.

- [ ] Inspect existing homepage sections and identify the current mobile breakpoint rules.
- [ ] Reorder only presentational wrappers so the status strip and primary summary precede dense tables on narrow screens.
- [ ] Add mobile grid rules that collapse summary/mover/entry cards to one column while retaining local `.table-wrap` scrolling.
- [ ] Add visible `:focus-visible` states to navigation and action controls.
- [ ] Run `npm.cmd test -- --runInBand` and confirm no route or fixture tests regress.
- [ ] Commit with `feat: improve dashboard responsive hierarchy`.

### Task 2: Cloud Dancer × Transformative Teal visual system

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

**Interfaces:** Preserve existing class names where possible; update CSS custom properties and metadata strings only.

- [ ] Replace unreadable encoded site title/description with approved Traditional Chinese copy.
- [ ] Set canvas/paper/nav/link/status tokens to the approved palette and remove purple/blue gradient-like emphasis from primary surfaces.
- [ ] Keep contrast for body text, controls, and status chips at accessible levels.
- [ ] Run the build and existing theme/metadata tests.
- [ ] Commit with `feat: refine cloud dancer teal theme`.

### Task 3: Data status and source transparency

**Files:**
- Modify: `app/Homepage.tsx`
- Modify: relevant shared page components in `app/`
- Modify: `app/globals.css`
- Test: existing public snapshot/status tests under `tests/`

**Interfaces:** Use existing snapshot status fields and source attribution DTOs; do not invent a successful state when the API is unavailable.

- [ ] Add a compact status panel showing availability, last fetched time, source name, and official source link when present.
- [ ] Add explicit unavailable copy that explains the data is temporarily unavailable and does not substitute fixtures in production.
- [ ] Ensure status meaning is conveyed by text plus a dot/icon, not color alone.
- [ ] Run tests covering public snapshot unavailable semantics and source attribution.
- [ ] Commit with `feat: add transparent data status surfaces`.

### Task 4: Company, bond, and IPO navigation polish

**Files:**
- Modify: existing company, bond, and IPO route page components under `app/`
- Modify: `app/globals.css`
- Test: existing route/page tests under `tests/`

**Interfaces:** Keep the current route URLs and DTO contracts. Add descriptive entry copy, back-navigation, filter hints, and mobile-safe card/table treatment.

- [ ] Add concise Traditional Chinese purpose text to each page heading and empty state.
- [ ] Add consistent entry links from the homepage to company, bond, and IPO sections.
- [ ] Add mobile card ordering and local horizontal scrolling for dense tables.
- [ ] Verify unknown-id and unavailable states remain explicit and do not fall back to invented records.
- [ ] Run the full test suite and production build.
- [ ] Commit with `feat: clarify company bond ipo navigation`.

### Task 5: Final verification

**Files:**
- Modify only files required by failing verification.

- [ ] Run `npm.cmd test -- --runInBand`.
- [ ] Run `npm.cmd run build`.
- [ ] Check `git diff --check` and `git status --short`.
- [ ] Report the four completed areas and any remaining deployment-only limitation.
