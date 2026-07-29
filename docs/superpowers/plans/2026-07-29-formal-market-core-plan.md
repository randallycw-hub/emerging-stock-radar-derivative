# Formal Market Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 完成可在本機運作的正式市場核心，讓興櫃、可轉債與 IPO 時程具備完整欄位、清楚來源與可操作的查詢介面。

**Architecture:** 沿用現有 Next/Vinext app、`lib/preview` 與 pipeline read model，不重寫既有資料管線。先建立穩定的展示資料契約與格式化層，再讓市場頁、興櫃頁、可轉債頁與 IPO 頁共用查詢與狀態元件；所有資料缺失與日期規則在資料層統一處理。

**Tech Stack:** Next 16、React 19、TypeScript、Vinext、Node test runner、現有 pipeline adapters/read models。

## Global Constraints

- 興櫃資料只顯示收盤價，不得在 UI 宣稱即時行情。
- 每個價格、利率、金額、事件日期必須有資料日期或明確顯示「—」。
- 深色與淺色主題都必須維持可讀對比；不能以顏色作為唯一狀態訊號。
- 不在本階段新增 Cloudflare、遠端 D1 或即時行情串接。
- CPU 密集型工作使用低負載，測試與建置不得刻意佔滿全部核心。

---

### Task 1: 建立市場資料契約與格式化層

**Files:**
- Modify: `lib/preview/types.ts`
- Modify: `lib/preview/format.ts`
- Modify: `lib/preview/data.ts`
- Create: `tests/formal-market-data-contract.test.mjs`

**Interfaces:**
- `MarketBondRow`、`EmergingMarketRow`、`IpoScheduleRow` 保持可被頁面直接消費。
- 新增 `formatPrice`, `formatPercent`, `formatAmount`, `formatDateOrDash`，缺值回傳 `—`。
- 資料列的價格欄位以 `closePrice` 命名，禁止新增 `realtimePrice` 到興櫃展示資料。

- [ ] **Step 1: Write the failing test**

```js
test('興櫃列只接受收盤價並保留資料日期', async () => {
  const { normalizeEmergingRow } = await import('../lib/preview/data.ts');
  const row = normalizeEmergingRow({ code: '6543', name: '測試公司', closePrice: 42.5, asOf: '2026-07-29' });
  assert.equal(row.closePrice, 42.5);
  assert.equal(row.priceLabel, '收盤價');
  assert.equal(row.asOf, '2026-07-29');
  assert.equal('realtimePrice' in row, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/formal-market-data-contract.test.mjs`
Expected: FAIL because the normalizer and formatting contract are not defined.

- [ ] **Step 3: Write minimal implementation**

在 `lib/preview/types.ts` 定義三種展示列與來源欄位；在 `lib/preview/data.ts` 加入正規化函式；在 `lib/preview/format.ts` 統一數值、日期與缺值格式，並讓既有預覽資料透過正規化函式輸出。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/formal-market-data-contract.test.mjs`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/preview/types.ts lib/preview/format.ts lib/preview/data.ts tests/formal-market-data-contract.test.mjs
git commit -m "feat: define formal market display contracts"
```

### Task 2: 建立共用查詢與資料狀態元件

**Files:**
- Create: `app/dev-preview/_components/MarketFilters.tsx`
- Create: `app/dev-preview/_components/DataFreshness.tsx`
- Modify: `app/dev-preview/_components/PreviewSearch.tsx`
- Modify: `app/dev-preview/preview.css`
- Create: `tests/formal-market-interactions.test.mjs`

**Interfaces:**
- `MarketFilters` 接收 `onQueryChange`, `onTypeChange`, `onDateChange` 與目前值，輸出可序列化篩選狀態。
- `DataFreshness` 接收 `{ asOf, sourceLabel, sourceUrl }`，缺日期時顯示「資料日期未知」。

- [ ] **Step 1: Write the failing test**

```js
test('資料新鮮度元件會顯示日期與來源', async () => {
  const html = await renderPreview('/dev-preview');
  assert.match(html, /資料日期/);
  assert.match(html, /資料來源/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/formal-market-interactions.test.mjs`
Expected: FAIL because the shared freshness contract is not rendered on all market sections.

- [ ] **Step 3: Write minimal implementation**

建立可重用的篩選列與資料新鮮度元件，加入鍵盤可操作的 select/input、清除篩選按鈕、狀態文字與高對比 focus 樣式；在 `preview.css` 為深／淺色主題補足文字、邊框與按鈕對比。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/formal-market-interactions.test.mjs`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add app/dev-preview/_components app/dev-preview/preview.css tests/formal-market-interactions.test.mjs
git commit -m "feat: add shared market filters and freshness states"
```

### Task 3: 完成市場總覽、興櫃與 IPO 頁面

**Files:**
- Modify: `app/dev-preview/page.tsx`
- Modify: `app/dev-preview/emerging/page.tsx`
- Modify: `app/dev-preview/emerging/[companyId]/page.tsx`
- Modify: `app/dev-preview/ipo/page.tsx` (create if missing)
- Modify: `lib/preview/dashboard.ts`
- Create: `tests/formal-market-pages.test.mjs`

**Interfaces:**
- 頁面只消費 Task 1 的展示列與 Task 2 的狀態元件。
- IPO 頁面以原有「時程」邏輯排序：即將發生事件優先，同日依事件類型與公司代號穩定排序。

- [ ] **Step 1: Write the failing test**

```js
test('興櫃頁顯示收盤價而非即時行情', async () => {
  const html = await renderPreview('/dev-preview/emerging');
  assert.match(html, /收盤價/);
  assert.doesNotMatch(html, /即時行情/);
});

test('IPO 頁依事件日期升冪顯示時程', async () => {
  const html = await renderPreview('/dev-preview/ipo');
  assert.ok(html.indexOf('2026-08-01') < html.indexOf('2026-08-15'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/formal-market-pages.test.mjs`
Expected: FAIL for missing labels, route data, or ordering.

- [ ] **Step 3: Write minimal implementation**

把市場摘要改成可點擊卡片，興櫃頁加入橫向資訊表、篩選與資料來源列；公司明細頁加入收盤價摘要、基本資料與來源；建立或補齊 IPO 時程頁，沿用原時程排序並顯示事件狀態、公司、日期與資料來源。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/formal-market-pages.test.mjs`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add app/dev-preview/page.tsx app/dev-preview/emerging app/dev-preview/ipo lib/preview/dashboard.ts tests/formal-market-pages.test.mjs
git commit -m "feat: complete emerging stock and IPO preview pages"
```

### Task 4: 完成可轉債橫式表格與明細

**Files:**
- Modify: `app/dev-preview/bonds/page.tsx`
- Modify: `app/dev-preview/bonds/[bondId]/page.tsx`
- Modify: `app/dev-preview/preview.css`
- Create: `tests/formal-bond-pages.test.mjs`

**Interfaces:**
- 表格欄位順序固定為：代號、名稱、發行日、到期日、票面利率、轉換價格、轉換期間、發行總額、流通餘額、收盤價、轉換價值、溢價率、資料日期、來源。
- 明細頁使用同一筆 `MarketBondRow`，不重複建立另一套欄位名稱。

- [ ] **Step 1: Write the failing test**

```js
test('可轉債表格包含完整交易欄位', async () => {
  const html = await renderPreview('/dev-preview/bonds');
  for (const label of ['票面利率', '轉換價格', '流通餘額', '收盤價', '轉換價值', '溢價率', '資料日期']) {
    assert.match(html, new RegExp(label));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/formal-bond-pages.test.mjs`
Expected: FAIL for one or more missing headers.

- [ ] **Step 3: Write minimal implementation**

改為寬版可捲動資料表，桌面版增加欄寬與 sticky code/name 欄，小螢幕保留水平捲動但不壓縮文字；明細頁分為條款、交易摘要、事件時間軸與來源區塊；所有數值使用 Task 1 格式化器。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/formal-bond-pages.test.mjs`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add app/dev-preview/bonds app/dev-preview/preview.css tests/formal-bond-pages.test.mjs
git commit -m "feat: complete convertible bond table and details"
```

### Task 5: 全量驗證與本機正式版交付

**Files:**
- Modify: `README.md`
- Modify: `tests/formal-market-pages.test.mjs` if verification exposes a contract mismatch

- [ ] **Step 1: Run focused tests**

Run: `node --test tests/formal-market-data-contract.test.mjs tests/formal-market-interactions.test.mjs tests/formal-market-pages.test.mjs tests/formal-bond-pages.test.mjs`
Expected: PASS。

- [ ] **Step 2: Run project checks**

Run: `npm run typecheck; npm run lint; npm test`
Expected: all commands exit 0。

- [ ] **Step 3: Run local production preview**

Run: `npm run build; npm run start`
Expected: production server starts without runtime errors; verify `/dev-preview`, `/dev-preview/emerging`, `/dev-preview/bonds`, and `/dev-preview/ipo` return HTTP 200。

- [ ] **Step 4: Document local formal-version commands**

在 `README.md` 加入 `npm install`, `npm run dev`, `npm run build`, `npm run start` 與四個正式核心路由，明確標示 GitHub Pages 是靜態展示版。

- [ ] **Step 5: Commit**

```bash
git add README.md tests
git commit -m "docs: document formal local preview and verification"
```
