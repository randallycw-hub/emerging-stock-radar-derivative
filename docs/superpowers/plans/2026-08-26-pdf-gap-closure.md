# PDF Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Update the checkbox only after its verification command succeeds.

**Goal:** Close every implementation gap identified against the approved 50-page market-platform PDF, while never creating data, advice, or public internal diagnostics.

**Architecture:** Keep the existing static showcase and official-snapshot data boundary. Add pure public projections and test them before wiring them into HTML; data that has no approved official resource is represented by `—` or recorded as a source-approval blocker in the completion checklist, never inferred from a third party.

**Tech Stack:** Node.js 22 ESM, static HTML/CSS/modules, Node test runner, TypeScript domain layer, existing static staging build.

**Spec:** `C:\Users\USER\Desktop\Codex 總控執行指令：興櫃・IPO・可轉債公開資料研究平台完整改版.pdf`

## Global Constraints

- Use only individually approved TPEx, TWSE, TDCC, MOPS and government-open-data resources as production master data.
- Do not publish source IDs, private import filenames, missing reasons, raw diagnostics, credentials, account information or personal data.
- Public missing values are `—`; no value may be invented, copied from a third party or presented as current when it is historical.
- Do not use rating, recommendation, buy/sell, target-price, arbitrage or trade-instruction language.
- All dates use `Asia/Taipei`; CPU-intensive commands run at BelowNormal priority and maximum two worker threads.
- Every behavioural change is TDD: add a narrowly scoped failing test, run it red, implement the minimum production code, then run green.

---

### Task 1: Correct the release checklist and make source blocks explicit

**Files:**
- Modify: `docs/market-platform-v2-completion-checklist.md`
- Create: `tests/market-platform-v2-checklist.test.mjs`

**Interfaces:**
- The checklist has one row per PDF requirement group and one of `完成`, `部分完成`, `待實作`, `來源核准阻塞`.
- A source block states the exact unavailable data group and names no user/private input.

- [ ] Write a failing test that requires the checklist to contain the `首頁`, `IPO 競拍／申購`, `CB 分類`, `CB 個券`, `資料中心`, `最終驗收` rows and prohibits `全部完成`.
- [ ] Run `node --test tests/market-platform-v2-checklist.test.mjs` and verify it fails because the current checklist overstates completion.
- [ ] Replace the checklist rows with the verified implementation state and the specific approved-source blockers for TDCC holdings, stock margin/short/borrow data, quarterly financial statements, emerging bid/ask and emerging changes.
- [ ] Run `node --test tests/market-platform-v2-checklist.test.mjs` and verify it passes.
- [ ] Commit `docs: correct PDF release checklist gaps`.

### Task 2: Build the complete objective homepage dashboard

**Files:**
- Modify: `static-showcase/index.html`
- Modify: `static-showcase/assets/home-page.js`
- Modify: `static-showcase/assets/public-event-digest.js`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/home-summary.test.mjs`
- Modify: `tests/public-event-digest.test.mjs`
- Modify: `tests/public-homepage.test.mjs`

**Interfaces:**
- `buildHomeSummary({ emerging, ipo, bonds, asOfDate })` returns three named objects containing every PDF summary metric or `null`.
- `buildCrossMarketEventEntries(input, market)` returns only published, date-valid `all|emerging|ipo|bonds` event entries.
- `buildObjectiveRankings({ emerging, bonds })` returns named rankings with an objective metric label; it never returns advice text.

- [ ] Add failing tests for the five emerging, four IPO and five CB dashboard metrics, event-market filtering, an emerging event entry, and objective ranking labels.
- [ ] Run `node --test tests/home-summary.test.mjs tests/public-event-digest.test.mjs tests/public-homepage.test.mjs` and verify the new assertions fail.
- [ ] Implement pure summary, event and ranking projections using only the existing public runtime objects; missing source fields remain `null`.
- [ ] Render three full dashboard panels, `全部／興櫃／IPO／CB` event controls and labelled ranking panels without exposing internal evidence.
- [ ] Re-run the three test files and `node --test tests/static-showcase-pages.test.mjs`; verify green.
- [ ] Commit `feat: complete objective cross-market homepage dashboard`.

### Task 3: Complete IPO radar fields and add the offering page

**Files:**
- Create: `static-showcase/ipo-offering.html`
- Create: `static-showcase/assets/ipo-offering-page.js`
- Modify: `static-showcase/ipo-radar.html`
- Modify: `static-showcase/assets/ipo-radar-page.js`
- Modify: `static-showcase/ipo.html`
- Modify: `static-showcase/assets/ipo-page.js`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/ipo-lifecycle.test.mjs`
- Create: `tests/static-showcase-ipo-offering.test.mjs`

**Interfaces:**
- `projectPublicOffering(record, sourceManifest)` returns `{ companyCode, companyName, market, bidStartDate, bidEndDate, auctionOpenDate, underwritingPrice, subscriptionStartDate, subscriptionEndDate, drawDate, listingDate, underwriter, asOfDate }` using `null` for unavailable official fields.
- Radar records expose each lifecycle date and `daysInStage`; withdrawn, cancelled and delayed records are excluded from active defaults.

- [ ] Add failing lifecycle and page tests for the full radar date set, the offering row shape, date sorting and no active withdrawn record.
- [ ] Run `node --test tests/ipo-lifecycle.test.mjs tests/static-showcase-ipo-offering.test.mjs` and verify the new assertions fail because the offering page is absent.
- [ ] Implement the public offering projection from the existing approved IPO snapshots; preserve source date but do not render source IDs.
- [ ] Add the offering route to IPO context navigation, render the specified columns, and add 7/30/90/all calendar controls if not already present.
- [ ] Re-run IPO lifecycle, offering, radar and calendar UI test files; verify green.
- [ ] Commit `feat: add IPO offering and complete lifecycle fields`.

### Task 4: Bring emerging public pages to their verified-data boundary

**Files:**
- Modify: `static-showcase/emerging.html`
- Modify: `static-showcase/assets/emerging-page.js`
- Modify: `static-showcase/market.html`
- Modify: `static-showcase/assets/emerging-detail-page.js`
- Modify: `tests/static-showcase-emerging-ui.test.mjs`
- Modify: `docs/market-platform-v2-completion-checklist.md`

**Interfaces:**
- Market summary includes market count, traded count, turnover, direction counts, and low-liquidity count when a verified field exists.
- Table/detail projections distinguish `latest trade` from `today average`, preserve previous/weekly average semantics and display unavailable bid/ask as `—`.

- [ ] Add failing UI tests for traded count, low-liquidity count, previous and weekly averages, no-trade latest-date wording, and IPO stage rendering.
- [ ] Run `node --test tests/static-showcase-emerging-ui.test.mjs tests/emerging-market-view.test.mjs` and verify red.
- [ ] Implement the metrics and fields available in the current approved emerging snapshot; add a compact context link for individual company details.
- [ ] Document `新增／異動`, bid/ask, company website, recommended broker and warning/disposition/suspension as blocked until exact official source resources are approved; do not create a fake data page.
- [ ] Re-run the emerging UI and view tests plus staging tests; verify green.
- [ ] Commit `feat: extend emerging public market metrics`.

### Task 5: Complete CB market fields, exact categories and public event filters

**Files:**
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/assets/bonds-page.js`
- Modify: `static-showcase/bonds-filter.html`
- Modify: `static-showcase/assets/bond-filter-page.js`
- Modify: `static-showcase/bonds-events.html`
- Modify: `static-showcase/assets/bond-events-page.js`
- Modify: `static-showcase/assets/bond-list-page.js`
- Modify: `tests/bond-workbench.test.mjs`
- Modify: `tests/static-showcase-bond-ui.test.mjs`
- Modify: `tests/formal-bond-pages.test.mjs`

**Interfaces:**
- `applyPublicBondScreener(records, screen, { asOfDate })` accepts `issue90`, `maturity90`, `maturity365`, `price110`, `price120`, `premium0to10`, `premium10to20`, `conversion90to110`, `remainingUnder50`, `event30`.
- `filterPublicBondEvents(events, { asOfDate, type, days })` supports `all`, conversion-price adjustment, conversion suspension/resumption, put, redemption, maturity-30 and recent listing.

- [ ] Add failing tests for each exact filter range, no-trade market display, event-type filtering and public rendering without a source ID.
- [ ] Run `node --test tests/bond-workbench.test.mjs tests/static-showcase-bond-ui.test.mjs tests/formal-bond-pages.test.mjs` and verify red.
- [ ] Implement the deterministic screeners and event filters; render all available CB-market columns from the existing workbench, using `—` for unavailable verified fields.
- [ ] Keep all columns sortable, preserve the old `bonds.html?bond=` deep link, and keep mobile cards concise.
- [ ] Re-run the CB test group and static staging test; verify green.
- [ ] Commit `feat: complete CB market categories and event filters`.

### Task 6: Extend CB detail, issuance workflow and field provenance

**Files:**
- Modify: `static-showcase/assets/bond-detail-page.js`
- Modify: `static-showcase/assets/bond-candlestick-chart.js`
- Modify: `static-showcase/bonds-issuance.html`
- Modify: `static-showcase/assets/bond-issuance-page.js`
- Modify: `static-showcase/assets/site-shell.js`
- Modify: `tests/static-showcase-bond-detail.test.mjs`
- Modify: `tests/site-shell-provenance.test.mjs`

**Interfaces:**
- Detail projection has core values, distance-to-par, distance-to-conversion-price, moneyness, O/H/L/C/average/volume/turnover and 5/20-period statistics when historical snapshot rows support them.
- `projectPublicProvenance` displays human source label, `asOfDate` and fetched time but never source IDs.
- Issuance rows show only stages with an official record: announcement, filing, effective, auction/bookbuild, terms, listing and conversion start.

- [ ] Add failing detail tests for distance/moneyness, future conversion price not replacing the effective price, individual institution columns, dated no-trade output and fetched-time provenance.
- [ ] Run `node --test tests/static-showcase-bond-detail.test.mjs tests/site-shell-provenance.test.mjs` and verify red.
- [ ] Implement values strictly from existing official snapshots; add fields only where the source date is present and hide any unavailable private/internal diagnostics.
- [ ] Extend issuance display with documented official stages and render `—` for unprovided official milestones; do not use TWSA or third-party announcements as contractual truth.
- [ ] Record TDCC holdings, stock margin/short/borrow and quarterly financial statements as source-approval blockers, not zero-value fields.
- [ ] Re-run detail, provenance, chart and issuance test files; verify green.
- [ ] Commit `feat: complete sourced CB detail and issuance projections`.

### Task 7: Make data center and methodology match the public-safe PDF contract

**Files:**
- Modify: `static-showcase/data-center.html`
- Modify: `static-showcase/assets/data-center-page.js`
- Modify: `static-showcase/methodology.html`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/methodology-entry-visibility.test.mjs`
- Modify: `tests/site-shell-provenance.test.mjs`

**Interfaces:**
- Data center has `資料來源`, `計算方法`, `更新狀態`, `資料異常紀錄`; anomaly entries contain only public-safe status, affected market and action (`沿用前版` or `暫不發布`).
- Methodology contains the four formulas, no-trade rule, source priority, conflict policy, Asia/Taipei schedules and status meanings.

- [ ] Add failing tests for all four data-center sections, safe anomaly output, fetched-time provenance, source-priority copy and all five schedule times.
- [ ] Run `node --test tests/methodology-entry-visibility.test.mjs tests/site-shell-provenance.test.mjs` and verify red.
- [ ] Implement public-safe health and anomaly projection from published manifest status; no technical error reason or internal identifier may reach HTML.
- [ ] Complete methodology and responsive styles without changing source data.
- [ ] Re-run the section tests, rendered HTML tests and privacy boundary tests; verify green.
- [ ] Commit `feat: complete public data center and methodology`.

### Task 8: Full regression, manual route QA and honest release gate

**Files:**
- Modify: `docs/market-platform-v2-completion-checklist.md`

**Interfaces:**
- No checklist row is `完成` without a test or manual QA evidence.
- Any source-approval blocker remains listed under `未完成項目`; it is never silently downgraded.

- [ ] Run fresh BelowNormal verification with `set OMP_NUM_THREADS=2`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check`.
- [ ] Inspect built static routes for home, emerging list, two company details, IPO radar, calendar, offering, CB market, three CB statuses, issuance, events, data center and methodology at desktop and mobile widths.
- [ ] Search staged public output for credentials, source IDs, private import names, missing reasons, prohibited advice vocabulary and fixture labels; write a regression test before fixing any finding.
- [ ] Update checklist with the fresh command outputs, manual QA evidence and any remaining official-source blockers.
- [ ] Request code review, resolve all confirmed issues, commit the verified checklist, and only then present merge and publish options.
