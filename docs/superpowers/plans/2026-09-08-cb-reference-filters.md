# CB reference-aligned comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the CB database's comparison and combined filters closer to Cycles while retaining verified official data and dated values.

**Architecture:** Extend the existing static CB database, consuming only the existing V55 canonical model. Keep query validation shared between the table and the individual CB return link. No new runtime feeds or source approvals are part of this UI task.

**Tech Stack:** JavaScript ES modules, HTML/CSS, Node test runner, existing Vite/vinext build.

**Spec:** `docs/CB_LAYOUT_SOURCE_AUDIT_20260907.md` plus the user's 2026-09-08 direction to use the two Cycles CB layouts. Current observed search controls: CB price, conversion price, conversion value, stock price, remaining ratio, secured state, maturity interval, issue/maturity dates.

## Global Constraints

- Preserve existing uncommitted changes and unrelated `audit/`; do not commit, push, merge or deploy in this task.
- Use only already approved canonical values; no Yahoo, brokers, CBAS, TCRI, private API, fabricated values, cross-date premium or approval-status change.
- Missing numeric values are not zero. Filter dates use the snapshot date, never today's device clock.
- Public copy is Traditional Chinese; internal source/missing/approval diagnostics stay off the page.
- CPU-intensive commands: BelowNormal priority, affinity mask 3 (two logical CPUs), `UV_THREADPOOL_SIZE=2`, `GOMAXPROCS=2`; tests `--test-concurrency=1`.
- Use `apply_patch`; no subagents from the implementer. Controller handles review and full build validation.

### Task 1: Complete combined filters and comprehensive comparison

**Files:**
- Modify `static-showcase/assets/bond-filter-page.js`, `static-showcase/assets/cb-detail-v53.js`, `static-showcase/bonds-filter.html`, `static-showcase/assets/workspace.css`.
- Create `static-showcase/assets/cb-filter-state.js` only if needed for shared URL keys/validation, and `tests/cb-reference-filters.test.mjs`.
- Update existing affected tests only when the user-visible contract intentionally changes; preserve regression coverage.

**Interfaces:**
- Keep `filterV53CbRecords(records, {query, quickFilter, dataDate, ranges, secured})` backward compatible; `secured` is `all`, `secured` or `unsecured`.
- Keep `readCbFilterState(search)` returning normalized state; expose all new keys to restore, sync, clear and safe detail return.
- Keep `renderCbDatabaseTable(records, {view, asOfDate, sort, direction, filterSearch})`; add `overview` view without removing existing five views. Keep default `quote` and old URL semantics to avoid breaking saved links.
- Numeric range keys: existing `priceMin/Max`, `premiumMax`, `remainingMin`; add `premiumMin`, `remainingMax`, `conversionPriceMin/Max`, `conversionValueMin/Max`, `stockPriceMin/Max`, `maturityDaysMin/Max`.
- Date range keys: `issueFrom/To`, `maturityFrom/To`, inclusive strict calendar ISO dates. Numeric bounds inclusive; negative premium valid; nonnegative price/day values; remaining ratio 0–100. Invalid input ignored, never coerced to zero. A reversed valid range naturally matches no rows, not silently swapped.

- [ ] **Step 1: Add failing behavioral tests and run them.** Use fixtures with exact differing issue identities and no external requests:

```js
const a = {status:'active', cbCode:'90001', stockCode:'9000', cbName:'測試一', companyName:'測試',
 quote:{cbClose:106, conversionPrice:30, stockClose:39, stockConversionValue:130, premiumRate:-2},
 terms:{remainingRatio:80, securedStatus:'有擔保', issueDate:'2026-09-01', maturityDate:'2027-09-04'}};
const b = {...a, cbCode:'90002', terms:{...a.terms, securedStatus:'無擔保'}};
assert.deepEqual(filterV53CbRecords([a,b], {dataDate:'2026-09-04', secured:'secured',
 ranges:{priceMax:'106', conversionPriceMax:'30', conversionValueMin:'130', remainingMin:'80', maturityDaysMin:'365', maturityDaysMax:'365'}}).map(r=>r.cbCode), ['90001']);
```

Also assert selected missing field excludes only that row, empty ranges include rows, premium 0 and negatives work, invalid calendar dates are ignored, inclusive date edges, future maturity date requires valid snapshot date, unknown secured status never counts as unsecured, invalid URL strings aren't restored, new conditions survive table→detail→back. Render overview and assert real dated price, issue/maturity/remaining values, matching header/body cell counts and escaped identity text. Avoid source-text-only tests.

Run: `node --test --test-concurrency=1 tests/cb-reference-filters.test.mjs` and record expected failures before implementation.

- [ ] **Step 2: Implement the filters through the real page.** Extend the existing range-definition map to pass snapshot date to maturity-days readers. Days are `(Date.parse(maturity+'T00:00:00Z')-Date.parse(asOf+'T00:00:00Z'))/86400000`, strict ISO verified first. Use a small exact secured-label allowlist based on existing canonical data, not substring matching (`無擔保` must not match `有擔保`). Share key validation between state serialization and return links; never allow arbitrary target URLs. Retain current per-field quote dates.

Use paired min/max inputs for each numeric range, two issue dates and two maturity dates. Keep number controls within collapsible `數值與日期篩選` and visible secured dropdown beside main search/quick controls. Inputs have meaningful labels and units. `距到期（天）` is deliberate: clear reproducible snapshot-day distance, not an ambiguous rounded year. Ensure Enter submits without navigation, clears reset all new values, and restored conditions open the advanced panel.

- [ ] **Step 3: Add `overview` tab and table.** Label `綜合資料`, retaining the existing default quote tab. Columns in order: CB identity, issuer, CB dated close, stock dated close, dated conversion price, dated conversion value, dated premium, outstanding amount, remaining ratio, secured status, issue date, maturity date, underwriter. Reuse existing column renderers rather than copy date or escaping logic. Mark volume sortable in price view where already supported. Add accessible horizontal scrolling; don't force 13 columns into inherited narrow percentage widths. Compact navy/teal style remains unchanged, mobile controls stack without clipped labels.

- [ ] **Step 4: Verify focused tests and self-review.** Run new tests plus `tests/cb-database-refinement.test.mjs`, `tests/static-showcase-v53-cb-pages.test.mjs`, `tests/static-showcase-bond-ui.test.mjs`, `tests/v57-cb-trade-state.test.mjs`. Read diff for clear/state URL paths, missing-value semantics, exact status, HTML escaping, future dates and local-only links. Do not run browser QA against the local site (Sites rule); do not claim visual QA.

- [ ] **Step 5: Report without committing.** Write the implementation report to the controller-designated workspace file with RED/GREEN evidence, changed files and concerns. Controller runs typecheck, lint, build, full test suite and task/final review, then updates the internal source research report.

## Controller source-research deliverable

Record official TWSE auction samples matched to Cycles (31494, 23032, 15602, 24643, 82221), distinguishing actual underwriting price from weighted winning price. Record the broken 2026-09-08 SFB attachments as rejected HTML, not a refreshed dataset. Existing registry grants TWSE auction use for IPO only; CB scope is not automatically approved. Do not add a CB runtime adapter or fill new production fields until the resource scope and parser contract are explicitly verified and approved.
