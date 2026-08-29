# V5.3 CB 工作台完整化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以經驗證公開快照，完成市場總覽、全部 CB、發行進度、事件行事曆與市場統計五功能工作台。

**Architecture:** 以既有 `bond-workbench.json`、`bond-market-history.json`、`cb-master.json` 和公司主檔，建立一份受驗證的 V5.3 read model；所有 CB 頁面共用此投影與全站 canonical search index。前端由純函式產生客觀統計、事件、發行生命週期與 RWD 呈現，不另建會漂移的資料真相。

**Tech Stack:** 靜態 HTML、原生 ES modules、Node.js test runner、現有 static-showcase staging。

**Spec:** `C:\Users\USER\Desktop\台灣盤後市場資訊台_V5.3_CB工作台完整化_Codex完整執行規格.pdf`; `docs/superpowers/specs/2026-08-29-v53-cb-workbench-design.md`

## Global Constraints

- 只使用 TPEx、TWSE、MOPS、TDCC 官方事實與可重算衍生值；CBAS、CyclesInvest 只作 UI 參考。
- 不公開 TCRI、ASO、技術分析、投資評分、買賣建議、內部來源 ID、缺漏原因或快照診斷。
- 唯一 JOIN key 為 `cb_code` 與 `stock_code`；null、undefined、抓取失敗不可轉為零。
- `conversion_value` 與 `premium_rate` 只有同一資料日才可計算；未知日期顯示 `待公告`，不能估算。
- CPU 密集型測試固定 `node --test --test-concurrency=2`。

---

## File Structure

- Create `static-showcase/assets/cb-workbench-v53.js`: read model、日期驗證、統計、事件、issuance 正規化。
- Create `static-showcase/assets/cb-workbench-ui.js`: 共用格式、官方 URL allowlist、逃逸、熱力圖投影。
- Modify `scripts/stage-static-showcase.mjs`: 建立並驗證 `cb-workbench-v53.json` 與 runtime URL。
- Modify `static-showcase/bonds.html`, `bonds-filter.html`, `bonds-issuance.html`, `bonds-events.html`; create `bonds-stats.html`: 五功能入口。
- Modify CB page modules、`bond-detail-page.js`、`company-overview.js` 和 `app.css`。
- Create V5.3 read-model/page tests; extend staging、company 與 V5.2 regression tests。

### Task 1: 建立 V5.3 前台資料 read model

**Files:**
- Create: `static-showcase/assets/cb-workbench-v53.js`
- Test: `tests/static-showcase-v53-cb-workbench.test.mjs`

**Interfaces:**
- Consumes: workbench snapshot、歷史 quote array、canonical CB/company master。
- Produces: `buildCbWorkbenchV53({ workbench, history, cbMaster, companyMaster })`，回傳 `{ schemaVersion, dataDate, sourceRegistry, records, events, issuance, summary }`。

- [ ] **Step 1: Write the failing test**

```js
test('V5.3 read model excludes cross-date valuation and preserves official event URL', () => {
  const model = buildCbWorkbenchV53({ workbench: fixture, history: [], cbMaster, companyMaster });
  assert.equal(model.records[0].quote.conversionValue, null);
  assert.equal(model.records[0].quote.premiumRate, null);
  assert.equal(model.events[0].sourceUrl, 'https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --test-concurrency=2 tests/static-showcase-v53-cb-workbench.test.mjs`

Expected: FAIL because the module and export do not exist.

- [ ] **Step 3: Write minimal implementation**

```js
export function buildCbWorkbenchV53({ workbench, history, cbMaster, companyMaster }) {
  const records = workbench.records.map((record) => projectCbRecord(record, { history, cbMaster, companyMaster }));
  return Object.freeze({ schemaVersion: 1, dataDate: workbench.dataDate, sourceRegistry: buildSourceRegistry(records), records, events: projectEvents(records), issuance: projectIssuance(records), summary: projectSummary(records) });
}
```

Use strict ISO dates, exact CB/stock lookup, same-date valuation only, and allowlisted official HTTPS URLs.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test --test-concurrency=2 tests/static-showcase-v53-cb-workbench.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add static-showcase/assets/cb-workbench-v53.js tests/static-showcase-v53-cb-workbench.test.mjs
git commit -m "feat: add V5.3 CB workbench read model"
```

### Task 2: 發布時建立與驗證唯一 read model

**Files:**
- Modify: `scripts/stage-static-showcase.mjs`
- Modify: `tests/stage-static-showcase.test.mjs`

**Interfaces:**
- Consumes: `buildCbWorkbenchV53` and active generation input files。
- Produces: `data/<generation>/cb-workbench-v53.json`; runtime `cbWorkbenchV53Url`。

- [ ] **Step 1: Write the failing test**

```js
assert.equal(runtime.cbWorkbenchV53Url, `./data/${generation}/cb-workbench-v53.json`);
assert.equal(stagedModel.schemaVersion, 1);
assert.equal(stagedModel.records.filter((row) => row.status === 'active').length, new Set(activeCodes).size);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --test-concurrency=2 tests/stage-static-showcase.test.mjs`

Expected: FAIL because V5.3 staged data and runtime pointer are absent.

- [ ] **Step 3: Write minimal implementation**

```js
const cbWorkbenchV53 = buildCbWorkbenchV53({ workbench, history, cbMaster: masters.cbMaster, companyMaster: masters.companyMaster });
validateCbWorkbenchV53(cbWorkbenchV53);
await writeFile(join(base, 'cb-workbench-v53.json'), `${JSON.stringify(cbWorkbenchV53, null, 2)}\n`, 'utf8');
runtime.cbWorkbenchV53Url = `./data/${generation}/cb-workbench-v53.json`;
```

Validate record count, active-code uniqueness, issue/maturity order, event date order, same-date valuation and source URLs before writing runtime.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test --test-concurrency=2 tests/stage-static-showcase.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/stage-static-showcase.mjs tests/stage-static-showcase.test.mjs
git commit -m "feat: stage verified V5.3 CB workbench data"
```

### Task 3: 完成市場總覽、成交排行與熱力圖

**Files:**
- Create: `static-showcase/assets/cb-workbench-ui.js`
- Modify: `static-showcase/bonds.html`, `static-showcase/assets/bonds-page.js`, `static-showcase/assets/app.css`
- Test: `tests/static-showcase-v53-cb-pages.test.mjs`

**Interfaces:**
- Consumes: staged V5.3 model。
- Produces: `rankCbRecords(records, metric)`, `renderHeatmapOrRankedFallback(root, records, { compact })`。

- [ ] **Step 1: Write the failing test**

```js
for (const label of ['市場總覽', '日成交量', '5 日均量', '20 日均量', '近期事件', '近期發行', '熱力圖']) assert.match(bondsHtml, new RegExp(label));
assert.doesNotMatch(bondsHtml, /資料健康度|買點|推薦/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --test-concurrency=2 tests/static-showcase-v53-cb-pages.test.mjs`

Expected: FAIL because the market overview containers do not exist.

- [ ] **Step 3: Write minimal implementation**

```js
renderMarketSummary(root, model.summary);
renderTurnoverRanking(root, rankCbRecords(model.records, state.metric).slice(0, 10));
renderHeatmapOrRankedFallback(root, model.records, { compact: matchMedia('(max-width: 720px)').matches });
```

Display weekly aggregation period; use `—` for unavailable and `今日無成交` only for verified zero volume. Escape text and use canonical detail routes.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test --test-concurrency=2 tests/static-showcase-v53-cb-pages.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add static-showcase/assets/cb-workbench-ui.js static-showcase/bonds.html static-showcase/assets/bonds-page.js static-showcase/assets/app.css tests/static-showcase-v53-cb-pages.test.mjs
git commit -m "feat: add V5.3 CB market overview"
```

### Task 4: 全部 CB 的 View Tabs、全站搜尋與客觀篩選

**Files:**
- Modify: `static-showcase/bonds-filter.html`, `static-showcase/assets/bond-filter-page.js`, `static-showcase/assets/cb-workbench-ui.js`
- Modify: `tests/static-showcase-v53-cb-pages.test.mjs`

**Interfaces:**
- Consumes: canonical global search index and V5.3 `records`.
- Produces: `filterCbRecords(records, filters)` and `renderCbTableView(records, view)` for `quote`, `terms`, `events`, `liquidity`.

- [ ] **Step 1: Write the failing test**

```js
for (const label of ['行情', '條款', '事件', '流動性']) assert.match(filterHtml, new RegExp(label));
assert.match(filterHtml, /新發行|低溢價|接近轉換價值|90 日內權利事件|365 日內到期|近期賣回|近期強贖|停止轉換中/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --test-concurrency=2 tests/static-showcase-v53-cb-pages.test.mjs`

Expected: FAIL because all required views and filters are absent.

- [ ] **Step 3: Write minimal implementation**

```js
const rows = filterCbRecords(model.records, { query, quickFilter, secured, maturityBefore });
renderCbTableView(target, rows, activeView);
syncUrl({ query, quickFilter, view: activeView });
```

Reuse full-width input normalization from the global index; a stock code returns all active CBs for its issuer; the single clear control removes search and every filter.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test --test-concurrency=2 tests/static-showcase-v53-cb-pages.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add static-showcase/bonds-filter.html static-showcase/assets/bond-filter-page.js static-showcase/assets/cb-workbench-ui.js tests/static-showcase-v53-cb-pages.test.mjs
git commit -m "feat: group all CB data into V5.3 views"
```

### Task 5: 發行生命週期與事件行事曆

**Files:**
- Modify: `static-showcase/bonds-issuance.html`, `static-showcase/assets/bond-issuance-page.js`
- Modify: `static-showcase/bonds-events.html`, `static-showcase/assets/bond-events-page.js`
- Modify: `tests/static-showcase-v53-cb-pages.test.mjs`

**Interfaces:**
- Consumes: V5.3 `issuance` and `events`.
- Produces: `renderIssuancePipeline(case)`, `filterCbEvents(events, filters)`, `renderEventCalendar(events, month)`.

- [ ] **Step 1: Write the failing test**

```js
assert.match(issuanceHtml, /公告.*送件.*生效.*詢圈.*定價.*掛牌/s);
assert.match(eventsHtml, /今天|7 日|30 日|月曆/);
assert.match(eventsHtml, /停轉|強贖|賣回|到期|Reset|掛牌/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --test-concurrency=2 tests/static-showcase-v53-cb-pages.test.mjs`

Expected: FAIL because the current pages lack required event modes and pipeline stages.

- [ ] **Step 3: Write minimal implementation**

```js
const nodes = PIPELINE_STAGES.map((stage) => ({ stage, date: issuance[stage] ?? null, state: issuance[stage] ? 'confirmed' : 'pending' }));
renderIssuancePipeline(target, nodes);
renderEventCalendar(calendarTarget, filterCbEvents(model.events, controls));
```

Only confirmed nodes are lit; unknown dates show `待公告`. Cards list code, name, type, date and a link only for an allowlisted official URL. List remains the compact default.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test --test-concurrency=2 tests/static-showcase-v53-cb-pages.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add static-showcase/bonds-issuance.html static-showcase/assets/bond-issuance-page.js static-showcase/bonds-events.html static-showcase/assets/bond-events-page.js tests/static-showcase-v53-cb-pages.test.mjs
git commit -m "feat: add verified CB issuance and event calendar"
```

### Task 6: 市場統計、單檔 CB 與公司 cross-link

**Files:**
- Create: `static-showcase/bonds-stats.html`, `static-showcase/assets/bond-stats-page.js`
- Modify: `static-showcase/assets/bond-detail-page.js`, `static-showcase/assets/company-overview.js`
- Modify: `tests/static-showcase-company-overview.test.mjs`, `tests/static-showcase-v53-cb-pages.test.mjs`

**Interfaces:**
- Consumes: V5.3 summary, records, events, issuance and company master.
- Produces: four statistic period cards, factual five-tab CB detail, company related-CB section.

- [ ] **Step 1: Write the failing test**

```js
assert.match(statsHtml, /今日|本週|20 交易日|90 日事件窗/);
assert.match(detailPage, /CB 概覽.*行情.*權利事件.*發行條款.*標的公司/s);
assert.match(companyPage, /目前沒有有效可轉債|相關可轉債/);
assert.doesNotMatch(detailPage, /MA|MACD|RSI|KD|BOLL|買進|賣出/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --test-concurrency=2 tests/static-showcase-v53-cb-pages.test.mjs tests/static-showcase-company-overview.test.mjs`

Expected: FAIL because V5.3 statistics and public detail tabs are absent.

- [ ] **Step 3: Write minimal implementation**

```js
renderStatisticPeriods(root, model.summary.periods);
renderBondDetail(record, { tabs: ['overview', 'quotes', 'events', 'terms', 'company'] });
renderCompanyCbSummary(company, model.records.filter((record) => record.stockCode === company.stockCode));
```

Use raw verified price/volume trend only when history exists. Exclude archived CBs from active counts but keep them addressable as history.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test --test-concurrency=2 tests/static-showcase-v53-cb-pages.test.mjs tests/static-showcase-company-overview.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add static-showcase/bonds-stats.html static-showcase/assets/bond-stats-page.js static-showcase/assets/bond-detail-page.js static-showcase/assets/company-overview.js tests/static-showcase-company-overview.test.mjs tests/static-showcase-v53-cb-pages.test.mjs
git commit -m "feat: complete V5.3 CB detail and statistics"
```

### Task 7: QA、V5.2 回歸與部署前驗收

**Files:**
- Modify: `tests/static-showcase-v53-cb-workbench.test.mjs`, `tests/static-showcase-v53-cb-pages.test.mjs`
- Modify: `tests/static-showcase-v52-search.test.mjs`, `tests/static-showcase-v52-canonical-data.test.mjs`

**Interfaces:**
- Consumes: staged V5.3 model and public page modules.
- Produces: `selectV53QaSamples(model)` with 20 active CBs, five issuance samples and five official event samples.

- [ ] **Step 1: Write the failing test**

```js
const samples = selectV53QaSamples(model);
assert.equal(samples.active.length, 20);
assert.equal(samples.issuance.length, 5);
assert.equal(samples.events.length, 5);
assert.ok(samples.events.every((event) => OFFICIAL_SOURCE_HOSTS.has(new URL(event.sourceUrl).host)));
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test --test-concurrency=2 tests/static-showcase-v53-cb-workbench.test.mjs`

Expected: FAIL until QA selection and source verification exist.

- [ ] **Step 3: Write minimal implementation**

```js
export function selectV53QaSamples(model) {
  return { active: model.records.filter((record) => record.status === 'active').slice(0, 20), issuance: model.issuance.slice(0, 5), events: model.events.slice(0, 5) };
}
```

Assert public output excludes technical-analysis and internal diagnostics, then keep V5.2 exact-company, exact-CB and failure-state tests intact.

- [ ] **Step 4: Run all verification**

Run: `node --test --test-concurrency=2`; `npm run lint`; `npm run typecheck`; `npm run build`; `git diff --check`.

Expected: every command exits 0.

- [ ] **Step 5: Inspect staged pages and commit**

Inspect desktop and compact `/bonds.html`, `/bonds-filter.html`, `/bonds-issuance.html`, `/bonds-events.html`, `/bonds-stats.html`, one CB detail and one company page. Then run:

```bash
git add -A
git commit -m "feat: complete V5.3 CB workbench"
```

Expected: no console error, 404, JS exception or broken navigation; compact screen uses cards/list fallback.
