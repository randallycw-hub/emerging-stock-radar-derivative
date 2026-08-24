# Task 6 Report — CB search and single-record workbench

## Delivered

- Extended the existing CB top search to match full or partial CB code, CB name, issuer code, and issuer name from records already loaded by the published workbench. It makes no additional data request.
- Added keyboard-accessible ARIA combobox/listbox suggestions. Arrow keys move the highlighted exact record, Enter opens it, Escape closes suggestions, and mouse selection uses the same flow.
- Kept list filter query state when a suggestion opens the existing workbench at `?bond=<exact code>`.
- Added a compact first-viewport fact dashboard for conversion price, stock close, conversion value, premium, remaining ratio, next event, and maturity. Every card supplies its own data date plus evidence state; absent evidence displays `目前無核准公開資料／待確認`, never zero or inference.
- Reused the published workbench's existing per-field state where its strict schema does not carry a per-field source URL. Direct official event URLs remain allowlisted; existing official-evidence sections remain intact.
- Added responsive desktop/mobile styling at the existing 900px breakpoint.

## TDD evidence

1. Added `tests/cb-search-workbench.test.mjs` before the new exports and markup existed; it initially failed because `buildBondSearchSuggestions` was absent.
2. Added issuer-code list-search coverage; it failed until the list matcher was extended to include `issuerCode`.
3. Added published-field-state dashboard coverage; it failed until field-level `complete` state was treated as approved published evidence.

## Verification

All commands used `UV_THREADPOOL_SIZE=2`, Node test concurrency 2 where applicable, and Windows `BelowNormal` process priority.

```text
node --test tests/cb-search-workbench.test.mjs tests/static-showcase-bond-ui.test.mjs tests/static-showcase-bond-detail.test.mjs tests/cb-workbench-acceptance.test.mjs
40 passed, 0 failed

node --test --test-concurrency=2
977 passed, 0 failed

npm.cmd run typecheck
exit 0

npm.cmd run lint
exit 0; 3 existing warnings in scripts/static-ipo-fallback.mjs and static-showcase/assets/bond-candlestick-chart.js

npm.cmd run build
exit 0

git diff --check
exit 0
```

## Scope and concerns

- No deployment, live/third-party data access, advice, scoring, rankings, trading-cost, or realtime-data feature was added.
- The existing detail workbench retains legacy, expandable terms/history/status/formula/evidence content as requested.
