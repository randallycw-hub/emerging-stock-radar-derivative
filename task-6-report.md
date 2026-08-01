# Task 6 Report — IPO 進度雷達分頁

## Delivered

- Added `static-showcase/ipo-radar.html`: an independent IPO progress radar with three event summaries, upcoming events, A–D stage filters, search, market filter, sort controls, pagination, accessible table/card alternatives, and expandable event history.
- Added `static-showcase/assets/ipo-data.js`: `loadIpoSnapshot({ fetchImpl })` reads same-origin `/api/ipo-events`, accepts only schema version 1 snapshots with an array of records, and otherwise returns `null`.
- Added `static-showcase/assets/ipo-radar-page.js`: reads and restores `q`, `market`, `stage`, `sort`, `direction`, and `page`; keeps those state values in the URL; supports browser history restoration; links companies to `./ipo.html?q=<company code>`; and prefers the nearest future event, falling back to the most recent past event only when no future event exists.
- The page has no price, return, spread, methodology, capture-version, or mock-data content. It uses the browser session’s last valid snapshot when a new fetch is unavailable, with a concise first-load empty state if none exists.

## TDD evidence

1. Created `tests/static-showcase-ipo-radar-ui.test.mjs` before the new page, loader, and page controller existed.
2. Ran the focused test with `UV_THREADPOOL_SIZE=2`; all three tests failed as expected with missing page/module errors (`ENOENT` and `ERR_MODULE_NOT_FOUND`).
3. Added the minimal loader and radar implementation, then reran the focused tests successfully.
4. Added an A/B combined-summary URL-filter regression assertion, observed it fail, and changed the filter state from a persistent row mutation to `stage=AB` URL state.

## Verification

All Node commands used `UV_THREADPOOL_SIZE=2`; final test, lint, and typecheck runs used Windows `BelowNormal` process priority.

```text
node --test tests/static-showcase-ipo-radar-ui.test.mjs tests/static-showcase.test.mjs
6 passed, 0 failed

node --test tests/static-showcase*.test.mjs
21 passed, 0 failed

npm.cmd run lint
exit 0

npm.cmd run typecheck
exit 0

git diff --check
exit 0
```

## Concerns

Task 8 remains responsible for the shared site navigation and the dedicated radar CSS refinements specified in the overall plan. This task uses the existing responsive table/card and theme primitives without changing those cross-page files.
