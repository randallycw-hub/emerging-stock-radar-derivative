# Task 2 report: homepage public-event strip

## Implementation

- Added the semantic `近期公開事件` section after the four existing homepage market modules, with live coverage and event-strip targets.
- The homepage now follows the active published-data pointer to read runtime, manifest, the declared `datasets.bondWorkbench`, and `ipoEventsUrl` through `safeJsonFetch`.
- It passes only `workbench.records`, `ipo.records`, and `manifest.market.dataDate` to `buildPublicEventDigest()`.
- Ready digest entries render as destination links. Unavailable entries render as non-link articles containing `資料暫時無法讀取`, with no invented numeric value. Dates are formatted only after validation.
- Added compact warm-paper event-card styling, explicit unavailable styling, focus/hover states, dark-theme token usage, and a one-column 900px layout.

## Changed files

- `static-showcase/index.html`
- `static-showcase/assets/home-page.js`
- `static-showcase/assets/app.css`
- `tests/static-showcase-pages.test.mjs`

## TDD evidence

### RED

Command (BelowNormal process priority; `UV_THREADPOOL_SIZE=2`):

```powershell
node --test tests/static-showcase-pages.test.mjs
```

Result: 15 passed, 1 failed. The new `首頁以已發布資料提供事件列與覆蓋狀態` contract failed as expected because `id="home-event-strip"` was absent.

### GREEN

Command (BelowNormal process priority; `UV_THREADPOOL_SIZE=2`):

```powershell
node --test tests/static-showcase-pages.test.mjs tests/public-event-digest.test.mjs
```

Result: 18 passed, 0 failed.

### Full suite

Command (BelowNormal process priority; `UV_THREADPOOL_SIZE=2`):

```powershell
npm test
```

Result: build completed and 953 tests passed, 0 failed, in 14.18 seconds. `node --check static-showcase/assets/home-page.js` and `git diff --check` also completed cleanly.

## Self-review

- Confirmed the four original market modules remain intact and the new section follows them.
- Confirmed active runtime URLs—not static fixture data—drive the rendering path.
- Confirmed published IPO evidence remains delegated to Task 1's digest, which requires `sourceRecordIds`.
- Confirmed unavailable cards are `article` elements, whereas ready cards are links.
- Confirmed no prohibited ranking, recommendation, trading-direction, or target-price wording appears in the modified homepage HTML or script.

## Concerns

The currently checked-in active runtime snapshot does not yet declare `bondWorkbench`; that card correctly displays the unavailable state until the publication pipeline supplies the declared artifact. No deployment was performed.
