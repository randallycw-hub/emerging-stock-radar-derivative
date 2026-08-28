# V5 前台精修與專業 K 線 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將公開研究網站精修為可快速閱讀、可追溯資料日期、以真實 OHLCV 呈現公司技術圖表的 V5 專業研究工具。

**Architecture:** 靜態展示站維持既有已驗證快照與資料定義；`site-shell.js` 負責共用資訊架構，頁面模組只投影已發布公開資料。K 線改為可延後載入的 KLineChart 10.x 介接層，只接受已驗證的完整 OHLCV；資料不足時保留空狀態並不推算或補值。

**Tech Stack:** 靜態 HTML、ES modules、CSS custom properties、Node.js test runner、KLineChart 10.x（本地套件與靜態 vendor 產物）。

**Spec:** `C:/Users/USER/Desktop/台灣盤後市場資訊台_V5_前台精修與專業K線_Codex完整執行規格.pdf`

## Global Constraints

- 保留官方資料來源、財務定義、IPO 階段與可轉債換算／溢價公式。
- 不產生、不插補、不用收盤價偽造 OHLCV，且不呈現任何買賣或 AI 訊號。
- 桌面主導覽僅保留首頁、興櫃、IPO、可轉債與搜尋；Data Center 維持輔助入口。
- 使用 V5 淺／深色 token、Taiwan 上漲紅／下跌綠、tabular numeric 與 1440px 最大內容寬度。
- 所有新互動需可鍵盤操作、可見焦點、正確 aria，且手持裝置不可產生水平頁面捲動。
- 歷史資料最多以兩個併發請求處理；不得在前端或公開資料產物存放帳號、金鑰或個資。

---

### Task 1: 建立回歸基線與公開資料護欄

**Files:**
- Create: `docs/v5-regression-baseline.md`
- Modify: `tests/static-showcase-candlestick.test.mjs`
- Test: `tests/static-showcase-candlestick.test.mjs`

**Interfaces:**
- Consumes: `static-showcase/data/bond-market-history.json`、`static-showcase/data/stock-closes.json`。
- Produces: `summarizeVerifiedOhlcv(points)`，回傳完整 OHLCV 點數、可供畫圖的代碼數與資料日期範圍。

- [ ] **Step 1: Write the failing test**

```js
test('V5 only permits complete verified OHLCV points into a chart adapter', () => {
  assert.deepEqual(summarizeVerifiedOhlcv([
    point('2026-08-01', { cbOpen: '100', cbHigh: '103', cbLow: '99', cbClose: '102', cbTradingUnits: '8' }),
    point('2026-08-02', { cbOpen: null, cbHigh: null, cbLow: null, cbClose: '102', cbTradingUnits: '4' }),
  ]), { completePoints: 1, dateRange: ['2026-08-01', '2026-08-01'] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/static-showcase-candlestick.test.mjs`

Expected: failure because `summarizeVerifiedOhlcv` is not exported.

- [ ] **Step 3: Implement the minimal data guard and document the baseline**

```js
export function summarizeVerifiedOhlcv(points) {
  const verified = verifiedDailyCandles(points);
  return {
    completePoints: verified.length,
    dateRange: verified.length ? [verified[0].date, verified.at(-1).date] : null,
  };
}
```

Record the five existing market / IPO / CB regression identities and the actual result of the OHLCV audit in `docs/v5-regression-baseline.md` without adding sample prices to public page code.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/static-showcase-candlestick.test.mjs`

Expected: PASS and incomplete values remain excluded.

- [ ] **Step 5: Commit**

```bash
git add docs/v5-regression-baseline.md tests/static-showcase-candlestick.test.mjs static-showcase/assets/bond-technical-analysis.js
git commit -m "test: establish V5 market data baseline"
```

### Task 2: 建立 V5 設計 token 與共用產品殼層

**Files:**
- Modify: `static-showcase/assets/app.css`
- Modify: `static-showcase/assets/site-shell.js`
- Modify: `static-showcase/index.html`
- Modify: `tests/static-showcase-v4-ui.test.mjs`
- Test: `tests/static-showcase-v5-shell.test.mjs`

**Interfaces:**
- Consumes: `PUBLIC_PRIMARY_NAVIGATION`、現有頁面 `data-page`。
- Produces: `renderPublicFooter()` V5 四區頁尾與 `renderMarketStatusLine()`，輸出可讀資料日／更新時間文字。

- [ ] **Step 1: Write the failing test**

```js
test('V5 shell keeps four research destinations and uses source links only in the footer', () => {
  assert.match(renderPublicFooter(), /TWSE/);
  assert.match(renderPublicFooter(), /TPEx/);
  assert.doesNotMatch(renderPrimaryNavigation(), /資料中心/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/static-showcase-v5-shell.test.mjs`

Expected: failure because the V5 footer source groups are absent.

- [ ] **Step 3: Implement the minimal shell and tokens**

```css
:root { --v5-bg:#F5F7FA; --v5-surface:#FFF; --v5-border:#DDE3EA; --v5-text:#162033; --v5-primary:#2563EB; --v5-up:#C62828; --v5-down:#078A55; }
[data-theme="dark"] { --v5-bg:#0B1220; --v5-surface:#111827; --v5-border:#2A3648; --v5-text:#F2F4F7; --v5-primary:#6EA0FF; --v5-up:#FF6B6B; --v5-down:#47C78A; }
```

Apply 56–64px sticky header behaviour, 1440px content limit, compact numeric tables, V5 footer sections, normal-status one-line treatment, and an explicit visible focus style without changing source data labels.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/static-showcase-v5-shell.test.mjs`

Expected: PASS; only four public research destinations appear in primary navigation.

- [ ] **Step 5: Commit**

```bash
git add static-showcase/assets/app.css static-showcase/assets/site-shell.js static-showcase/index.html tests/static-showcase-v5-shell.test.mjs
git commit -m "feat: apply V5 research product shell"
```

### Task 3: 首頁、搜尋與公司研究入口

**Files:**
- Modify: `static-showcase/index.html`
- Modify: `static-showcase/assets/home-page.js`
- Modify: `static-showcase/assets/site-search.js`
- Modify: `static-showcase/company.html`
- Modify: `static-showcase/assets/company-overview.js`
- Test: `tests/static-showcase-v5-company.test.mjs`

**Interfaces:**
- Consumes: published runtime datasets for emerging market, IPO events, monthly revenue, and CB workbench.
- Produces: `buildCompanyOverview()` with `overview`, `technical`, `ipo`, `bonds`, `revenue`, and `events` tabs; `buildCompanySearchResults(query, datasets)` returns one company result containing CB subitems.

- [ ] **Step 1: Write the failing test**

```js
test('V5 company overview retains a technical tab and absent market modules use neutral copy', () => {
  const html = renderCompanyOverview({ code: '1234', name: '測試公司', emerging: null, ipo: null, revenue: null, bonds: [], events: [] });
  assert.match(html, /技術圖表/);
  assert.match(html, /目前沒有可轉債公開資料/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/static-showcase-v5-company.test.mjs`

Expected: failure because the technical tab and neutral no-data copy do not exist.

- [ ] **Step 3: Implement compact research entry points**

```js
const COMPANY_TABS = Object.freeze(['overview', 'technical', 'ipo', 'bonds', 'revenue', 'events']);
```

Make the homepage top compact, keep actual summary values and objective lists, make search code/name/CB fuzzy matching keyboard-operable, and render the company header using verified market / sector / price / data-date values or dashes. The raw HTML must provide readable static headings and a non-JavaScript fallback instead of an indefinite “loading” statement.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/static-showcase-v5-company.test.mjs`

Expected: PASS; deep links preserve `?code=` and tab state.

- [ ] **Step 5: Commit**

```bash
git add static-showcase/index.html static-showcase/company.html static-showcase/assets/home-page.js static-showcase/assets/site-search.js static-showcase/assets/company-overview.js tests/static-showcase-v5-company.test.mjs
git commit -m "feat: add V5 company research entry"
```

### Task 4: 以 KLineChart 10.x 取代手寫 K 線 renderer

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `static-showcase/assets/klinechart-adapter.js`
- Modify: `static-showcase/assets/bond-detail-page.js`
- Modify: `static-showcase/assets/company-overview.js`
- Modify: `scripts/stage-static-showcase.mjs`
- Modify: `tests/static-showcase-candlestick.test.mjs`
- Create: `tests/static-showcase-kline-adapter.test.mjs`

**Interfaces:**
- Consumes: verified points `{ date, cbOpen, cbHigh, cbLow, cbClose, cbTradingUnits }`.
- Produces: `toKlineData(points)` and `mountKlineChart({ host, points, period, range, extraIndicator })` where `dispose()` is always callable.

- [ ] **Step 1: Write the failing test**

```js
test('KLineChart adapter maps only actual OHLCV and returns a disposable empty result when absent', () => {
  assert.deepEqual(toKlineData([point('2026-08-03', { cbOpen: '100', cbHigh: '104', cbLow: '99', cbClose: '102', cbTradingUnits: '9' })]), [{ timestamp: 1785686400000, open: 100, high: 104, low: 99, close: 102, volume: 9 }]);
  assert.equal(mountKlineChart({ host: null, points: [] }).state, 'empty');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/static-showcase-kline-adapter.test.mjs`

Expected: failure because `klinechart-adapter.js` is missing.

- [ ] **Step 3: Implement and vendor the official package**

```js
export function toKlineData(points) {
  return verifiedDailyCandles(points).map((point) => ({ timestamp: taipeiStartOfDay(point.date), open: Number(point.open), high: Number(point.high), low: Number(point.low), close: Number(point.close), volume: Number(point.tradingUnits ?? 0) }));
}
```

Install a locked `klinecharts@10.x` version, copy its official local browser build at staging time, lazy import only when the technical tab opens, use `ResizeObserver`, register MA5/10/20/60 and VOL by default plus one selected MACD/RSI/KD/BOLL pane, aggregate W/M from actual daily records using Asia/Taipei, and dispose on tab change. Remove all custom canvas drawing calls; retain only the verified data selector. Provide controlled loading, empty, retry, crosshair info, latest-data affordance, and responsive chart dimensions.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/static-showcase-kline-adapter.test.mjs tests/static-showcase-candlestick.test.mjs`

Expected: PASS; synthetic or incomplete public records cannot reach KLineChart.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json static-showcase/assets/klinechart-adapter.js static-showcase/assets/bond-detail-page.js static-showcase/assets/company-overview.js scripts/stage-static-showcase.mjs tests/static-showcase-kline-adapter.test.mjs tests/static-showcase-candlestick.test.mjs
git commit -m "feat: replace custom canvas with KLineChart adapter"
```

### Task 5: 興櫃、IPO、可轉債研究頁精修

**Files:**
- Modify: `static-showcase/emerging.html`
- Modify: `static-showcase/assets/emerging-page.js`
- Modify: `static-showcase/ipo.html`
- Modify: `static-showcase/ipo-radar.html`
- Modify: `static-showcase/assets/ipo-page.js`
- Modify: `static-showcase/assets/ipo-radar-page.js`
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/assets/bonds-page.js`
- Test: `tests/static-showcase-v5-research-pages.test.mjs`

**Interfaces:**
- Consumes: existing published emerging, IPO and CB datasets.
- Produces: semantic compact tabs/filters, issuer company links, consistent missing-value dash treatment, and stable URL state.

- [ ] **Step 1: Write the failing test**

```js
test('V5 IPO offers fixed stage groups and never invents event dates or prices', () => {
  const html = renderIpoResearchPage(records);
  assert.match(html, /進度/);
  assert.match(html, /時程/);
  assert.match(html, /競拍與申購/);
  assert.doesNotMatch(html, /預估價格|推估日期/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/static-showcase-v5-research-pages.test.mjs`

Expected: failure because V5 fixed control labels are not present.

- [ ] **Step 3: Implement page-level controls and table density**

```html
<button type="button" data-ipo-date-filter="week">本週</button>
<button type="button" data-ipo-date-filter="next-week">下週</button>
<button type="button" data-ipo-date-filter="30-days">30 日</button>
<button type="button" data-ipo-date-filter="all">全部</button>
```

Use `市場概況／漲跌排行／成交排行／全部公司` for emerging, `進度／時程／競拍與申購` for IPO, and CB-first search with compact quick chips and collapsed advanced filters. Apply 36–40px sticky headers, 38–42px rows, right-aligned tabular figures, and mobile dense cards or locally scrollable tables. Keep all actual value projections and issuer links.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/static-showcase-v5-research-pages.test.mjs`

Expected: PASS; all unsupported values render as `—`.

- [ ] **Step 5: Commit**

```bash
git add static-showcase/emerging.html static-showcase/assets/emerging-page.js static-showcase/ipo.html static-showcase/ipo-radar.html static-showcase/assets/ipo-page.js static-showcase/assets/ipo-radar-page.js static-showcase/bonds.html static-showcase/assets/bonds-page.js tests/static-showcase-v5-research-pages.test.mjs
git commit -m "feat: refine V5 market research pages"
```

### Task 6: SEO、可及性、回歸驗證與發布

**Files:**
- Modify: `static-showcase/index.html`
- Modify: `static-showcase/company.html`
- Modify: `static-showcase/emerging.html`
- Modify: `static-showcase/ipo.html`
- Modify: `static-showcase/ipo-radar.html`
- Modify: `static-showcase/bonds.html`
- Create: `tests/static-showcase-v5-accessibility.test.mjs`
- Modify: `docs/v5-regression-baseline.md`

**Interfaces:**
- Consumes: completed static assets and published snapshots.
- Produces: per-page title/description/canonical, usable keyboard paths, and reproducible V5 verification evidence.

- [ ] **Step 1: Write the failing test**

```js
test('V5 public pages have canonical metadata and no internal diagnostic language', async () => {
  for (const page of ['index.html', 'company.html', 'emerging.html', 'ipo.html', 'ipo-radar.html', 'bonds.html']) {
    const html = await readFile(`static-showcase/${page}`, 'utf8');
    assert.match(html, /<link rel="canonical"/);
    assert.doesNotMatch(html, /來源 ID|缺漏原因|資料完整/);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/static-showcase-v5-accessibility.test.mjs`

Expected: failure because the required canonical tags are incomplete.

- [ ] **Step 3: Implement verification metadata and final regression evidence**

```html
<link rel="canonical" href="https://emerging-stock-radar-derivative-20260720.chiayu333.chatgpt.site/market-site/company.html">
```

Add page-specific canonical, title, and description metadata; preserve static readable content; run keyboard and responsive checks at the six required viewport sizes; compare the recorded market / IPO / CB and five OHLCV samples against current sources. Only publish if values are unchanged or evidence-backed source updates are recorded.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run lint; npm run typecheck; npm test`

Expected: all commands exit 0 and all data regression samples match their verified snapshots.

- [ ] **Step 5: Commit and release**

```bash
git add static-showcase tests docs package.json package-lock.json scripts
git commit -m "feat: complete V5 public research refinement"
```

Build, deploy with the existing Sites configuration, then verify the deployed root, company, emerging, IPO, IPO radar, and CB routes with no console error or 404.
