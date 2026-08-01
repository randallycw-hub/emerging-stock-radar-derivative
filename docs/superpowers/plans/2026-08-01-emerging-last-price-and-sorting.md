# 興櫃最後成交價與完整排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以櫃買中心 `LatestPrice` 在興櫃盤後頁顯示「最後成交價（盤後）」，同時完成盤後行情與月營收欄位排序。

**Architecture:** 核准欄位由來源解析器轉為 `lastTradedPrice`，經過嚴格 domain schema 與市場 view 後寫入靜態快照。公開頁面只讀該快照，盤後行情與月營收各自維護網址化的排序狀態；估算成交金額仍只使用當日成交均價。

**Tech Stack:** TypeScript、Node.js test runner、原生 ES modules、靜態 HTML/CSS、Sites/vinext。

## Global Constraints

- `LatestPrice` 只能標示為「最後成交價（盤後）」，不得稱為收盤價或即時價。
- `Average` 保留為「當日成交均價（盤後）」。
- 估算成交金額維持 `Average × TransactionVolume`。
- 買價、賣價、買賣數量、方向與暫停時間仍不得發布。
- 缺值、`-` 或非有限數值轉為 `null`，不得使用其他價格補值。
- 盤後行情使用 `sort`、`directionSort`；月營收使用 `revenueSort`、`revenueDirectionSort`。
- CPU 密集工作最多使用 2 個執行緒。

---

### Task 1: 核准並驗證最後成交價資料流

**Files:**
- Modify: `tests/source-verification/source-emerging-market.test.mjs`
- Modify: `tests/phase1-1-source-quarantine.test.mjs`
- Modify: `tests/phase2-domain.test.mjs`
- Modify: `tests/emerging-market-view.test.mjs`
- Modify: `tests/refresh-static-showcase-data.test.mjs`
- Modify: `lib/source-verification/source-emerging-market.ts`
- Modify: `lib/domain/types.ts`
- Modify: `lib/domain/schema.ts`
- Modify: `lib/market-data/emerging-market-view.ts`

**Interfaces:**
- Consumes: 櫃買中心來源列 `LatestPrice: string`。
- Produces: `EmergingMarketSourceRow.lastTradedPrice: string | null` 與 `EmergingMarketView.lastTradedPrice: string | null`。

- [ ] **Step 1: 寫入來源解析失敗測試**

```js
assert.equal(row.lastTradedPrice, "25.2");
assert.equal("buyingPrice" in row, false);
assert.equal("sellingPrice" in row, false);
```

- [ ] **Step 2: 執行來源測試並確認因缺少 `lastTradedPrice` 而失敗**

Run: `node --test tests/source-verification/source-emerging-market.test.mjs tests/phase1-1-source-quarantine.test.mjs`

- [ ] **Step 3: 最小化加入來源映射**

```ts
lastTradedPrice: optionalNumeric(source.LatestPrice, "LatestPrice"),
```

- [ ] **Step 4: 寫入 domain 與市場 view 失敗測試**

```js
const base = { ...existingView, lastTradedPrice: "25.2" };
assert.equal(EmergingMarketViewSchema.parse(base).lastTradedPrice, "25.2");
assert.throws(
  () => EmergingMarketViewSchema.parse({ ...base, lastTradedPrice: "2.52e1" }),
  /lastTradedPrice/,
);
```

- [ ] **Step 5: 執行 domain/view 測試並確認預期失敗**

Run: `node --test tests/phase2-domain.test.mjs tests/emerging-market-view.test.mjs`

- [ ] **Step 6: 將欄位穿過型別、schema 與 view，維持原估算公式**

```ts
lastTradedPrice: nullableNonNegativeGroupedDecimal(
  input.lastTradedPrice,
  "EmergingMarketView.lastTradedPrice",
),
```

- [ ] **Step 7: 驗證靜態快照輸出最後成交價且不輸出買賣欄位**

Run: `node --test tests/refresh-static-showcase-data.test.mjs`

- [ ] **Step 8: 提交資料流修改**

```bash
git add lib tests
git commit -m "feat: publish emerging last traded price"
```

### Task 2: 興櫃盤後行情顯示與排序

**Files:**
- Modify: `tests/static-showcase-emerging-ui.test.mjs`
- Modify: `static-showcase/emerging.html`
- Modify: `static-showcase/assets/emerging-page.js`

**Interfaces:**
- Consumes: `row.lastTradedPrice`。
- Produces: 桌面欄位、行動卡片與 `sort=lastTradedPrice` 排序。

- [ ] **Step 1: 寫入 UI 失敗測試**

```js
assert.match(source, /最後成交價（盤後）/);
assert.match(html, /data-market-sort="lastTradedPrice"/);
assert.match(js, /row\.lastTradedPrice/);
assert.match(js, /emptyRow\(11/);
```

- [ ] **Step 2: 執行 UI 測試並確認欄位尚不存在**

Run: `node --test tests/static-showcase-emerging-ui.test.mjs`

- [ ] **Step 3: 在均價前加入可排序欄位與行動卡片內容**

```html
<th aria-sort="none"><button type="button" data-market-sort="lastTradedPrice" data-sort-type="number">最後成交價（盤後） <span aria-hidden="true"></span></button></th>
```

- [ ] **Step 4: 更新空表格欄數及頁首說明**

```js
emptyRow(11, "目前沒有可顯示的盤後市場資料")
```

- [ ] **Step 5: 執行 UI 測試並確認通過**

Run: `node --test tests/static-showcase-emerging-ui.test.mjs tests/static-showcase-pages.test.mjs`

- [ ] **Step 6: 提交盤後 UI 修改**

```bash
git add static-showcase tests/static-showcase-emerging-ui.test.mjs
git commit -m "feat: show sortable emerging last price"
```

### Task 3: 月營收獨立排序

**Files:**
- Modify: `tests/static-showcase-emerging-ui.test.mjs`
- Modify: `static-showcase/emerging.html`
- Modify: `static-showcase/assets/emerging-page.js`

**Interfaces:**
- Consumes: 月營收八個既有欄位。
- Produces: `revenueSort` 與 `revenueDirectionSort` URL 狀態、可排序表頭及無值置後排序。

- [ ] **Step 1: 寫入月營收排序失敗測試**

```js
assert.match(html, /data-revenue-sort="monthRevenue"/);
assert.match(js, /revenueSort/);
assert.match(js, /revenueDirectionSort/);
assert.match(js, /data-revenue-sort/);
```

- [ ] **Step 2: 執行測試並確認月營收排序尚未實作**

Run: `node --test tests/static-showcase-emerging-ui.test.mjs`

- [ ] **Step 3: 加入獨立狀態、表頭事件與排序**

```js
revenueSortKey: "companyCode",
revenueSortDirection: "asc",
```

月營收表頭分別使用 `text` 或 `number` 型別呼叫既有 `sortRows`，點擊同欄位切換方向，並更新 `aria-sort`。

- [ ] **Step 4: 將月營收排序狀態寫入網址並在返回頁面時還原**

```js
if (state.revenueSortKey !== "companyCode") params.set("revenueSort", state.revenueSortKey);
if (state.revenueSortDirection !== "asc") params.set("revenueDirectionSort", state.revenueSortDirection);
```

- [ ] **Step 5: 執行 UI 測試並確認兩套排序參數互不覆蓋**

Run: `node --test tests/static-showcase-emerging-ui.test.mjs`

- [ ] **Step 6: 提交月營收排序修改**

```bash
git add static-showcase tests/static-showcase-emerging-ui.test.mjs
git commit -m "feat: sort emerging monthly revenue"
```

### Task 4: 正式資料、全套驗證與發布

**Files:**
- Modify: `static-showcase/data/**`（由正式快照指令產生）
- Modify: `dist/**`（由建置產生，不手動編輯）

**Interfaces:**
- Consumes: 櫃買中心正式盤後資料與既有正式月營收資料。
- Produces: 驗證完成並發布的 Sites 版本。

- [ ] **Step 1: 重新擷取正式資料**

Run: `npm run snapshot:showcase`

- [ ] **Step 2: 核對同一筆資料的最後成交價與均價**

確認 2026-07-31 富味鄉的 `lastTradedPrice` 為 `26.25`，`dailyAveragePrice` 為 `25.55`，且估算成交金額仍為均價乘成交量。

- [ ] **Step 3: 執行完整驗證**

Run: `npm run test:showcase`

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm run build`

- [ ] **Step 4: 打包並發布成功建置**

依 `sites-hosting` 使用既有 `.openai/hosting.json` 專案，儲存新版本、部署並輪詢至成功。

- [ ] **Step 5: 核對公開網址**

在公開興櫃頁確認「最後成交價（盤後）」與月營收排序表頭已出現，網址排序狀態可保留。

