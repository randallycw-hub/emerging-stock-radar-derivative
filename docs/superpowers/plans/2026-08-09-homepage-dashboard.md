# 首頁市場總覽控制台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將公開展示首頁改成可轉債、興櫃與 IPO 的盤後市場總覽控制台，讓資料狀態與重點數據在首頁一眼可讀。

**Architecture:** 保留既有 `site-shell.js` 的共用導覽與深淺色切換，將首頁 HTML 改成摘要帶、雙市場重點面板、IPO 近期事件與精簡入口。`home-page.js` 只讀取 `current.json` 指向的 runtime、manifest 與正式快照，先在瀏覽器端建立可顯示的摘要模型，再以安全的 DOM API 渲染，任何缺資料的欄位顯示 `—` 或明確錯誤狀態。

**Tech Stack:** 靜態 HTML、CSS custom properties、ES modules、Node.js built-in test runner；不新增第三方套件，不直接呼叫第三方市場 API。

## Global Constraints

- 首頁只讀取已發布的 runtime、manifest 與市場快照，不直接抓取第三方服務。
- 所有摘要數字必須來自正式快照；缺資料顯示 `—`，不得寫入測試數字。
- 深色與淺色主題必須維持現有高對比色彩、鍵盤焦點與手機版可讀性。
- 保留既有五頁主要導覽、四個正式首頁連結與最後成功更新狀態。
- 不在首頁加入投資評分、買賣建議或推測性結論。

---

### Task 1: 建立首頁控制台的失敗測試與語意骨架

**Files:**
- Modify: `tests/static-showcase-pages.test.mjs`
- Modify: `tests/static-showcase.test.mjs`
- Modify: `tests/methodology-entry-visibility.test.mjs`
- Modify: `static-showcase/index.html`

**Interfaces:**
- Produces stable selectors for later tasks: `[data-home-dashboard]`, `#home-summary`, `[data-home-summary="bonds|emerging|ipo"]`, `#home-market-panels`, `#home-ipo-events`, `#home-entry-nav`, and `#home-data-status`.
- Keeps `#last-successful-update`, `nav#primary-navigation`, and links to `bonds.html`, `emerging.html`, `ipo-radar.html`, and `ipo.html` unchanged.

- [ ] **Step 1: Write the failing contract assertions**

  Add assertions that `index.html` contains `data-home-dashboard="overview"`, a summary strip with three market summary markers, separate bond/emerging panels, an IPO event region, and a compact entry navigation. Assert that the old three `.market-module` cards are absent while the four destination links and update target remain.

- [ ] **Step 2: Run the focused tests to verify the contract fails**

  Run: `npm.cmd test -- tests/static-showcase-pages.test.mjs tests/static-showcase.test.mjs tests/methodology-entry-visibility.test.mjs`

  Expected: FAIL because the current home still uses `.market-module` cards and lacks the new data attributes.

- [ ] **Step 3: Replace the homepage body content with the semantic dashboard shell**

  Keep the shared header/footer and `#last-successful-update`. Replace `.home-modules` and the standalone IPO schedule link with:

  ```html
  <div class="home-dashboard" data-home-dashboard="overview">
    <section class="home-dashboard__status" aria-labelledby="home-data-status-heading">
      <div><p class="kicker">MARKET OVERVIEW</p><h2 id="home-data-status-heading">盤後市場總覽</h2></div>
      <p id="home-data-status" class="update-status" aria-live="polite">資料狀態讀取中</p>
    </section>
    <section id="home-summary" class="home-summary" aria-label="市場資料摘要">
      <article data-home-summary="bonds"><span>可轉債</span><strong data-home-value="count">—</strong><small data-home-note>資料讀取中</small></article>
      <article data-home-summary="emerging"><span>興櫃公司</span><strong data-home-value="count">—</strong><small data-home-note>資料讀取中</small></article>
      <article data-home-summary="ipo"><span>IPO 事件</span><strong data-home-value="count">—</strong><small data-home-note>資料讀取中</small></article>
    </section>
    <div id="home-market-panels" class="home-market-panels">
      <section class="home-market-panel" data-home-panel="bonds" aria-labelledby="home-bonds-heading">
        <p class="kicker">CONVERTIBLE BONDS</p><h2 id="home-bonds-heading">可轉債盤後</h2>
        <dl><div><dt>低於面額</dt><dd data-home-bond="below-par">—</dd></div><div><dt>低溢價率</dt><dd data-home-bond="low-premium">—</dd></div><div><dt>最近到期</dt><dd data-home-bond="maturity">—</dd></div></dl>
        <a href="./bonds.html" aria-label="查看完整可轉債盤後資料">查看完整資料 <span aria-hidden="true">→</span></a>
      </section>
      <section class="home-market-panel" data-home-panel="emerging" aria-labelledby="home-emerging-heading">
        <p class="kicker">EMERGING MARKET</p><h2 id="home-emerging-heading">興櫃市場</h2>
        <dl><div><dt>上漲</dt><dd data-home-emerging="up">—</dd></div><div><dt>下跌</dt><dd data-home-emerging="down">—</dd></div><div><dt>資料日期</dt><dd data-home-emerging="date">—</dd></div></dl>
        <a href="./emerging.html" aria-label="查看完整興櫃市場資料">查看完整資料 <span aria-hidden="true">→</span></a>
      </section>
    </div>
    <section id="home-ipo-events" class="home-ipo-events" aria-labelledby="home-ipo-heading">
      <p class="kicker">IPO EVENT DESK</p><h2 id="home-ipo-heading">近期 IPO 事件</h2><ol data-home-ipo-list><li class="home-empty">資料讀取中</li></ol>
      <a href="./ipo-radar.html" aria-label="查看 IPO 進度雷達">查看 IPO 雷達 <span aria-hidden="true">→</span></a>
    </section>
    <nav id="home-entry-nav" class="home-entry-nav" aria-label="市場工作區入口">
      <a href="./bonds.html" aria-label="進入可轉債工作區">可轉債</a><a href="./emerging.html" aria-label="進入興櫃市場工作區">興櫃市場</a><a href="./ipo-radar.html" aria-label="進入 IPO 雷達工作區">IPO 雷達</a><a href="./ipo.html" aria-label="進入 IPO 時程工作區">IPO 時程</a>
    </nav>
  </div>
  ```

  Use actual Chinese labels rather than ellipses in the implementation: `盤後可轉債`, `興櫃市場`, `IPO 雷達`, `IPO 時程`; include `aria-label` on each action link.

- [ ] **Step 4: Run the focused tests to verify the skeleton passes**

  Run the same command as Step 2. Expected: PASS for the updated homepage contract and no legacy card assertion.

- [ ] **Step 5: Commit the semantic homepage shell**

  ```bash
  git add tests/static-showcase-pages.test.mjs tests/static-showcase.test.mjs tests/methodology-entry-visibility.test.mjs static-showcase/index.html
  git commit -m "feat: add homepage market dashboard shell"
  ```

### Task 2: 接上正式快照並渲染首頁摘要

**Files:**
- Modify: `tests/static-showcase-pages.test.mjs`
- Modify: `static-showcase/assets/home-page.js`

**Interfaces:**
- Consumes: `current.json` → `runtime.json` → `manifest.json`, `runtime.datasets["11406"]`, `runtime.emergingMarketUrl`, and `runtime.ipoEventsUrl`.
- Produces: `loadHomeSnapshot()` and `buildHomeModel({ manifest, bonds, emerging, ipo })` internal functions; DOM output under the selectors from Task 1.

- [ ] **Step 1: Write data-model tests for real and unavailable snapshots**

  Add module tests that import `home-page.js` helpers (export them without changing browser bootstrap behavior) and assert:

  ```js
  const model = buildHomeModel({
    manifest: { market: { dataDate: "2026-08-07" } },
    bonds: [{ bondCode: "11011", cbClose: "101.5", premiumRate: "42.02", maturityDate: "2029-12-10" }],
    emerging: { tradingDate: "2026-08-07", records: [{ direction: "up", lastTradedPrice: "25.7" }, { direction: "down", lastTradedPrice: "20" }] },
    ipo: { dataDate: "2026-08-07", records: [{ stage: "A", events: [{ date: "2026-08-08", label: "送件日期" }] }] },
  });
  assert.equal(model.bonds.count, 1);
  assert.equal(model.emerging.upCount, 1);
  assert.equal(model.ipo.eventCount, 1);
  assert.equal(buildHomeModel({}).bonds.count, null);
  ```

  The model must count only finite numeric prices for price-based highlights and must never synthesize zero for missing input.

- [ ] **Step 2: Run the new model tests to verify they fail**

  Run: `npm.cmd test -- tests/static-showcase-pages.test.mjs`

  Expected: FAIL because no exported model helpers exist and the current script has only update-date logic.

- [ ] **Step 3: Implement safe loading and deterministic model derivation**

  Keep the existing `safeJsonFetch` path and add:

  ```js
  export function buildHomeModel({ manifest = null, bonds = null, emerging = null, ipo = null } = {}) {
    const bondRows = asRecords(bonds);
    const emergingRows = asRecords(emerging);
    const ipoRows = asRecords(ipo);
    return { /* deterministic counts and date fields derived only from these records */ };
  }
  ```

  Normalize arrays from either a raw array or `{ records }`. Derive:

  - `bonds.count`, `bonds.belowParCount` (`cbClose < 100`), `bonds.lowPremiumCount` (`premiumRate <= 10`), and the nearest non-null maturity row.
  - `emerging.count`, `emerging.upCount`, `emerging.downCount`, `emerging.latestDate`, and up to three latest rows with `companyCode`, `companyName`, `lastTradedPrice`, and `direction`.
  - `ipo.count`, `ipo.dataDate`, and up to five events created from each record’s non-null `events`, sorted by date ascending and then code. Only valid `YYYY-MM-DD` dates are accepted.
  - `dataDate` from `manifest.market.dataDate`, then emerging trading date, then IPO data date; preserve `null` if none exists.

  Load the three datasets in parallel after resolving pointer/runtime. Render status text from the derived date. On any failed dataset, render only that panel’s error state and keep other panels usable.

- [ ] **Step 4: Render text safely through DOM properties**

  Add `renderHome(model)` with `textContent`, `hidden`, and `aria-label` updates. Use `formatNumber` and `formatDate`; use `—` for null values. Generate event rows with `document.createElement`, not `innerHTML`, and include links to `ipo-radar.html?stage=A` (or the record’s actual stage) or `ipo.html`.

- [ ] **Step 5: Run focused and full tests**

  Run: `npm.cmd test -- tests/static-showcase-pages.test.mjs tests/static-showcase.test.mjs` and then `npm.cmd test`.

  Expected: all focused assertions and the complete suite pass.

- [ ] **Step 6: Commit the data model and renderer**

  ```bash
  git add tests/static-showcase-pages.test.mjs static-showcase/assets/home-page.js
  git commit -m "feat: render homepage market snapshot summaries"
  ```

### Task 3: 完成首頁視覺系統與響應式版面

**Files:**
- Modify: `tests/static-showcase-pages.test.mjs`
- Modify: `static-showcase/assets/app.css`

**Interfaces:**
- Consumes: Task 1 selectors and Task 2 classes/data attributes.
- Produces: `.home-dashboard`, `.home-summary`, `.home-market-panels`, `.home-market-panel`, `.home-ipo-events`, and `.home-entry-nav` styles that share existing theme tokens.

- [ ] **Step 1: Add CSS contract assertions**

  Assert the stylesheet defines the new selectors, uses `var(--clay)`/`var(--violet)` rather than green, includes dark theme overrides, and has a `max-width: 900px` layout that changes the two-column panels to one column without requiring horizontal scrolling.

- [ ] **Step 2: Run the CSS contract to verify it fails**

  Run: `npm.cmd test -- tests/static-showcase-pages.test.mjs`

  Expected: FAIL because the new home selectors are not styled.

- [ ] **Step 3: Add the dashboard layout and visual hierarchy**

  Append a focused CSS block: desktop uses a narrow status rail and two-column market panels; summary values use tabular numerals; panels use warm gray/ink surfaces with clay and lilac accents; entry navigation is a compact four-link row. Ensure `a:focus-visible`, status chips, muted copy, and empty/error states use existing tokens with contrast.

- [ ] **Step 4: Add the mobile breakpoint**

  Under `@media (max-width: 900px)`, stack summary articles, market panels, IPO events, and entry links; keep action targets at least 44px tall; hide no essential data and remove any fixed minimum width from homepage components.

- [ ] **Step 5: Run tests and static lint**

  Run: `npm.cmd test` and `npm run lint`.

  Expected: 0 test failures; lint may retain only the repository’s two pre-existing warnings in `scripts/static-ipo-fallback.mjs`.

- [ ] **Step 6: Commit the visual system**

  ```bash
  git add tests/static-showcase-pages.test.mjs static-showcase/assets/app.css
  git commit -m "style: redesign homepage market dashboard"
  ```

### Task 4: 瀏覽器驗證與公開展示回歸

**Files:**
- Modify: `tests/static-showcase.test.mjs` only if a final regression assertion is needed.
- Inspect: `static-showcase/index.html`, `static-showcase/assets/home-page.js`, `static-showcase/assets/app.css`.

**Interfaces:**
- Consumes: completed homepage dashboard and published snapshot paths.
- Produces: verified desktop/mobile screenshots and a deployable static showcase; no new API or data format.

- [ ] **Step 1: Run all quality gates**

  Run: `npm.cmd test`, `npm run lint`, `npm run typecheck`, and `git diff --check`.

  Expected: all commands exit 0; no new warnings or hard-coded market counts.

- [ ] **Step 2: Serve the static showcase locally**

  Run: `python -m http.server 54519 --directory static-showcase` with the lowest practical process priority and no more than one worker.

- [ ] **Step 3: Verify the homepage visually at desktop and mobile widths**

  Check `/index.html` at a wide viewport and a narrow viewport. Confirm: update status is visible, summaries do not show test values, bond/emerging panels show real snapshot counts or `—`, IPO events render when present, every entry link works, theme toggle remains readable, and no horizontal page overflow occurs.

- [ ] **Step 4: Stop the local server and report evidence**

  Stop only the server process created in Step 2; record test results and the local preview URL. Do not publish until the user explicitly asks for deployment.

- [ ] **Step 5: Commit any final regression test only**

  If Step 1 reveals a missing contract, add the smallest assertion and commit it with:

  ```bash
  git add tests/static-showcase.test.mjs
  git commit -m "test: cover homepage dashboard regression"
  ```
