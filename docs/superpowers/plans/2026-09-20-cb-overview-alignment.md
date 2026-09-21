# CB Overview Alignment Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this bounded continuation in the current worktree.

**Goal:** Align the existing CB overview with the inspected Cyclesinvest table, presets, summary and inline/mobile details.

**Architecture:** Keep the approved public workbench loader and existing filter validation. Add pure preset/summary/compact-detail functions to the overview module and share them between table and mobile cards. Do not embed the company-level reference iframe or its feeds.

**Tech Stack:** Static HTML/CSS, ES modules, Node test runner.

**Spec:** User's reference URL and continuation; detailed inspection recorded in docs/CB_OVERVIEW_REFERENCE_REVIEW_20260920.md.

## Global Constraints

- Preserve navy/teal theme and existing additional views.
- Official approved post-close data only; individual price dates, conversion effective date and balance date remain visible.
- No deployment, source approval changes, new live feeds, mock fallbacks or restoration of removed historical CB charts.
- Preserve the existing untracked filing/auction work.
- BelowNormal process priority, at most two CPU threads and half the logical CPUs available to Windows.

## Review Focus

- Future issue dates and expired maturities must not match bounded 90-day presets.
- Missing values must stay absent; comparisons must not coerce them to zero.
- Two CBs from the same company must open their own bond's details.
- Explicit quote-view links and return-to-list state must survive the new default overview.
- Mobile cards and desktop inline rows must retain keyboard operation and dated values.

## Task 1: Presets, default overview and global summary

Files: assets/bond-filter-page.js, assets/cb-detail-v53.js under static-showcase; tests/cb-overview-reference.test.mjs; existing default-view assertions.

- [x] Add failing tests: `assert.equal(readCbFilterState('').view, 'overview')`; apply price/remaining/value presets to boundary and missing-value records; date presets reject day -1/91 and future issues. Test calendar six-month cutoff including month-end clamp and distinct issuers.
- [x] Run `node --test --test-concurrency=1 tests/cb-overview-reference.test.mjs`; confirm RED.
- [x] Implement `cbPresetRanges(key, dataDate)` returning validated range fields (null for unknown/unavailable date presets), and `cbOverviewSummary(records, dataDate)` returning active bonds, distinct issuers, next-six-calendar-month maturities.
- [x] Default read/render/URL state to overview; preserve explicit quote view through detail return.
- [x] Rerun focused tests, confirm GREEN.

## Task 2: Table, detail disclosure and responsive page

Files: same overview module, static-showcase/bonds-filter.html, static-showcase/assets/workspace.css.

- [x] Test thirteen table headers/cells, selected bond identity, escaped content, separate issue/listing/conversion dates, unavailable prices and mobile dated quote output.
- [x] Implement exact overview columns: stock code/name, bond code/name, CB close/recent trade, conversion price/value, guarantee, stock close, remaining %, issue date, maturity, details. Keep the five other existing views.
- [x] Render compact bond facts via `renderCbOverviewFacts(record, filterSearch)`; use desktop row disclosure and mobile native details with the same full-detail return link.
- [x] Add global summary, six range preset buttons, visible date/numeric ranges, explicit search button and source/date context.
- [x] Verify search, combined presets, clear, sort, detail return, keyboard tabs and 390px mobile layout in browser.

## Task 3: Evidence and verification

- [x] Write source/field audit with actual reference observations, official alternatives, data-date mismatches and deferred source approval.
- [x] Run full `node --test --test-concurrency=1`, `npm run typecheck`, `npm run lint`, `npm run build` in low-load mode.
- [x] Request read-only code review while local validation runs; fix material findings and rerun affected checks.
- [x] Report verified local outcome and remaining data gaps; leave deployment unchanged.
