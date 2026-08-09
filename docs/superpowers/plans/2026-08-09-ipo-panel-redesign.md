# IPO Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remodel `/ipo-radar` and `/ipo` into the reference market-dashboard pattern while preserving verified IPO data, sorting, filtering, date semantics, and theme accessibility.

**Architecture:** Keep the existing static showcase and page-specific controllers. Add a shared IPO dashboard shell in the two HTML entry points, update the existing controllers to render the new summary/event/table regions from the same normalized snapshot, and add scoped CSS for the dashboard grid, phase cards, controls, and responsive layout. No new data source or speculative field is introduced.

**Tech Stack:** Static HTML, vanilla ES modules, CSS custom properties, Node test runner, existing `ipo-data.js`, `ipo-radar-page.js`, `ipo-page.js`, and `app.css`.

## Global Constraints

- Use the verified IPO snapshot and preserve its data date; missing dates render `待公告` or `—`, never guessed values.
- Keep the existing light/dark theme switch and ensure text, controls, table headers, and status badges remain readable in both themes.
- Do not add real-time IPO prices, investment ratings, forecasts, or trading advice.
- Keep URL state for query, market, stage, event, year, sort, direction, and page parameters.
- Keep desktop left navigation and provide a responsive top navigation on narrow screens.

---

### Task 1: Add regression coverage for the shared IPO dashboard contract

**Files:**
- Modify: `tests/static-showcase-ipo-radar-ui.test.mjs`
- Modify: `tests/static-showcase-artifacts.test.mjs`

**Interfaces:**
- Consumes: HTML markers and page-controller output already used by the static showcase tests.
- Produces: Assertions that the two pages expose the shared dashboard markers, stage counts, sortable tables, and missing-date labels.

- [ ] **Step 1: Write failing assertions**

Add checks that `ipo-radar.html` and `ipo.html` contain `data-ipo-dashboard`, `data-ipo-summary`, `data-ipo-data-status`, a sortable table, and a responsive card container. Add a fixture assertion that a row with a missing event date renders `待公告` or `—` rather than an invented date.

- [ ] **Step 2: Run the focused tests**

Run: `npm.cmd test -- tests/static-showcase-ipo-radar-ui.test.mjs tests/static-showcase-artifacts.test.mjs`

Expected: FAIL because the new dashboard markers are not present.

- [ ] **Step 3: Commit the test contract**

```powershell
git add tests/static-showcase-ipo-radar-ui.test.mjs tests/static-showcase-artifacts.test.mjs
git commit -m "test: define IPO dashboard panel contract"
```

### Task 2: Restructure the IPO Radar entry point

**Files:**
- Modify: `static-showcase/ipo-radar.html`
- Modify: `static-showcase/assets/ipo-radar-page.js`

**Interfaces:**
- Consumes: `loadIpoEvents()` normalized records and existing URL state.
- Produces: `data-ipo-dashboard="radar"`, summary cards for AB/C/D, recent-event cards, stage filters, and the full sortable event table.

- [ ] **Step 1: Add the shared panel regions**

Keep the existing page title and navigation links, then add the dashboard data-status row, four summary cards, an upcoming-events region, filter controls, and table/card containers with stable IDs used by the controller.

- [ ] **Step 2: Render summary and upcoming event data**

Update `renderSummary()` and the upcoming-event renderer so counts come from `state.rows`, dates use `formatDate`, and missing dates display `待公告`. Preserve the existing recent-event ordering and stage filters.

- [ ] **Step 3: Expand the sortable table**

Render columns for stage, code/company, market, current progress, primary event/date, distance, pricing status, and snapshot date. Add clickable column headers that update `state.sortKey`, `state.direction`, URL parameters, and `aria-sort`.

- [ ] **Step 4: Run the focused tests**

Run: `npm.cmd test -- tests/static-showcase-ipo-radar-ui.test.mjs`

Expected: PASS with the new markers and the existing sorting/filtering assertions.

- [ ] **Step 5: Commit the radar page**

```powershell
git add static-showcase/ipo-radar.html static-showcase/assets/ipo-radar-page.js tests/static-showcase-ipo-radar-ui.test.mjs
git commit -m "feat: redesign IPO radar dashboard"
```

### Task 3: Restructure the IPO Calendar entry point

**Files:**
- Modify: `static-showcase/ipo.html`
- Modify: `static-showcase/assets/ipo-page.js`

**Interfaces:**
- Consumes: the same normalized IPO records and existing list/month view state.
- Produces: `data-ipo-dashboard="calendar"`, five phase panels, upcoming-event cards, complete date table, and the same search/filter/sort URL contract.

- [ ] **Step 1: Add five phase panels**

Keep the list/month tabs, add five responsive phase panels before the table, and expose each phase count through a stable `data-ipo-stage-count` attribute. Clicking a phase sets `state.stage`, resets the page, and synchronizes the URL.

- [ ] **Step 2: Render complete date fields**

Extend the table and cards to show application, review, board, contract, pricing/auction, and listing dates from the normalized records. Use `formatDate` for valid values and `待公告` for absent values.

- [ ] **Step 3: Preserve calendar grouping and controls**

Keep the month view, search, market/stage/event/year filters, pagination, and sortable headers. Ensure phase-panel clicks and table filters share the same state and do not create contradictory URL parameters.

- [ ] **Step 4: Run the focused tests**

Run: `npm.cmd test -- tests/static-showcase-ipo-radar-ui.test.mjs`

Expected: PASS for five stage panels, complete date columns, sorting, filtering, and empty states.

- [ ] **Step 5: Commit the calendar page**

```powershell
git add static-showcase/ipo.html static-showcase/assets/ipo-page.js tests/static-showcase-ipo-radar-ui.test.mjs
git commit -m "feat: redesign IPO calendar dashboard"
```

### Task 4: Add responsive dashboard styling and accessibility states

**Files:**
- Modify: `static-showcase/assets/app.css`

**Interfaces:**
- Consumes: the shared class names and data attributes from Tasks 2–3.
- Produces: the visual system for left navigation, update strip, KPI cards, phase panels, event cards, filter toolbar, sortable tables, empty/error states, and mobile layout.

- [ ] **Step 1: Add desktop dashboard styles**

Create scoped `.ipo-dashboard` rules for the two-column shell, summary cards, event cards, filter toolbar, table density, stage color accents, and hover/focus states. Reuse existing theme variables and keep primary accents copper/lilac rather than green.

- [ ] **Step 2: Add mobile layout rules**

At the existing mobile breakpoint, collapse the side navigation, stack summary cards, convert wide tables to horizontal scroll with visible headers, and stack the five phase panels without hiding required fields.

- [ ] **Step 3: Add light/dark contrast states**

Check `color`, `background`, `border`, `button`, `aria-sort`, empty, loading, and error styles for both `[data-theme="light"]` and `[data-theme="dark"]`.

- [ ] **Step 4: Run visual/static checks**

Run: `npm.cmd test -- tests/static-showcase-ipo-radar-ui.test.mjs`

Expected: PASS, with no missing selector or CSS syntax errors.

- [ ] **Step 5: Commit the styles**

```powershell
git add static-showcase/assets/app.css
git commit -m "style: add shared IPO dashboard panels"
```

### Task 5: Full verification and production static publish

**Files:**
- Verify: `static-showcase/ipo-radar.html`
- Verify: `static-showcase/ipo.html`
- Verify: `static-showcase/assets/ipo-radar-page.js`
- Verify: `static-showcase/assets/ipo-page.js`
- Verify: `static-showcase/assets/app.css`

**Interfaces:**
- Consumes: completed dashboard pages and tests from Tasks 1–4.
- Produces: a verified static showcase ready for Netlify production deployment.

- [ ] **Step 1: Run the complete test suite**

Run: `npm.cmd test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Check the generated static files**

Run: `git diff --check` and confirm the static showcase contains both updated HTML pages and assets.

- [ ] **Step 3: Deploy the static showcase**

Run: `npx.cmd --yes netlify-cli@latest deploy --dir static-showcase --no-build --prod --site c37c1976-9f24-4419-a895-e489fe57bbe5 --json`

Expected: a production deploy for `https://cb-market-desk.netlify.app`.

- [ ] **Step 4: Verify the live pages**

Open `/ipo-radar` and `/ipo`, wait for the snapshot to load, and confirm visible stage counts, event rows, date values, sort controls, and both theme modes.

- [ ] **Step 5: Check repository state**

```powershell
git status --short
git log -1 --oneline
```

Expected: no untracked or unstaged implementation files.
