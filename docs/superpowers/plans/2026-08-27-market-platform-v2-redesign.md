# Taiwan Post-Close Market Platform V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved V2 public frontend while preserving official data, financial definitions, snapshot behaviour, and deployment flow.

**Architecture:** Keep static-showcase HTML and ES modules. Add pure public projection modules for company integration and health summaries; compose them into existing pages without touching ingestion, APIs, calculation, or snapshots.

**Tech Stack:** Static HTML, CSS custom properties, browser ES modules, Node test runner, Vinext, ESLint, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-27-market-platform-v2-redesign-design.md`

## Global Constraints

- Preserve all official sources, APIs, crawler/update/snapshot/fallback code and financial definitions.
- Never invent data; missing facts remain `—`.
- Public output excludes internal IDs, diagnostics, private imports, credentials, personal data, and investment instructions.
- Existing routes and query parameters remain valid; `company.html?code=` is additive.
- Desktop search, mobile navigation, 390/430/768/1024/1366/1920px QA, TDD, full test/build/typecheck/lint are mandatory.

---

### Task 1: V2 public route and navigation contract

**Files:**
- Create: `static-showcase/company.html`
- Modify: `static-showcase/assets/site-shell.js`, existing public page headers, `tests/static-showcase-pages.test.mjs`
- Test: `tests/static-showcase-pages.test.mjs`

**Interfaces:** `PUBLIC_PRIMARY_NAVIGATION` returns `{ key, label, href }`; `renderMobileNavigation(activePage)` returns only the five canonical public links.

- [ ] Write a failing test:

```js
assert.deepEqual(PUBLIC_PRIMARY_NAVIGATION.map(({ label }) => label), ["總覽", "興櫃", "IPO", "可轉債", "資料中心"]);
assert.match(await readFile("static-showcase/company.html", "utf8"), /公司整合頁/);
```

- [ ] Run `node --test tests/static-showcase-pages.test.mjs` and confirm absent V2 markup fails.
- [ ] Implement exact labels, the additive company shell and five-link mobile navigation.
- [ ] Re-run `node --test tests/static-showcase-pages.test.mjs` and commit `test: lock V2 public route baseline`.

### Task 2: Global V2 visual system and responsive shell

**Files:**
- Modify: `static-showcase/assets/app.css`, `static-showcase/assets/site-shell.js`, every static public page
- Test: `tests/static-showcase-pages.test.mjs`

**Interfaces:** CSS semantic tokens: `--surface`, `--accent-emerging`, `--accent-ipo`, `--accent-bonds`; page shell adds a `data-mobile-navigation` region.

- [ ] Write failing header/mobile-navigation assertions.
- [ ] Run `node --test tests/static-showcase-pages.test.mjs` and confirm missing shell support fails.
- [ ] Implement the deep blue-grey theme, module accents, sticky desktop header, search trigger/sheet and touch-safe bottom navigation.
- [ ] Re-run `node --test tests/static-showcase-pages.test.mjs && npm run build` and commit `feat: add V2 responsive application shell`.

### Task 3: Overview dashboard and emerging workspace

**Files:**
- Modify: `static-showcase/index.html`, `static-showcase/emerging.html`, `static-showcase/assets/home-page.js`, `static-showcase/assets/emerging-page.js`, `static-showcase/assets/app.css`
- Test: `tests/home-summary.test.mjs`, `tests/static-showcase-emerging-ui.test.mjs`

**Interfaces:** `buildDashboardHealth({ dataDate, dataAvailable })` returns only `{ label, detail }`; emerging adds `data-emerging-view="rankings"`, `market`, `revenue`.

- [ ] Write failing health and tab assertions:

```js
assert.deepEqual(buildDashboardHealth({ dataDate: "2026-08-26", dataAvailable: true }), { label: "資料已發布", detail: "資料日期 2026-08-26" });
assert.match(emergingHtml, /data-emerging-view="rankings"/);
```

- [ ] Run `node --test tests/home-summary.test.mjs tests/static-showcase-emerging-ui.test.mjs` and confirm the exports or tab fail.
- [ ] Add dashboard health, three market cards, focus/timeline hierarchy, ranking tab and exact-code company links without changing input DTOs.
- [ ] Re-run `node --test tests/home-summary.test.mjs tests/public-homepage.test.mjs tests/static-showcase-emerging-ui.test.mjs` and commit `feat: upgrade V2 overview and emerging workspace`.

### Task 4: Unified IPO workspace

**Files:**
- Modify: `static-showcase/ipo-radar.html`, `static-showcase/ipo.html`, `static-showcase/ipo-offering.html`, `static-showcase/assets/ipo-radar-page.js`, `static-showcase/assets/ipo-page.js`, `static-showcase/assets/app.css`
- Test: `tests/static-showcase-ipo-ui.test.mjs`, `tests/ipo-lifecycle.test.mjs`

**Interfaces:** Existing IPO records and stages remain source of truth; each company link is `./company.html?code=${encodeURIComponent(code)}`.

- [ ] Write failing markup tests for Pipeline, Timeline, seven-day events and `競拍／公開申購` context links.
- [ ] Run `node --test tests/static-showcase-ipo-ui.test.mjs` and confirm absent V2 labels fail.
- [ ] Implement workspace subnavigation and event panels reusing existing data projections; do not calculate a missing date.
- [ ] Re-run `node --test tests/static-showcase-ipo-ui.test.mjs tests/static-showcase-ipo-radar-ui.test.mjs tests/ipo-lifecycle.test.mjs` and commit `feat: unify V2 IPO workspace`.

### Task 5: CB quick observations and advanced filters

**Files:**
- Modify: `static-showcase/bonds.html`, `static-showcase/assets/bonds-page.js`, `static-showcase/assets/app.css`
- Test: `tests/static-showcase-bond-ui.test.mjs`, `tests/cb-search-workbench.test.mjs`

**Interfaces:** Existing `bond-filters` form IDs, `filterBondRecords`, `applyPublicBondScreener` and URL query state do not change; advanced controls reside in `data-bond-advanced-filters`.

- [ ] Write failing UI checks:

```js
assert.match(html, /data-bond-quick-observation/);
assert.match(html, /data-bond-advanced-filters/);
```

- [ ] Run `node --test tests/static-showcase-bond-ui.test.mjs` and confirm absent disclosure fails.
- [ ] Group current objective shortcuts as quick observations and existing detailed controls inside an accessible disclosure without changing input IDs.
- [ ] Re-run `node --test tests/static-showcase-bond-ui.test.mjs tests/cb-search-workbench.test.mjs tests/bond-derived-metrics.test.mjs` and commit `feat: organize V2 CB workspace`.

### Task 6: Grouped search and exact-code company page

**Files:**
- Create: `static-showcase/assets/company-overview.js`, `tests/static-showcase-company-overview.test.mjs`
- Modify: `static-showcase/company.html`, `static-showcase/assets/site-search.js`, `static-showcase/assets/emerging-page.js`, `static-showcase/assets/ipo-radar-page.js`, `tests/static-showcase-search.test.mjs`

**Interfaces:** `buildCompanyOverview({ code, emerging, ipo, bonds, workbench })` composes exact company-code matches only. `searchPublicRecords()` returns `{ kind, code, label, href, companyCode? }` and places company results before module-specific routes.

- [ ] Write failing exact-join and search tests:

```js
assert.equal(buildCompanyOverview({ code: "1269", emerging, ipo, bonds }).company.code, "1269");
assert.equal(buildCompanyOverview({ code: "1269", emerging: [{ companyCode: "1268", companyName: "乾杯" }] }).emerging, null);
assert.equal(searchPublicRecords("1269", indexes)[0].href, "./company.html?code=1269");
```

- [ ] Run `node --test tests/static-showcase-company-overview.test.mjs tests/static-showcase-search.test.mjs` and confirm missing modules/behaviour fail.
- [ ] Implement exact-code collection, public formatter, company page sections, result grouping and no-result state.
- [ ] Re-run `node --test tests/static-showcase-company-overview.test.mjs tests/static-showcase-search.test.mjs && npm run build` and commit `feat: add V2 company integration and grouped search`.

### Task 7: Safe data center and RWD acceptance

**Files:**
- Modify: `static-showcase/data-center.html`, `static-showcase/assets/data-center-page.js`, `static-showcase/assets/app.css`, `tests/static-showcase-data-governance.test.mjs`
- Test: `tests/static-showcase-data-governance.test.mjs`, `tests/static-showcase-pages.test.mjs`

**Interfaces:** `projectDatasetHealth(runtime, manifest)` returns only `{ label, status, dataDate, updatedAt? }`; it never receives or renders private source diagnostics.

- [ ] Write failing public projection and privacy assertions:

```js
assert.deepEqual(projectDatasetHealth(runtime, manifest)[0], { label: "興櫃盤後", status: "已發布", dataDate: "2026-08-26" });
assert.doesNotMatch(renderedHtml, /sourceId|missingReasons|approved_cb_history/i);
```

- [ ] Run `node --test tests/static-showcase-data-governance.test.mjs tests/static-showcase-pages.test.mjs` and confirm the dataset projection fails.
- [ ] Implement source/status/update cards, methodology and correction copy, shared loading/empty/error state, compact table cards, and required breakpoints.
- [ ] Re-run the focused suites, inspect every primary page at six specified widths, and commit `feat: complete V2 data center and RWD`.

### Task 8: Regression, review, and authorised deployment

**Files:**
- Modify: `docs/market-platform-v2-completion-checklist.md`
- Test: all test suites and public static output

**Interfaces:** Existing immutable data runtime and all public routes.

- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, and `git diff --check`.
- [ ] Verify exact baseline samples: emerging 1260 / 1269 / 1271, IPO 1269 / 1594 / 1780, CB 11011 / 12561 / 13166; verify dashboard summaries do not change definitions.
- [ ] Browser-smoke all legacy routes and `company.html?code=1269` on desktop and mobile; wait for static data loading before assessing state.
- [ ] Scan staged public JSON/HTML for internal metadata and forbidden technical wording; resolve every real failure.
- [ ] Update completion checklist with real evidence, conduct independent review, commit V2, push the authorised remote, package/deploy through the existing Sites configuration, and verify public URL.

## Self-Review

- Coverage: Tasks 1–2 implement IA, navigation and design system; Task 3 dashboard and emerging; Task 4 IPO; Task 5 CB; Task 6 search/company; Task 7 data center and RWD; Task 8 tests and deployment.
- No placeholders: each task names concrete files, interfaces, expected tests and implementation action.
- Interface consistency: `buildDashboardHealth`, `renderMobileNavigation`, `buildCompanyOverview`, `searchPublicRecords`, and `projectDatasetHealth` are defined before their consumers.
