# Multipage Market Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current long single-page static showcase into a production-ready five-page GitHub Pages site for convertible-bond, emerging-market, IPO, and methodology information, using verified end-of-day datasets and the terminology approved in the design specification.

**Architecture:** Keep data acquisition and page rendering separate. Extend the existing verified static snapshot pipeline with one normalized emerging-market end-of-day artifact, then render five independent HTML entry points through small page-specific JavaScript modules and a shared shell. All derived values are calculated during snapshot generation, not improvised in the browser; the browser only filters, sorts, paginates, and formats already-published records.

**Tech Stack:** Node.js >=22.13.0, TypeScript 5.9.3, Node test runner, static HTML/CSS/JavaScript, existing source-verification and snapshot utilities, GitHub Actions, GitHub Pages.

## Global Constraints

- Follow the approved design in `docs/superpowers/specs/2026-07-30-multipage-market-site-design.md`.
- The public pages are exactly `index.html`, `bonds.html`, `emerging.html`, `ipo.html`, and `methodology.html`.
- The home title is exactly `可轉債與興櫃盤後資訊`.
- Remove the home summary strip showing convertible-bond count, priced count, issuer count, and data date.
- Emerging-market price terminology is exactly `當日成交均價（盤後）`; never label it closing price.
- Do not publish real-time, latest-price, bid, ask, order quantity, WebSocket, live-update, or intraday controls.
- Source `tpex_esb_latest_statistics` supplies `Average`, `PreviousAveragePrice`, `Highest`, `Lowest`, and `TransactionVolume`; it does not supply exact transaction amount or industry.
- Join industry by exact company code from the approved `94025` company dataset. Never guess an unmatched industry.
- Calculate `估算成交金額（盤後） = 當日成交均價 × 成交量`; always label it as an estimate, never as source transaction amount.
- Calculate `均價漲跌幅 = (當日成交均價 - 前日成交均價) / 前日成交均價 × 100` only when both prices are valid and positive.
- Derived ranks use same-date records only. Missing values sort last in both directions.
- Data-source detail appears only on `methodology.html`; do not repeat per-record source cards or capture-version blocks.
- No Cloudflare Worker, D1, Wrangler, or relay workflow is introduced.
- Collection concurrency is at most `2`. CPU-intensive local commands use at most two threads and Windows priority `BelowNormal`.
- A failed or incomplete refresh must not overwrite the last verified published snapshot.
- Preserve the established clay-orange and muted-violet identity. Green is not a primary background, accent, or text color.
- Every interactive control must be keyboard usable, have a visible focus state, and meet WCAG AA contrast.

---

## Target File Map

### New source and data units

- `lib/source-verification/source-emerging-market.ts`: strict parser for the approved TPEx end-of-day payload.
- `lib/market-data/emerging-market-view.ts`: exact joins and deterministic derived fields.
- `tests/fixtures/source-verification/emerging-market/tpex-esb-latest-statistics.json`: representative approved fixture.
- `tests/fixtures/source-verification/emerging-market/metadata.json`: capture metadata.
- `static-showcase/data/emerging-market.json`: generated public read model.

### New page entry points

- `static-showcase/bonds.html`
- `static-showcase/emerging.html`
- `static-showcase/ipo.html`
- `static-showcase/methodology.html`

### New browser modules

- `static-showcase/assets/site-shell.js`
- `static-showcase/assets/home-page.js`
- `static-showcase/assets/bonds-page.js`
- `static-showcase/assets/emerging-page.js`
- `static-showcase/assets/ipo-page.js`
- `static-showcase/assets/table-sort.js`

### Existing files modified

- `docs/data-source-registry.md`
- `docs/end-of-day-market-data.md`
- `docs/source-verification/review-checklist.md`
- `lib/domain/types.ts`
- `lib/domain/schema.ts`
- `scripts/refresh-static-showcase-data.mjs`
- `scripts/embed-static-showcase-data.mjs`
- `static-showcase/index.html`
- `static-showcase/assets/app.css`
- `static-showcase/data/manifest.json`
- `static-showcase/data/runtime.js`
- `tests/phase1-1-source-quarantine.test.mjs`
- `tests/phase2-domain.test.mjs`
- `tests/refresh-static-showcase-data.test.mjs`
- `tests/static-showcase.test.mjs`
- `tests/static-showcase-bond-ui.test.mjs`
- `.github/workflows/deploy-github-pages.yml`

### Existing browser module retired

- Delete `static-showcase/assets/app.js` only after all five pages load their replacement modules and the full test suite passes.

---

### Task 1: Lock the emerging-market source and calculation contract

**Files:**
- Create: `tests/fixtures/source-verification/emerging-market/tpex-esb-latest-statistics.json`
- Create: `tests/fixtures/source-verification/emerging-market/metadata.json`
- Create: `tests/source-verification/source-emerging-market.test.mjs`
- Create: `lib/source-verification/source-emerging-market.ts`
- Modify: `docs/data-source-registry.md`
- Modify: `docs/end-of-day-market-data.md`
- Modify: `docs/source-verification/review-checklist.md`
- Modify: `tests/phase1-1-source-quarantine.test.mjs`

**Interfaces:**

```ts
export type EmergingMarketSourceRow = {
  tradingDate: string;
  publishedTime: string;
  companyCode: string;
  companyName: string;
  previousAveragePrice: string | null;
  dailyAveragePrice: string | null;
  dailyHighPrice: string | null;
  dailyLowPrice: string | null;
  transactionVolume: string | null;
  applyingDate: string | null;
  applyingStatus: string | null;
};

export function parseEmergingMarketSource(
  payload: unknown,
): EmergingMarketSourceRow[];
```

- [ ] **Step 1: Add a failing source-parser test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseEmergingMarketSource } from "../../lib/source-verification/source-emerging-market.ts";

test("parses only approved emerging end-of-day fields", async () => {
  const payload = JSON.parse(await readFile(
    new URL("../fixtures/source-verification/emerging-market/tpex-esb-latest-statistics.json", import.meta.url),
    "utf8",
  ));
  const [row] = parseEmergingMarketSource(payload);
  assert.deepEqual(row, {
    tradingDate: "2026-07-30",
    publishedTime: "14:00:06",
    companyCode: "1260",
    companyName: "富味鄉",
    previousAveragePrice: "25.29",
    dailyAveragePrice: "25.45",
    dailyHighPrice: "26.5",
    dailyLowPrice: "25.2",
    transactionVolume: "22001",
    applyingDate: null,
    applyingStatus: null,
  });
  assert.equal("latestPrice" in row, false);
  assert.equal("buyingPrice" in row, false);
  assert.equal("sellingPrice" in row, false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/source-verification/source-emerging-market.test.mjs
```

Expected: FAIL because the parser module does not exist.

- [ ] **Step 3: Add the exact captured fixture and metadata**

The fixture must retain the upstream field names, including forbidden fields, so the test proves the parser drops them:

```json
[
  {
    "Date": "1150730",
    "Time": "140006",
    "SecuritiesCompanyCode": "1260",
    "CompanyName": "富味鄉",
    "PreviousAveragePrice": "25.29",
    "BuyingPrice": "24.6",
    "BuyingQuantity": "3000",
    "SellingPrice": "25.55",
    "SellingQuantity": "3000",
    "Highest": "26.5",
    "Lowest": "25.2",
    "Average": "25.45",
    "LatestPrice": "25.2",
    "Buy/Sell": "S",
    "SuspendTime": "000000",
    "TransactionVolume": "22001",
    "ApplyingDate": "",
    "ApplyingStatus": ""
  }
]
```

Metadata records:

```json
{
  "capturedAt": "2026-07-30T14:05:00+08:00",
  "method": "GET",
  "url": "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics",
  "status": 200,
  "contentType": "application/json"
}
```

- [ ] **Step 4: Implement strict parsing**

Implementation requirements:

- reject non-array payloads;
- normalize ROC `YYYMMDD` to ISO `YYYY-MM-DD`;
- normalize `HHMMSS` to `HH:MM:SS`;
- reject duplicate company codes for the same trading date;
- parse only the approved fields listed in `EmergingMarketSourceRow`;
- convert blank, `-`, and non-finite numeric cells to `null`;
- never copy `BuyingPrice`, `BuyingQuantity`, `SellingPrice`, `SellingQuantity`, `LatestPrice`, `Buy/Sell`, or `SuspendTime`.

- [ ] **Step 5: Amend the governance documents**

Record these decisions:

```text
Resource: GET https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics
Status: VERIFIED_FOR_IMPLEMENTATION
Purpose: 興櫃股票當日盤後行情
Published source fields: Average, PreviousAveragePrice, Highest, Lowest, TransactionVolume
Allowed derived fields: 均價漲跌額、均價漲跌幅、上漲/下跌/平盤分類、估算成交金額、同日排行
Forbidden fields: BuyingPrice, BuyingQuantity, SellingPrice, SellingQuantity, LatestPrice, Buy/Sell, SuspendTime
```

State that `估算成交金額` is derived from rounded source values and is unsuitable for exact reconciliation.

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
node --test tests/source-verification/source-emerging-market.test.mjs tests/phase1-1-source-quarantine.test.mjs
```

Expected: PASS.

Commit:

```powershell
git add docs/data-source-registry.md docs/end-of-day-market-data.md docs/source-verification/review-checklist.md lib/source-verification/source-emerging-market.ts tests/fixtures/source-verification/emerging-market tests/source-verification/source-emerging-market.test.mjs tests/phase1-1-source-quarantine.test.mjs
git commit -m "feat: verify emerging market close source"
```

---

### Task 2: Build the normalized emerging-market public read model

**Files:**
- Create: `lib/market-data/emerging-market-view.ts`
- Create: `tests/emerging-market-view.test.mjs`
- Modify: `lib/domain/types.ts`
- Modify: `lib/domain/schema.ts`
- Modify: `tests/phase2-domain.test.mjs`

**Interfaces:**

```ts
export type EmergingMarketView = {
  tradingDate: string;
  companyCode: string;
  companyName: string;
  industryName: string | null;
  dailyAveragePrice: string | null;
  previousAveragePrice: string | null;
  dailyHighPrice: string | null;
  dailyLowPrice: string | null;
  averageChange: string | null;
  averageChangePercent: string | null;
  direction: "up" | "down" | "flat" | "unavailable";
  transactionVolume: string | null;
  estimatedTransactionAmount: string | null;
  applyingDate: string | null;
  applyingStatus: string | null;
};

export function buildEmergingMarketViews(input: {
  marketRows: EmergingMarketSourceRow[];
  companyRows: Array<{
    companyCode: string;
    companyName: string;
    industryName: string;
  }>;
}): EmergingMarketView[];
```

- [ ] **Step 1: Write failing tests for joins and calculations**

Cover:

- exact company-code industry join;
- unmatched industry becomes `null`;
- `25.45 - 25.29 = 0.16`;
- percentage is derived deterministically with the shared decimal helper;
- `25.45 × 22001 = 559925.45`;
- zero or missing prior price yields `averageChangePercent: null`;
- no cross-date records are combined;
- output order is stable by company code.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/emerging-market-view.test.mjs
```

Expected: FAIL because the view builder does not exist.

- [ ] **Step 3: Implement the view builder**

Reuse `lib/market-data/decimal.ts`; do not use binary floating-point arithmetic for published values. Keep source numeric strings unchanged and create separate derived string fields.

- [ ] **Step 4: Extend domain validation**

The public schema must reject:

- an invalid ISO date;
- an empty company code;
- a non-decimal numeric string;
- a direction outside the four allowed values;
- a negative transaction volume;
- a derived price change when the required source values are absent.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
node --test tests/emerging-market-view.test.mjs tests/phase2-domain.test.mjs
```

Expected: PASS.

Commit:

```powershell
git add lib/market-data/emerging-market-view.ts lib/domain/types.ts lib/domain/schema.ts tests/emerging-market-view.test.mjs tests/phase2-domain.test.mjs
git commit -m "feat: derive emerging market views"
```

---

### Task 3: Publish the emerging-market snapshot atomically

**Files:**
- Modify: `scripts/refresh-static-showcase-data.mjs`
- Modify: `scripts/embed-static-showcase-data.mjs`
- Modify: `tests/refresh-static-showcase-data.test.mjs`
- Create: `static-showcase/data/emerging-market.json`
- Modify: `static-showcase/data/manifest.json`
- Modify: `static-showcase/data/runtime.js`

**Published contract:**

```json
{
  "schemaVersion": 1,
  "tradingDate": "2026-07-30",
  "publishedAt": "2026-07-30T14:00:06+08:00",
  "sourceId": "tpex_esb_latest_statistics",
  "records": []
}
```

- [ ] **Step 1: Add failing refresh tests**

Inject fetch responses and assert:

- the TPEx endpoint is requested once;
- request concurrency never exceeds two;
- the `94025` industry join uses exact company code;
- the output contains no forbidden live fields;
- source `Date` matches all published records;
- manifest and runtime include `emergingMarketUrl`;
- failed fetch or validation leaves the prior output byte-for-byte unchanged.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
node --test tests/refresh-static-showcase-data.test.mjs
```

Expected: FAIL because `emerging-market.json` is not part of the refresh.

- [ ] **Step 3: Integrate staged collection**

Add:

```js
const EMERGING_MARKET_URL =
  "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics";
```

The refresh order is:

1. fetch all inputs into a temporary staging directory;
2. parse and validate the source payload;
3. parse the newest approved `94025` company rows;
4. build the normalized view;
5. validate row count, unique company code, and single trading date;
6. write `emerging-market.json`, `manifest.json`, and `runtime.js` in staging;
7. atomically replace public files only after every gate passes.

- [ ] **Step 4: Keep scheduled refresh behavior**

Do not add a new workflow. The existing `npm run snapshot:showcase` job remains the sole scheduled entry point and GitHub Actions keeps `UV_THREADPOOL_SIZE=2`.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
node --test tests/refresh-static-showcase-data.test.mjs tests/github-pages-schedule.test.mjs
```

Expected: PASS.

Commit:

```powershell
git add scripts/refresh-static-showcase-data.mjs scripts/embed-static-showcase-data.mjs static-showcase/data tests/refresh-static-showcase-data.test.mjs
git commit -m "feat: publish emerging market snapshot"
```

---

### Task 4: Create the five-page shell and simplify the home page

**Files:**
- Create: `static-showcase/bonds.html`
- Create: `static-showcase/emerging.html`
- Create: `static-showcase/ipo.html`
- Create: `static-showcase/methodology.html`
- Create: `static-showcase/assets/site-shell.js`
- Create: `static-showcase/assets/home-page.js`
- Modify: `static-showcase/index.html`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/static-showcase.test.mjs`
- Create: `tests/static-showcase-pages.test.mjs`

- [ ] **Step 1: Write failing page-structure tests**

Assert all five pages:

- exist and use `lang="zh-Hant"`;
- link the shared stylesheet and `site-shell.js`;
- contain navigation links to all five pages;
- identify the current page with `aria-current="page"`;
- contain the light/dark theme control;
- do not use hash navigation for page changes.

Assert the home page:

```js
assert.match(home, /可轉債與興櫃盤後資訊/);
assert.doesNotMatch(home, />384<|>343<|>354<|資料日期/);
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
node --test tests/static-showcase.test.mjs tests/static-showcase-pages.test.mjs
```

Expected: FAIL because the page entry points do not exist.

- [ ] **Step 3: Implement the shared shell**

`site-shell.js` owns only:

- theme initialization and `localStorage`;
- mobile navigation open/close;
- active-page state;
- shared date and number formatters;
- safe JSON fetch with visible error state.

It must not own bond, emerging, or IPO business logic.

- [ ] **Step 4: Implement the simplified home**

The home contains:

- title `可轉債與興櫃盤後資訊`;
- one concise explanatory paragraph;
- four large navigation modules for convertible bonds, emerging market, IPO schedule, and methodology;
- last successful data update;
- no dataset-count summary strip;
- no long tables.

- [ ] **Step 5: Add the methodology page**

Use exactly:

```text
DATA METHODOLOGY
資料來源與計算方法
可轉債發行條款
盤後行情資料
轉換價格資料
估值計算原則
```

Explain same-date calculations and the emerging-market estimated-amount formula. Do not use `官方資料`, `官方快照`, or `擷取版本` as visible headings.

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
node --test tests/static-showcase.test.mjs tests/static-showcase-pages.test.mjs
```

Expected: PASS.

Commit:

```powershell
git add static-showcase/index.html static-showcase/bonds.html static-showcase/emerging.html static-showcase/ipo.html static-showcase/methodology.html static-showcase/assets/site-shell.js static-showcase/assets/home-page.js static-showcase/assets/app.css tests/static-showcase.test.mjs tests/static-showcase-pages.test.mjs
git commit -m "feat: split showcase into five pages"
```

---

### Task 5: Move the convertible-bond workbench to its own page

**Files:**
- Create: `static-showcase/assets/table-sort.js`
- Create: `static-showcase/assets/bonds-page.js`
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/static-showcase-bond-ui.test.mjs`
- Create: `tests/bond-table-sort.test.mjs`

**Interfaces:**

```js
export function sortRows(rows, {
  key,
  direction,
  type,
  missing = "last",
});
```

- [ ] **Step 1: Write failing sorting tests**

For every sortable numeric column, test:

- first click selects descending order;
- second click reverses to ascending;
- active header shows `↓` or `↑`;
- `aria-sort` is `descending` or `ascending`;
- equal values use bond code as a stable tie-breaker;
- null, blank, `-`, and invalid values remain last in both directions.

- [ ] **Step 2: Write failing bond-page tests**

Assert:

- filters remain available;
- all approved CB columns are visible in the wide table;
- selecting a bond navigates to `bonds.html?bond=<code>`;
- detail mode replaces the list instead of appearing below it;
- the back action restores filters and sorting from URL parameters;
- no `資料來源` or `擷取版本` block appears in bond detail.

- [ ] **Step 3: Run and verify RED**

Run:

```powershell
node --test tests/bond-table-sort.test.mjs tests/static-showcase-bond-ui.test.mjs
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 4: Implement table sorting and URL state**

Use query parameters:

```text
bonds.html?q=史坦&sort=conversionPremiumRate&direction=asc&page=2
bonds.html?bond=35221
```

The sortable headers are:

```text
CB 代碼／名稱
CB 收盤價
股票收盤價
目前轉換價
轉換價值
轉換溢價率
CB 成交量
流通餘額
到期／賣回事年
```

On mobile, expose a compact sort-field select plus one direction button; do not force the user to horizontally scroll just to change sorting.

- [ ] **Step 5: Implement list and detail rendering**

Reuse the existing verified bond read models. Preserve:

- search and filter controls;
- 50-row desktop pagination and 25-row mobile pagination;
- complete issuance terms and same-date market metrics;
- missing-data reasons;
- accessible table semantics.

Remove the per-bond source/capture section. Link to `methodology.html` once in the page-level footer.

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
node --test tests/bond-table-sort.test.mjs tests/static-showcase-bond-ui.test.mjs tests/bond-market-view.test.mjs
```

Expected: PASS.

Commit:

```powershell
git add static-showcase/bonds.html static-showcase/assets/bonds-page.js static-showcase/assets/table-sort.js static-showcase/assets/app.css tests/bond-table-sort.test.mjs tests/static-showcase-bond-ui.test.mjs
git commit -m "feat: build sortable bond workbench page"
```

---

### Task 6: Build the end-of-day emerging-market page

**Files:**
- Create: `static-showcase/assets/emerging-page.js`
- Modify: `static-showcase/emerging.html`
- Modify: `static-showcase/assets/app.css`
- Create: `tests/static-showcase-emerging-ui.test.mjs`

- [ ] **Step 1: Write failing UI contract tests**

Assert the page contains:

- `當日成交均價（盤後）`;
- market breadth cards for company count, effective sample, up/down/flat, total volume, and `估算成交金額（盤後）`;
- ranking groups for gainers, decliners, volume, and estimated amount;
- search, industry, application status, and direction filters;
- table columns for code/name, industry, average price, average change, high, low, volume, estimated amount, application status, and data date;
- monthly-revenue view as an explicit page tab or section control;
- 50-row desktop and 25-row mobile pagination.

Assert it does not contain:

```text
即時
最新價
買價
賣價
買量
賣量
WebSocket
自動更新
收盤價
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/static-showcase-emerging-ui.test.mjs
```

Expected: FAIL because the page module is not implemented.

- [ ] **Step 3: Implement the market overview**

Use the normalized public artifact only. Calculate visible counts from the currently selected trading date, and label estimated totals explicitly.

Ranking rules:

```text
漲幅排行: averageChangePercent descending, positive values only
跌幅排行: averageChangePercent ascending, negative values only
成交量排行: transactionVolume descending
估算成交金額排行: estimatedTransactionAmount descending
```

Show at most five records per ranking panel and link each record to its filtered table position.

- [ ] **Step 4: Implement filters, sorting, and pagination**

Persist state in URL parameters:

```text
emerging.html?q=半導體&industry=半導體業&direction=up&sort=transactionVolume&directionSort=desc&page=1
```

Missing values always remain last. Reset page to 1 when a filter changes.

- [ ] **Step 5: Preserve monthly-revenue information**

The second view uses the existing verified `94025` records and keeps revenue fields separate from price fields. Never combine different source dates into one “today” row without showing both dates.

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
node --test tests/static-showcase-emerging-ui.test.mjs tests/emerging-market-view.test.mjs tests/static-showcase-pages.test.mjs
```

Expected: PASS.

Commit:

```powershell
git add static-showcase/emerging.html static-showcase/assets/emerging-page.js static-showcase/assets/app.css tests/static-showcase-emerging-ui.test.mjs
git commit -m "feat: add emerging market close page"
```

---

### Task 7: Move the IPO schedule to an independent page

**Files:**
- Create: `static-showcase/assets/ipo-page.js`
- Modify: `static-showcase/ipo.html`
- Modify: `static-showcase/assets/app.css`
- Create: `tests/static-showcase-ipo-ui.test.mjs`

- [ ] **Step 1: Write failing IPO-page tests**

Assert the page:

- renders the existing approved IPO schedule records;
- retains the established event-order logic;
- provides search, market, status, and year filters;
- supports date sorting in both directions;
- paginates 50 desktop / 25 mobile;
- displays source dates but not source/capture cards.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
node --test tests/static-showcase-ipo-ui.test.mjs
```

Expected: FAIL because the page module is not implemented.

- [ ] **Step 3: Implement URL-backed filtering**

Use:

```text
ipo.html?q=申請&market=上市&status=審議中&year=2026&sort=eventDate&direction=asc&page=1
```

Retain the current IPO timeline presentation logic rather than inventing a new status model.

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
node --test tests/static-showcase-ipo-ui.test.mjs tests/formal-market-data-contract.test.mjs
```

Expected: PASS.

Commit:

```powershell
git add static-showcase/ipo.html static-showcase/assets/ipo-page.js static-showcase/assets/app.css tests/static-showcase-ipo-ui.test.mjs
git commit -m "feat: add independent ipo schedule page"
```

---

### Task 8: Complete responsive styling, contrast, and interaction QA

**Files:**
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/static-showcase-pages.test.mjs`
- Modify: `tests/static-showcase-bond-ui.test.mjs`
- Modify: `tests/static-showcase-emerging-ui.test.mjs`
- Modify: `tests/static-showcase-ipo-ui.test.mjs`

- [ ] **Step 1: Add failing accessibility and responsive assertions**

Test:

- light and dark CSS variables exist for background, surface, text, muted text, border, accent, positive, negative, and focus;
- green is not used for primary background/accent tokens;
- buttons have `:hover`, `:focus-visible`, and disabled states;
- sortable headers are actual buttons;
- table containers do not clip focus rings;
- mobile breakpoints provide cards or controlled overflow without hiding fields.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test tests/static-showcase-pages.test.mjs tests/static-showcase-bond-ui.test.mjs tests/static-showcase-emerging-ui.test.mjs tests/static-showcase-ipo-ui.test.mjs
```

- [ ] **Step 3: Implement the final visual system**

Use:

```css
:root {
  --page: #f5f0e8;
  --surface: #fffaf2;
  --text: #251f21;
  --muted: #665d61;
  --accent: #a94f32;
  --secondary: #72608f;
  --focus: #315eae;
}

[data-theme="dark"] {
  --page: #171416;
  --surface: #211c20;
  --text: #f7f0e8;
  --muted: #c7bac0;
  --accent: #ef916d;
  --secondary: #baa4dc;
  --focus: #8cb6ff;
}
```

Positive and negative colors may be used only for market semantics and must remain readable without relying on color alone.

- [ ] **Step 4: Perform browser visual QA**

Start a low-load local server:

```powershell
$env:UV_THREADPOOL_SIZE='2'
$process = Start-Process node -ArgumentList '--run','dev' -WorkingDirectory (Get-Location) -PassThru -WindowStyle Hidden
$process.PriorityClass = 'BelowNormal'
```

Check every page at:

- 1440 × 900 light;
- 1440 × 900 dark;
- 390 × 844 light;
- 390 × 844 dark.

Verify navigation, sorting, filters, pagination, bond detail/back flow, theme persistence, missing data, and visible focus.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
node --test tests/static-showcase-pages.test.mjs tests/static-showcase-bond-ui.test.mjs tests/static-showcase-emerging-ui.test.mjs tests/static-showcase-ipo-ui.test.mjs
```

Expected: PASS.

Commit:

```powershell
git add static-showcase/assets/app.css tests/static-showcase-pages.test.mjs tests/static-showcase-bond-ui.test.mjs tests/static-showcase-emerging-ui.test.mjs tests/static-showcase-ipo-ui.test.mjs
git commit -m "style: finish accessible market pages"
```

---

### Task 9: Remove the legacy one-page module and verify the production artifact

**Files:**
- Delete: `static-showcase/assets/app.js`
- Modify: `tests/static-showcase.test.mjs`
- Modify: `.github/workflows/deploy-github-pages.yml` only if the tests reveal missing page or data coverage.

- [ ] **Step 1: Add a failing legacy-removal assertion**

```js
assert.equal(await fileExists("static-showcase/assets/app.js"), false);
for (const page of ["index.html", "bonds.html", "emerging.html", "ipo.html", "methodology.html"]) {
  assert.doesNotMatch(await read(page), /assets\/app\.js/);
}
```

- [ ] **Step 2: Delete the unused module**

Delete `static-showcase/assets/app.js` only after `rg "assets/app\\.js|location\\.hash|#bond=" static-showcase tests` confirms every live dependency has been replaced or intentionally updated.

- [ ] **Step 3: Generate a real snapshot**

Run with low-load settings:

```powershell
$env:UV_THREADPOOL_SIZE='2'
$process = Start-Process npm -ArgumentList 'run','snapshot:showcase' -WorkingDirectory (Get-Location) -Wait -PassThru -NoNewWindow
$process.PriorityClass = 'BelowNormal'
if ($process.ExitCode -ne 0) { exit $process.ExitCode }
```

Verify:

- all five HTML files exist;
- `emerging-market.json` has one trading date and unique company codes;
- no published JSON key contains forbidden live fields;
- the manifest references every published artifact;
- no visible text says `官方快照`, `擷取版本`, or labels emerging average as closing price.

- [ ] **Step 4: Run the complete verification suite**

Run:

```powershell
$env:UV_THREADPOOL_SIZE='2'
npm run typecheck
npm run lint
npm test
git diff --check
rg -n "TODO|TBD|placeholder|假資料|測試資料|官方快照|擷取版本|即時價|買價|賣價|#bond=" static-showcase lib scripts tests docs
```

Expected:

- typecheck PASS;
- lint PASS;
- all tests PASS;
- `git diff --check` prints nothing;
- the text scan reports only intentional test assertions or historical documentation, never public-page content.

- [ ] **Step 5: Commit the completed production site**

```powershell
git add static-showcase tests .github/workflows/deploy-github-pages.yml
git commit -m "feat: complete production market site"
```

- [ ] **Step 6: Review before publication**

Use `superpowers:requesting-code-review`, resolve all actionable findings, then rerun Step 4.

- [ ] **Step 7: Publish and verify GitHub Pages**

Push `main`, monitor the `Deploy public showcase to GitHub Pages` workflow, and verify the deployed URLs:

```text
/
/bonds.html
/emerging.html
/ipo.html
/methodology.html
/data/emerging-market.json
```

Do not declare completion until the workflow succeeds and each deployed page returns HTTP 200 with the expected title/content.

---

## Final Acceptance Checklist

- [ ] Five independent public pages are deployed and navigable without hash scrolling.
- [ ] Home title is `可轉債與興櫃盤後資訊`.
- [ ] Home does not show the removed count/date summary strip.
- [ ] Bond table sorts both directions from headers and mobile controls; missing values remain last.
- [ ] Bond detail is a dedicated URL state and contains no repeated source/capture block.
- [ ] Emerging page says `當日成交均價（盤後）`, not closing price.
- [ ] Emerging page contains no real-time, bid/ask, or latest-price fields.
- [ ] Industry is joined only by exact approved company code.
- [ ] Transaction amount is visibly labeled `估算成交金額（盤後）`.
- [ ] IPO schedule preserves the established event logic and is independently filterable.
- [ ] Methodology wording matches the approved professional terminology.
- [ ] Light/dark themes pass contrast and responsive visual inspection.
- [ ] Refresh failure preserves the last verified public artifact.
- [ ] Typecheck, lint, full tests, deployment workflow, and deployed-page smoke checks all pass.
