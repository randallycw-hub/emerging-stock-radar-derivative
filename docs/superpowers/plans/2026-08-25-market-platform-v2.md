# Market Platform V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a verified, public-data-only Taiwan emerging-market, IPO and convertible-bond research platform without investment advice or private data leakage.

**Architecture:** Extend the existing strict source registry, normalized snapshot and static showcase instead of replacing them. Build shared provenance and QA primitives first; project only validated records into the static public routes; retain old query-string links while adding clean, static-compatible paths.

**Tech Stack:** Node.js 22 ESM, TypeScript, React/Vinext, static HTML/CSS/ES modules, Node test runner, GitHub Actions, Sites hosting.

**Spec:** `docs/superpowers/specs/2026-08-25-market-platform-v2-design.md`

## Global Constraints

- Only official, individually approved TPEx/TWSE/TDCC/MOPS/OpenAPI resources may enter production; Yahoo, brokers, CBAS, member pages and third-party sites are prohibited master data.
- Public pages are post-close only and must not expose internal source IDs, missing reasons, diagnostics, credentials, private Excel, or personal data.
- Missing data renders as `—`; a prior value is shown only when explicitly labelled with its original date.
- Finance views are objective research tools: do not use score, rating, recommended, buy, sell, arbitrage conclusion, target price, or trade instruction wording.
- All official dates use Asia/Taipei calendar semantics. Run CPU-intensive work below normal priority with at most two worker threads.
- Every task begins RED, verifies the intended failure, implements the smallest change, verifies GREEN, then runs its scoped regression tests.

---

### Task 1: Establish the V2 baseline and compatibility contracts

**Files:**
- Create: `docs/superpowers/specs/2026-08-25-market-platform-v2-design.md`
- Create: `docs/superpowers/plans/2026-08-25-market-platform-v2.md`
- Modify: `tests/phase1-boundaries.test.mjs`
- Modify: `docs/sync-schedule.md`

**Interfaces:**
- Production boundary scanner must reject prohibited source domains and advice vocabulary in public presentation files.
- Existing static links (`bonds.html?bond=<code>`) remain routable after V2.

- [x] **Step 1: Add a failing V2 boundary test** for the five top-level information architecture labels and the ban on public “快速策略／綜合健診／推薦”.
- [x] **Step 2: Run** `node --test tests/phase1-boundaries.test.mjs` and confirm RED because the existing navigation has no 資料中心 and the bond page still calls filters strategies.
- [x] **Step 3: Implement the minimal shared constants** for public vocabulary and navigation without changing data sources.
- [x] **Step 4: Run GREEN** with `node --test tests/phase1-boundaries.test.mjs tests/static-showcase-pages.test.mjs`.
- [ ] **Step 5: Commit** `chore: establish market platform v2 baseline`.

### Task 2: Add shared sourced values and public provenance projection

**Files:**
- Create: `lib/domain/sourced-value.ts`
- Create: `lib/pipeline/provenance.ts`
- Create: `tests/sourced-value.test.mjs`
- Modify: `lib/domain/types.ts`
- Modify: `lib/domain/schema.ts`
- Modify: `static-showcase/assets/site-shell.js`

**Interfaces:**
- `type SourcedValue<T> = Readonly<{ value: T | null; asOfDate: string | null; source: PublicSourceRef | null; fetchedAt: string | null; status: "ok" | "stale" | "conflict" | "missing" }>`.
- `toPublicProvenance(value) -> { label, asOfDate, sourceUrl } | null` exposes no internal source ID, error, or raw response metadata.

- [x] **Step 1: Write failing tests** that reject inconsistent dates/statuses and assert conflict/missing values never gain a public numeric value.
- [x] **Step 2: Run RED** `node --test tests/sourced-value.test.mjs`.
- [x] **Step 3: Implement frozen, schema-checked sourced values and public projection.** Keep legacy flat fields as read-only compatibility aliases.
- [x] **Step 4: Run GREEN** with domain, publication, static detail and source-registry tests.
- [ ] **Step 5: Commit** `feat: add sourced values and public provenance`.

### Task 3: Harden cross-market QA gates and publication decisions

**Files:**
- Create: `lib/pipeline/quality-gates.ts`
- Create: `tests/pipeline/quality-gates.test.mjs`
- Modify: `lib/pipeline/orchestration/public-snapshot-runner.ts`
- Modify: `lib/pipeline/orchestration/publication-gate.ts`
- Modify: `lib/ipo-events/refresh.ts`

**Interfaces:**
- `evaluateMarketCandidate({ previous, candidate, expectedDate, thresholds }) -> { eligible, reasons }`.
- Gates reject row-count collapse, date regression, duplicate identity, invalid balance bounds, no-trade price fabrication, conversion conflicts and IPO stage regression.

- [x] **Step 1: Write fixtures/tests** for each rejected condition and one valid candidate that remains eligible.
- [x] **Step 2: Run RED** `node --test tests/pipeline/quality-gates.test.mjs`.
- [x] **Step 3: Implement pure, deterministic gates** and call them before any pointer/generation promotion.
- [x] **Step 4: Run GREEN** with publication, IPO refresh and nightly-market regressions.
- [ ] **Step 5: Commit** `feat: add cross-market publication quality gates`.

### Task 4: Formalize refresh modes and Taiwan-time scheduling

**Files:**
- Create: `.github/workflows/market-data-refresh.yml`
- Create: `lib/pipeline/refresh-mode.ts`
- Create: `tests/pipeline/refresh-mode.test.mjs`
- Modify: `scripts/run-nightly-market-refresh.mjs`
- Modify: `docs/sync-schedule.md`

**Interfaces:**
- `parseRefreshMode("FAST" | "OFFICIAL" | "EVENT" | "RECONCILE" | "WEEKLY")`.
- The workflow uses cron converted from Asia/Taipei and manually dispatchable `mode`; every run checks official data date before publication.

- [ ] **Step 1: Write failing tests** for mode validation, Taiwan schedule conversion and non-trading-day safe skip.
- [ ] **Step 2: Run RED** `node --test tests/pipeline/refresh-mode.test.mjs`.
- [ ] **Step 3: Implement the mode contract and one workflow.** FAST is preliminary, OFFICIAL is the only regular official-close candidate, EVENT never invents a close, RECONCILE only records corrections, and WEEKLY confirms the weekly baseline.
- [ ] **Step 4: Run GREEN** with nightly refresh tests; validate workflow YAML with an existing lightweight parser or actionlint if already available.
- [ ] **Step 5: Commit** `feat: formalize Taiwan market refresh modes`.

### Task 5: Complete emerging-market summaries, weekly semantics and no-trade handling

**Files:**
- Create: `lib/market-data/emerging-market-history.ts`
- Create: `tests/emerging-market-history.test.mjs`
- Modify: `lib/market-data/emerging-market-view.ts`
- Modify: `lib/domain/types.ts`
- Modify: `static-showcase/assets/emerging-page.js`
- Modify: `static-showcase/emerging.html`

**Interfaces:**
- `buildEmergingWeeklyMetrics(records, asOfDate) -> { lastWeekAverage, weeklyChange, weeklyChangePercent }`.
- Zero volume produces `{ todayAverage: null, dailyChange: null, weeklyChange: null, lastTradedPrice, lastTradedDate }`.

- [ ] **Step 1: Write failing fixtures** for prior valid-day daily comparison, prior complete-week baseline, holiday and zero-trade rows.
- [ ] **Step 2: Run RED** `node --test tests/emerging-market-history.test.mjs tests/emerging-market-view.test.mjs`.
- [ ] **Step 3: Implement official-average-only calculations** and market summary fields; never map an average to `closePrice`.
- [ ] **Step 4: Run GREEN** with static emerging UI tests.
- [ ] **Step 5: Commit** `feat: complete emerging market post-close metrics`.

### Task 6: Add emerging-company detail routes and IPO linkage

**Files:**
- Create: `static-showcase/market.html`
- Create: `static-showcase/assets/emerging-detail-page.js`
- Modify: `static-showcase/assets/emerging-page.js`
- Modify: `scripts/stage-static-showcase.mjs`
- Modify: `tests/static-showcase-emerging-ui.test.mjs`

**Interfaces:**
- `market.html?code=<four-digit-code>` is the static-compatible individual-company route; old market-table URL stays valid.
- Detail projection includes only verified company profile, prices, dates, IPO stage and 5/20/60-day official-history windows.

- [ ] **Step 1: Write a failing UI test** for canonical code parsing, escaped company names, no-trade display and IPO event sequence.
- [ ] **Step 2: Run RED** `node --test tests/static-showcase-emerging-ui.test.mjs`.
- [ ] **Step 3: Implement the page and static route compatibility layer**; absent approved fields render `—`.
- [ ] **Step 4: Run GREEN** with staging and rendered HTML tests.
- [ ] **Step 5: Commit** `feat: add emerging company detail pages`.

### Task 7: Normalize IPO lifecycle, radar, calendar and offering records

**Files:**
- Create: `lib/ipo-events/lifecycle.ts`
- Create: `tests/ipo-lifecycle.test.mjs`
- Create: `static-showcase/ipo-offering.html`
- Create: `static-showcase/assets/ipo-offering-page.js`
- Modify: `lib/ipo-events/snapshot.ts`
- Modify: `static-showcase/assets/ipo-radar-page.js`
- Modify: `static-showcase/assets/ipo-page.js`

**Interfaces:**
- `normalizeIpoLifecycle(events, asOfDate) -> { currentStage, daysInStage, events, active }`.
- `projectOffering(events) -> { bidStartDate, bidEndDate, auctionOpenDate, subscriptionStartDate, subscriptionEndDate, drawDate, listingDate, underwriter }`.

- [ ] **Step 1: Write failing tests** for stage order, terminated filtering, ROC-to-ISO date normalization, seven/30/90-day events and same-event dedupe.
- [ ] **Step 2: Run RED** `node --test tests/ipo-lifecycle.test.mjs tests/ipo-stage-filter.test.mjs`.
- [ ] **Step 3: Implement one normalized event projection** shared by radar, calendar and offering pages; do not derive success probabilities or prices outside published official fields.
- [ ] **Step 4: Run GREEN** with IPO UI, event API and static fallback tests.
- [ ] **Step 5: Commit** `feat: unify IPO radar calendar and offering data`.

### Task 8: Introduce the CB lifecycle status engine

**Files:**
- Create: `lib/market-data/bond-status.ts`
- Create: `tests/bond-status.test.mjs`
- Modify: `lib/market-data/types.ts`
- Modify: `lib/market-data/bond-market-view.ts`
- Modify: `static-showcase/assets/bond-list-page.js`

**Interfaces:**
- `resolveBondStatus(input, evaluationDate) -> "ACTIVE" | "NO_TRADE" | "CONVERSION_SUSPENDED" | "TRADING_SUSPENDED" | "REDEMPTION_PROCESS" | "MATURED" | "DELISTED" | "DATA_CONFLICT" | "STALE"`.

- [ ] **Step 1: Write failing precedence tests** for maturity, delisting, redemption, suspension, zero trade, stale and conflict cases.
- [ ] **Step 2: Run RED** `node --test tests/bond-status.test.mjs`.
- [ ] **Step 3: Implement explicit priority and public labels.** Matured/delisted records are historical and cannot emit active trade conditions.
- [ ] **Step 4: Run GREEN** with current bond market and UI tests.
- [ ] **Step 5: Commit** `feat: add convertible bond lifecycle status engine`.

### Task 9: Version conversion prices and valuation by effective date

**Files:**
- Create: `lib/market-data/conversion-price-history.ts`
- Create: `tests/conversion-price-history.test.mjs`
- Modify: `lib/market-data/types.ts`
- Modify: `lib/market-data/bond-derived-metrics.ts`
- Modify: `scripts/build-bond-market-snapshot.mjs`
- Modify: `static-showcase/assets/bond-detail-page.js`

**Interfaces:**
- `selectEffectiveConversionPrice(versions, evaluationDate) -> ConversionPriceVersion | null`.
- `ConversionPriceVersion` contains `price`, `effectiveDate`, `source`, `fetchedAt`, `status`, optional `announcedAt` and an immutable source reference.

- [ ] **Step 1: Write failing tests** for historical selection, future announcement not applied early, duplicate conflict and conversion-value recalculation.
- [ ] **Step 2: Run RED** `node --test tests/conversion-price-history.test.mjs tests/bond-derived-metrics.test.mjs`.
- [ ] **Step 3: Implement append-only versions and effective-date selection.** Preserve legacy current-price fields as a projection.
- [ ] **Step 4: Run GREEN** with history, bond detail and staging tests.
- [ ] **Step 5: Commit** `feat: version convertible bond conversion prices`.

### Task 10: Project CB market, filters, issuance and event surfaces

**Files:**
- Create: `static-showcase/bonds-filter.html`
- Create: `static-showcase/bonds-issuance.html`
- Create: `static-showcase/bonds-events.html`
- Create: `static-showcase/assets/bond-filter-page.js`
- Create: `static-showcase/assets/bond-issuance-page.js`
- Create: `static-showcase/assets/bond-events-page.js`
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/assets/bonds-page.js`
- Modify: `static-showcase/assets/public-event-digest.js`

**Interfaces:**
- Filters are deterministic ranges: recent issue, maturity window, close price, premium, conversion value, remaining ratio and event window.
- `dedupeBondEvents(events) -> BondWorkbenchEvent[]` uses canonical bond/date/type/official-reference identity.

- [ ] **Step 1: Write failing UI and domain tests** for objective labels, 30-day event filter, event dedupe and no duplicated source presentation.
- [ ] **Step 2: Run RED** selected `bond-*`, `static-showcase-bond-*` and event-digest tests.
- [ ] **Step 3: Implement the four surfaces with shared record projection** and retain `bonds.html?bond=` deep-link compatibility.
- [ ] **Step 4: Run GREEN** with full CB static-page suite.
- [ ] **Step 5: Commit** `feat: add convertible bond issuance events and categories`.

### Task 11: Complete CB detail panels with dates, events and factual company context

**Files:**
- Modify: `static-showcase/assets/bond-detail-page.js`
- Modify: `static-showcase/assets/bond-candlestick-chart.js`
- Modify: `static-showcase/assets/bonds-page.js`
- Modify: `tests/static-showcase-bond-detail.test.mjs`

**Interfaces:**
- Detail explicitly separates CB quote date, stock quote date, conversion effective date, outstanding date, institution date and financial period.
- All five core values and history/event panels use current status plus sourced values.

- [ ] **Step 1: Write failing UI tests** for `今日無成交`, previous trade date, future conversion price, factual events and absence of investment language.
- [ ] **Step 2: Run RED** `node --test tests/static-showcase-bond-detail.test.mjs`.
- [ ] **Step 3: Implement concise sourced detail sections** for terms, market, balance, institution data, revenue and events. Unapproved fundamentals/TDCC data remain omitted rather than simulated.
- [ ] **Step 4: Run GREEN** with public output/privacy regression tests.
- [ ] **Step 5: Commit** `feat: complete sourced convertible bond detail`.

### Task 12: Build the homepage dashboard, unified navigation and data center

**Files:**
- Create: `static-showcase/data-center.html`
- Create: `static-showcase/assets/data-center-page.js`
- Modify: `static-showcase/index.html`
- Modify: `static-showcase/assets/home-page.js`
- Modify: `static-showcase/assets/site-shell.js`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/static-showcase-pages.test.mjs`

**Interfaces:**
- `buildHomeSummary({ emerging, ipo, bonds }) -> { emerging, ipo, bonds, events }`.
- Primary navigation is exactly `首頁｜興櫃市場｜IPO｜可轉債｜資料中心` with contextual subnavigation.

- [ ] **Step 1: Write failing tests** for the three objective summaries, cross-market event filter and absence of recommendation vocabulary.
- [ ] **Step 2: Run RED** `node --test tests/static-showcase-pages.test.mjs tests/public-homepage.test.mjs`.
- [ ] **Step 3: Implement the dashboard and data center.** The data center exposes source labels, methodology, update status and public anomaly notice without internal diagnostics.
- [ ] **Step 4: Run GREEN** with page, event digest and accessibility tests.
- [ ] **Step 5: Commit** `feat: add cross-market dashboard and data center`.

### Task 13: Add unified search, methodology and responsive table behavior

**Files:**
- Create: `static-showcase/assets/site-search.js`
- Create: `tests/static-showcase-search.test.mjs`
- Modify: `static-showcase/assets/site-shell.js`
- Modify: `static-showcase/methodology.html`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/methodology-entry-visibility.test.mjs`

**Interfaces:**
- `searchPublicRecords(query, indexes) -> SearchResult[]` returns exact code matches first and accepts only published issuer/bond/IPO identities.
- Methodology states formulas, no-trade behavior, source priority, status meanings and Asia/Taipei refresh schedule.

- [ ] **Step 1: Write failing tests** for exact identifiers, escaped name matching, empty queries and no private/fixture content.
- [ ] **Step 2: Run RED** `node --test tests/static-showcase-search.test.mjs`.
- [ ] **Step 3: Implement shared static indexes, accessible combobox behavior and concise methodology source disclosure.**
- [ ] **Step 4: Run GREEN** with rendered HTML and source-boundary tests.
- [ ] **Step 5: Commit** `feat: add unified public search and methodology`.

### Task 14: Production QA, review, integration and publication

**Files:**
- Create: `docs/market-platform-v2-completion-checklist.md`
- Modify: relevant tests and documentation only as required by preceding tasks

- [ ] **Step 1: Write a completion checklist** mapping every V2 requirement to implementation, test, current source status or a documented source-approval blocker.
- [ ] **Step 2: Run fresh verification** at BelowNormal priority: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`.
- [ ] **Step 3: Perform static route QA** for home, market, two company details, IPO radar/calendar/offering, CB market, three CB statuses, CB issuance/events, data center and methodology in desktop and mobile breakpoints.
- [ ] **Step 4: Inspect public output** for private-source strings, credentials, prohibited advice language and fixture data; fix any failure through a new regression test first.
- [ ] **Step 5: Request code review, commit the completion checklist and report source limitations.**
- [ ] **Step 6: Only after explicit user approval, merge the verified branch and publish through the existing Sites workflow.**
