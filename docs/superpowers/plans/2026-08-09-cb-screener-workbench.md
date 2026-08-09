# 可轉債篩選工作台介面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將可轉債頁改成 A「主表＋展開」和 B「每檔兩行」融合工作台，在不依賴橫向拖曳的情況下呈現完整交易欄位、篩選、排序、法人與事件資訊。

**Architecture:** 把 query／篩選／客觀警示邏輯抽成純函式，桌面表格每檔渲染主列與次列，手機改成摘要卡＋展開詳情。`bonds-page.js` 只讀正式 generation 的 `bond-market-view.json` 與 `bond-supplemental.json`；公司產業與月營收已由 generation 依發行公司代碼精確接入 `BondMarketView.issuerResearch`，瀏覽器不重算剩餘張數、週轉率、法人累計或公司財務資料。

**Tech Stack:** 靜態 HTML、原生 ES modules、CSS custom properties、Canvas、Node `node:test`、既有 `sortRows`。

## Global Constraints

- 必須先完成 `2026-08-09-cb-derived-market-fields.md` 與 `2026-08-09-cb-issuer-research.md`。
- 桌面第一視線固定呈現 CB 價格、溢價率、剩餘張數／流通餘額、成交週轉率與最近事件。
- 一般桌面寬度不得要求水平拖曳才能讀懂主表；900px 以下切換為手機卡片。
- 所有數值排序空值置後、升降冪可逆、狀態寫入 URL query。
- 不顯示「官方目前餘額」、「官方資料」等多餘字樣；不新增資料方法或來源清單面板。
- 不使用大面積綠色；沿用墨黑／暖灰、陶土橘及淡紫的深淺主題。
- 正負值不能只靠顏色，必須帶正負號或文字；互動元素支援鍵盤、焦點與 reduced motion。
- 頁面只讀資料，不產生買賣訊號、推薦、理論價或套利結論。

---

### Task 1: 可分享的篩選與排序 query 模型

**Files:**
- Create: `static-showcase/assets/bond-filter.js`
- Create: `tests/bond-filter.test.mjs`
- Modify: `static-showcase/assets/bonds-page.js`

**Interfaces:**
- Consumes: `readonly BondMarketView[]` and `URLSearchParams`。
- Produces:

```js
export const DEFAULT_BOND_FILTERS = Object.freeze({
  query: "", preset: "all",
  priceMin: null, priceMax: null,
  premiumMin: null, premiumMax: null,
  remainingMin: null, remainingMax: null,
  turnoverMin: null,
  eventDays: null,
  institutionPeriod: "daily", institutionMin: null,
  alertPremiumAbove: null, alertRemainingBelow: null,
  alertRemainingRatioBelow: null, alertTurnoverBelow: null,
  alertEventDays: null,
  quality: "all",
  sortKey: "bondCode", sortDirection: "asc", page: 1,
});

export function parseBondQuery(params) {}
export function serializeBondQuery(filters) {}
export function filterBondViews(views, filters) {}
export function getObjectiveBondFlags(view, filters) {}
```

- [ ] **Step 1: Write failing query round-trip tests**

```js
test("round-trips every accepted filter and ignores unknown parameters", () => {
  const params = new URLSearchParams("q=台泥&priceMax=110&premiumMax=10&remainingMin=1000&turnoverMin=1&eventDays=90&institutionPeriod=20d&institutionMin=10&alertPremiumAbove=15&alertRemainingBelow=500&alertRemainingRatioBelow=20&alertTurnoverBelow=0.5&alertEventDays=30&quality=complete&sort=dailyTurnoverRate&direction=desc&page=2&unknown=x");
  const parsed = parseBondQuery(params);
  assert.equal(serializeBondQuery(parsed).toString(), "q=%E5%8F%B0%E6%B3%A5&priceMax=110&premiumMax=10&remainingMin=1000&turnoverMin=1&eventDays=90&institutionPeriod=20d&institutionMin=10&alertPremiumAbove=15&alertRemainingBelow=500&alertRemainingRatioBelow=20&alertTurnoverBelow=0.5&alertEventDays=30&quality=complete&sort=dailyTurnoverRate&direction=desc&page=2");
});

test("filters ranges, events, institutions and quality without accepting missing values", () => {
  assert.deepEqual(filterBondViews(fixtures, filters).map(x => x.bondCode), ["11011"]);
});

test("returns only objective threshold and data-quality flags", () => {
  assert.deepEqual(getObjectiveBondFlags(fixtures[0], alertFilters), [
    "LOW_LIQUIDITY", "HIGH_PREMIUM", "LOW_REMAINING", "NEAR_EVENT", "DATE_MISMATCH",
  ]);
});
```

Also test invalid numbers, `min > max`, unsupported sort keys, page below 1 and query matching by CB code/name, issuer code/name or industry.

- [ ] **Step 2: Run RED**

Run: `node --test tests/bond-filter.test.mjs`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement strict query parsing**

Use explicit allowed sort keys:

```js
const SORT_KEYS = new Set([
  "bondCode","cbClose","stockClose","currentConversionPrice","conversionValue",
  "premiumRate","cbTradeUnits","remainingUnits","remainingRatio",
  "dailyTurnoverRate","institutionNetUnits","institutionNet5dUnits",
  "institutionNet20dUnits","daysToNextEvent",
]);
```

Finite numeric bounds only; empty string maps to `null`; invalid query values return defaults instead of throwing during page load. `filterBondViews` never treats `null` as zero. `getObjectiveBondFlags` compares only verified numeric values against explicit user thresholds and always reports date mismatch／stale／required-field-missing flags; it never emits a score, recommendation or safety label.

- [ ] **Step 4: Replace inline preset matching and URL assembly**

`initializeFromUrl` calls `parseBondQuery`; `syncListUrl` calls `serializeBondQuery`; current preset behavior remains represented by explicit filters. Preserve `history.pushState`／`replaceState` and `popstate` behavior.

- [ ] **Step 5: Run GREEN and commit**

Run: `node --test tests/bond-filter.test.mjs tests/bond-table-sort.test.mjs tests/static-showcase-bond-ui.test.mjs`

Expected: PASS.

```bash
git add static-showcase/assets/bond-filter.js static-showcase/assets/bonds-page.js tests/bond-filter.test.mjs
git commit -m "feat: add shareable CB screener filters"
```

### Task 2: A＋B 融合桌面總表與手機卡片

**Files:**
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/assets/bonds-page.js`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/static-showcase-bond-ui.test.mjs`

**Interfaces:**
- Consumes: enriched `BondMarketView` and Task 1 filter state。
- Produces: two-row table entry, responsive summary card, numeric headers and advanced filter form。

- [ ] **Step 1: Write failing DOM contract tests**

Replace the old 10-column expectations with:

```js
for (const label of [
  "價格", "轉換溢價率", "剩餘張數", "成交週轉率", "最近事件",
  "股票收盤價", "目前轉換價", "轉換價值", "剩餘比例",
  "CB 成交張數", "法人買賣超", "資料狀態", "客觀提示",
]) assert.match(bondsHtml + js, new RegExp(label));

assert.match(js, /class="bond-row-primary"/);
assert.match(js, /class="bond-row-secondary"/);
assert.match(js, /data-mobile-details/);
assert.doesNotMatch(js, /官方目前餘額|官方資料/);
assert.doesNotMatch(css, /\.bond-table\s*\{[^}]*min-width:\s*12\d{2}px/s);
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/static-showcase-bond-ui.test.mjs`

Expected: FAIL on old table structure and wording.

- [ ] **Step 3: Replace the table header with six paired columns**

Each `<th>` has a primary sort button and a small secondary label:

1. `CB 代碼／名稱` / `發行公司・資料狀態`
2. `價格` / `股票收盤價`
3. `轉換溢價率` / `目前轉換價・轉換價值`
4. `剩餘張數` / `剩餘比例`
5. `成交週轉率` / `CB 成交張數・法人買賣超`
6. `最近事件` / `資料日期`

Primary buttons sort their visible field. The existing mobile sort select retains every additional numeric sort key from Task 1.

- [ ] **Step 4: Render two rows per bond**

`renderBondRow(view)` returns adjacent rows:

```js
<tr class="bond-row-primary" data-bond-code="..." tabindex="0">...</tr>
<tr class="bond-row-secondary" data-bond-code="...">
  <td>發行公司／資料狀態</td><td>股票收盤</td><td>轉換價／價值</td>
  <td>剩餘比例</td><td>成交張數／法人</td><td>各資料日期</td>
</tr>
```

When `remainingUnits === null`, the primary cell label changes to `流通餘額` and displays the existing raw amount; it must not present an estimated number of units. Event content follows `redemption > put > maturity` and displays signed countdown text.

- [ ] **Step 5: Replace mobile button nesting with semantic cards**

Render `<article class="bond-card">` containing a dedicated `.bond-card-open` button and a `<details data-mobile-details>` for secondary fields. Do not nest interactive content inside a button. Cards default collapsed and expose the same values as the desktop secondary row. Render `getObjectiveBondFlags` as neutral `客觀提示` chips with explicit text such as `低流動性`、`溢價高於設定`、`剩餘籌碼低於設定`、`事件接近`、`資料日期不一致`；do not add buy/sell semantics.

- [ ] **Step 6: Add advanced filter controls**

Keep search and presets visible. Add a `<details class="bond-advanced-filters">` containing numeric min/max inputs for price, premium, remaining units, turnover, event window, institution period/value and quality, plus a separately labelled `客觀提示門檻` group for premium, remaining units／ratio, turnover and event days. Bind `input`／`change` to query synchronization; a `清除進階條件` button restores filters and alert thresholds but leaves search／sort intact.

- [ ] **Step 7: Implement non-scrolling desktop CSS**

Set `.bond-table { min-width: 0; table-layout: fixed; }`, assign six widths totaling 100%, use `overflow-wrap:anywhere`, tabular numbers and compact secondary typography. At `max-width: 900px` hide the table and show cards. Keep clay/violet variables and focus outlines; do not add green surface variables.

- [ ] **Step 8: Run GREEN and commit**

Run: `node --test tests/bond-filter.test.mjs tests/bond-table-sort.test.mjs tests/static-showcase-bond-ui.test.mjs tests/formal-bond-pages.test.mjs`

Expected: PASS.

```bash
git add static-showcase/bonds.html static-showcase/assets/bonds-page.js static-showcase/assets/app.css tests/static-showcase-bond-ui.test.mjs
git commit -m "feat: redesign CB screener table"
```

### Task 3: 法人、贖回、條款、公司研究與新債雷達詳情

**Files:**
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/assets/bonds-page.js`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/static-showcase-bond-ui.test.mjs`
- Modify: `tests/formal-market-data-contract.test.mjs`

**Interfaces:**
- Consumes: runtime `datasets.bondSupplemental`, enriched views including `issuerResearch`, and raw 11406 term rows。
- Produces: detail alert/timeline/institution/company-research panels and page-level underwriting radar。

- [ ] **Step 1: Write failing supplemental UI tests**

```js
for (const text of [
  "已公告提前贖回", "法人動向", "單日", "近 5 日", "近 20 日",
  "契約生命週期", "公司研究摘要", "產業", "月營收", "月增率", "年增率",
  "新債發行雷達", "主辦承銷商", "案件狀態",
]) assert.match(bondsHtml + js, new RegExp(text));

assert.match(js, /config\.datasets\.bondSupplemental/);
assert.match(js, /redemptionEvent/);
assert.match(js, /issuerResearch/);
assert.doesNotMatch(bondsHtml + js, /資料方法|來源清單面板/);
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/static-showcase-bond-ui.test.mjs tests/formal-market-data-contract.test.mjs`

Expected: FAIL because supplemental sections are absent.

- [ ] **Step 3: Load and validate supplemental data**

Add `supplemental` to state and load `config.datasets.bondSupplemental`. Require `schemaVersion === 1`, record arrays and source states; invalid supplemental data becomes an empty supplemental state without replacing or hiding the core view. Do not fetch source websites from the browser.

- [ ] **Step 4: Add redemption alert and event timeline**

When `view.redemptionEvent` exists, render a high-priority clay alert before summary metrics with announcement date, delisting date and `查看原始公告` link. Timeline ordering is chronological and contains issue, listing, conversion start, put dates, redemption/delisting, conversion end and maturity; missing dates are omitted, never inferred.

- [ ] **Step 5: Add institution and remaining-liquidity panels**

Add one panel with daily／5d／20d net units and data date, and one panel with remaining units, remaining ratio, trading units and daily turnover rate. Positive/negative values include explicit `+`／`−`; missing 5d／20d is `—` with `資料不足`.

- [ ] **Step 6: Render the issuer research summary**

Before the underwriting radar, render `公司研究摘要` from `view.issuerResearch`: industry, revenue month, current-month revenue (仟元), month-over-month rate, year-over-year rate, cumulative revenue and cumulative year-over-year rate. Join identity is already exact issuer code; never rejoin by company name in the browser. Missing research renders `資料暫缺` without hiding price, terms, institution or event panels. A company-event link appears only when an exact original announcement URL already belongs to that bond’s supplemental event; do not create a generic or fuzzy company-news feed.

- [ ] **Step 7: Render new underwriting radar outside the bond list**

Add `<section id="bond-underwriting-radar">` below the list and above the detail workbench. Cards show filing date, issuer, secured/unsecured, lead underwriter, placement method and case status. Display the neutral note `承銷案件尚待後續發行資料確認` and do not synthesize CB code, price, date or issue amount.

- [ ] **Step 8: Remove stale wording and preserve compact traceability**

Replace `官方目前餘額（原始面額）` with `來源流通餘額`; retain only compact `資料日期` and `查看原始公告` links in details. Do not create a methodology/source grid.

- [ ] **Step 9: Run GREEN and commit**

Run: `node --test tests/static-showcase-bond-ui.test.mjs tests/formal-market-data-contract.test.mjs tests/formal-bond-pages.test.mjs`

Expected: PASS.

```bash
git add static-showcase/bonds.html static-showcase/assets/bonds-page.js static-showcase/assets/app.css tests/static-showcase-bond-ui.test.mjs tests/formal-market-data-contract.test.mjs
git commit -m "feat: add CB research and event workbench"
```

### Task 4: 深淺色、可及性、手機與完整驗證

**Files:**
- Modify: `static-showcase/assets/app.css`
- Modify: `static-showcase/assets/bonds-page.js`
- Modify: `tests/static-showcase-bond-ui.test.mjs`
- Modify: `tests/public-site-routing.test.mjs`

**Interfaces:**
- Consumes: completed screener page。
- Produces: verified responsive and theme-safe production build。

- [ ] **Step 1: Add failing accessibility/style assertions**

Require primary rows, mobile detail toggles, advanced filter disclosure and redemption alert to have usable labels; assert `:focus-visible`, `[data-theme="dark"]`, `prefers-reduced-motion`, mobile breakpoint and non-green theme variables remain present.

- [ ] **Step 2: Run RED**

Run: `node --test tests/static-showcase-bond-ui.test.mjs tests/public-site-routing.test.mjs`

Expected: FAIL on any missing labels or selectors.

- [ ] **Step 3: Complete keyboard and responsive behavior**

Enter／Space on a primary row opens detail, Escape returns to the list, focus returns to the triggering row, and mobile `<details>` preserves native keyboard behavior. Do not attach duplicate click handlers to both primary and secondary rows. In 360px layout, no content overflows the viewport; long company names wrap.

- [ ] **Step 4: Run all automated gates**

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm test`

Expected: all commands exit 0.

- [ ] **Step 5: Perform local browser QA**

Build and serve the staged site locally. Verify at 1440×900 and 390×844 in both light and dark modes:

- main table does not require horizontal scrolling at 1440px;
- all text and buttons meet readable contrast;
- sort direction changes and URL round-trips;
- filters do not include missing values as zero;
- redemption alert and underwriting radar render only from supplemental records;
- mobile secondary fields expand/collapse and detail navigation returns focus;
- no methodology panel or `官方` labels appear in the CB page.

- [ ] **Step 6: Commit final QA adjustments**

```bash
git add static-showcase/assets/app.css static-showcase/assets/bonds-page.js tests/static-showcase-bond-ui.test.mjs tests/public-site-routing.test.mjs
git commit -m "test: verify responsive CB screener workbench"
```
