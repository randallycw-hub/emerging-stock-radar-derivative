# V5.7 Precision Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 V5.6 稽核的資料語義問題，讓興櫃、IPO 與 CB 研究頁由同一份可驗證公開資料提供完整且收斂的研究資訊。

**Architecture:** 將 null、未公布、最後成交與正式值的語義置於 generation 衍生層與共用 formatter，再由前台專用 view model 呈現。避免頁面重算或跨欄位 fallback，並以 Node 單元測試及可重現的 desktop/mobile browser QA 作為發布 gate。

**Tech Stack:** Node 22、TypeScript、靜態 ES modules、Vinext、Node test runner、Playwright（QA only）。

**Spec:** `docs/superpowers/specs/2026-08-31-v57-precision-fixes-design.md`

## Global Constraints

- 依使用者提供的 V5.7 PDF 固定順序完成 P0 → P1 → P2 → Mobile QA → 公開部署驗收。
- Canonical source 僅限 TWSE、TPEx、MOPS、TDCC、SFB 與其可驗證衍生資料；禁止 Yahoo、券商、CBAS、CyclesInvest、TheFew。
- `0`、缺值、待公告、抓取失敗、今日無成交與最後成交必須分別表示；公開頁不輸出工程診斷或私有流程名稱。
- 搜尋行為凍結，只加入 2303、聯電、23031、3313、斐成、80426、99999999 的回歸測試。
- CPU 密集命令使用最多兩個測試 worker，Windows 程序設為低於正常優先權。
- 不變更既有 Sites project ID；完成前必須有公開頁 Before/After 證據與完整發布後驗收。

---

### Task 1: 建立 V5.7 語義與資料契約測試基礎

**Files:**
- Create: `tests/v57-data-semantics.test.mjs`
- Create: `lib/market-data/v57-semantics.ts`
- Test: `tests/v57-data-semantics.test.mjs`

**Interfaces:**
- Produces: `normalizeIpoPublicPrice(value, stage)`, `resolveTradeState({ latestTradeDate, dataDate, lastPrice, lastVolume })`, `calculateRollingMetrics(points)`。
- Consumes: ISO 日期與現有 V5.6 `calculatePeriodReturn`。

- [ ] **Step 1: 寫出價格、交易狀態與不足樣本的失敗測試。**

```js
assert.equal(normalizeIpoPublicPrice(0, "unpublished"), null);
assert.equal(normalizeIpoPublicPrice(56, "final"), 56);
assert.deepEqual(resolveTradeState({ latestTradeDate: "2026-08-11", dataDate: "2026-08-28", lastPrice: 196, lastVolume: 1 }), {
  state: "NO_TRADE_TODAY", lastTradeDate: "2026-08-11", lastPrice: 196, lastVolume: 1,
});
assert.equal(calculateRollingMetrics([{ date: "2026-08-28", volume: 10 }]).average5, null);
```

- [ ] **Step 2: 執行測試，確認因 module/export 不存在而失敗。**

Run: `node --test --test-concurrency=2 tests/v57-data-semantics.test.mjs`

- [ ] **Step 3: 以最小 immutable helper 實作語義函式。**

```ts
export function resolveTradeState(input: TradeInput): TradeState {
  if (!isIsoDate(input.dataDate) || !isIsoDate(input.latestTradeDate)) return { state: "DATA_ERROR", ...emptyLastTrade };
  return { state: input.latestTradeDate === input.dataDate ? "TRADED_TODAY" : "NO_TRADE_TODAY", ...lastTrade(input) };
}
```

- [ ] **Step 4: 重跑測試，確認 P0 基礎函式通過。**

Run: `node --test --test-concurrency=2 tests/v57-data-semantics.test.mjs`

### Task 2: 修正 IPO 未公告價格 0 元

**Files:**
- Modify: `static-showcase/assets/ipo-offering-page.js`
- Modify: `tests/static-showcase-ipo-offering.test.mjs`
- Test: `tests/v57-data-semantics.test.mjs`

**Interfaces:**
- Consumes: `normalizeIpoPublicPrice`。
- Produces: `projectPublicOfferings()` 的 `underwritingPrice: number | null`，以及 `priceValue()` 的「待公告」。

- [ ] **Step 1: 新增投影測試，證明 0 未公布價格目前會產生錯誤的 `0 元`。**

```js
const rows = projectPublicOfferings(snapshotWithUnpublishedZero);
assert.equal(rows.find((row) => row.companyCode === "7825").underwritingPrice, null);
assert.match(renderedOfferingHtml, /待公告/);
assert.doesNotMatch(renderedOfferingHtml, /7825[\\s\\S]*0 元/);
```

- [ ] **Step 2: 執行指定測試並確認 RED。**

Run: `node --test --test-concurrency=2 tests/static-showcase-ipo-offering.test.mjs tests/v57-data-semantics.test.mjs`

- [ ] **Step 3: 分別處理 final、provisional、minimumBid 三種欄位，僅呈現該欄位已發布的正值。**

```js
function offeringPrice(record, facts) {
  if (!facts) return null;
  return normalizeIpoPublicPrice(record.finalUnderwritingPrice, "final")
    ?? normalizeIpoPublicPrice(record.provisionalUnderwritingPrice, "provisional");
}
function priceValue(value) { return value === null ? "待公告" : `${formatNumber(value)} 元`; }
```

- [ ] **Step 4: 掃描整份 IPO fixture / 已發布 model，確定無不合法價格 0。**

Run: `node --test --test-concurrency=2 tests/static-showcase-ipo-offering.test.mjs tests/v57-data-semantics.test.mjs`

### Task 3: 修正 CB 與興櫃的今日成交日期語義

**Files:**
- Modify: `static-showcase/assets/cb-workbench-v53.js`
- Modify: `static-showcase/assets/cb-detail-v53.js`
- Modify: `static-showcase/assets/emerging-market-display.js`
- Modify: `tests/v56-cb-detail.test.mjs`
- Modify: `tests/static-showcase-v53-cb-detail-stats.test.mjs`
- Create: `tests/v57-cb-trade-state.test.mjs`

**Interfaces:**
- Consumes: `resolveTradeState`。
- Produces: quote `snapshotDataDate`, `latestTradeDate`, `lastPrice`, `lastVolume`, `tradeState` 和詳情頁最後成交資訊。

- [ ] **Step 1: 寫出 80426 與同日成交 CB 的 RED 測試。**

```js
assert.match(renderCbDetailV53(record80426), /今日無成交/);
assert.match(renderCbDetailV53(record80426), /最後成交日.*2026\/08\/11/);
assert.match(renderCbDetailV53(record80426), /196/);
assert.match(renderCbDetailV53(recordTradedToday), /今日有成交/);
```

- [ ] **Step 2: 先執行測試，確認原實作把最後成交當作今日。**

Run: `node --test --test-concurrency=2 tests/v57-cb-trade-state.test.mjs`

- [ ] **Step 3: 以 snapshot dataDate 決定交易狀態，從 verified history 保存最後成交資料與 20 日成交日數。**

```js
const trade = resolveTradeState({ latestTradeDate, dataDate, lastPrice, lastVolume });
return { snapshotDataDate: dataDate, latestTradeDate: trade.lastTradeDate, tradeState: trade.state, lastPrice: trade.lastPrice, lastVolume: trade.lastVolume };
```

- [ ] **Step 4: 於 CB 詳情、列表摘要與興櫃無成交 label 使用相同 state，重跑測試。**

Run: `node --test --test-concurrency=2 tests/v57-cb-trade-state.test.mjs tests/v56-cb-detail.test.mjs tests/static-showcase-v53-cb-detail-stats.test.mjs`

### Task 4: 將 CB 發行頁限定為真正的進行中案件

**Files:**
- Modify: `static-showcase/assets/cb-workbench-v53.js`
- Modify: `static-showcase/assets/bond-issuance-page.js`
- Modify: `static-showcase/bonds-issuance.html`
- Modify: `tests/static-showcase-v53-cb-pages.test.mjs`
- Create: `tests/v57-issuance-pipeline.test.mjs`

**Interfaces:**
- Produces: issuance `{ issuanceStatus, stages, currentStage }`，其中 stage 只包含公告、送件、生效、詢圈/競拍、定價、掛牌。

- [ ] **Step 1: 新增 RED 測試，禁止公開 model、HTML、篩選器含 `CBAS`，並排除已完成的歷史掛牌 CB。**

```js
assert.doesNotMatch(html + JSON.stringify(model.issuance), /CBAS/);
assert.equal(activePipeline.some((row) => row.cbCode === "historicalListed"), false);
assert.equal(activePipeline.some((row) => row.issuanceStatus === "upcoming"), true);
```

- [ ] **Step 2: 執行 issuance 測試確認 RED。**

Run: `node --test --test-concurrency=2 tests/v57-issuance-pipeline.test.mjs tests/static-showcase-v53-cb-pages.test.mjs`

- [ ] **Step 3: 移除 `asoDate`、依官方日期建立 active/upcoming/recent_listing 分類，並保留 query/stage/sort URL state。**

```js
const issuanceStatus = listingDate && listingDate < dataDate ? "historical" : listingDate ? "recent_listing" : confirmedStage ? "active" : "unavailable";
const publicIssuance = issuance.filter((item) => item.issuanceStatus !== "historical");
```

- [ ] **Step 4: 驗證公開 pipeline 不會產生假的「待公告」串列。**

Run: `node --test --test-concurrency=2 tests/v57-issuance-pipeline.test.mjs tests/static-showcase-v53-cb-pages.test.mjs`

### Task 5: 擴充 V5.7 衍生績效資料集

**Files:**
- Modify: `scripts/stage-static-showcase.mjs`
- Modify: `static-showcase/assets/v56-market-data.js`
- Create: `lib/market-data/v57-performance.ts`
- Create: `tests/v57-performance-dataset.test.mjs`

**Interfaces:**
- Produces: `performance.records` 的 `entityType: cb | emerging | ipo`；每筆附 `dataDate`、periods、sample dates、numerator/denominator。
- Consumes: verified generation history、TPEx emerging daily rows、TWSE/TPEx stock closes、實際 IPO offer price。

- [ ] **Step 1: 寫出 RED 測試，要求 emerging/IPO 欄位不足時為 null、期間起點為有效交易日、IPO 不以最低投標價取代承銷價。**

```js
assert.equal(record.periods["6M"], null);
assert.equal(record.bases["1W"].tradeDate, "2026-08-21");
assert.equal(ipoWithoutFinalPrice.periods.sinceListing, null);
```

- [ ] **Step 2: 執行測試確認 V5.6 僅有 CB records。**

Run: `node --test --test-concurrency=2 tests/v57-performance-dataset.test.mjs tests/v56-performance.test.mjs`

- [ ] **Step 3: 由 verified generation 與正式日行情累積 price/volume history，保留計算版本、資料日與分母。**

```ts
export type V57DerivedMetric = Readonly<{ value: number | null; numerator: number | null; denominator: number | null; sourceDates: readonly string[] }>;
```

- [ ] **Step 4: 對至少 20 檔興櫃、10 檔已掛牌 IPO fixture 重新計算並驗證。**

Run: `node --test --test-concurrency=2 tests/v57-performance-dataset.test.mjs tests/v56-performance.test.mjs`

### Task 6: 將興櫃價格與成交排行改為 Performance / Liquidity 研究工具

**Files:**
- Modify: `static-showcase/assets/emerging-page.js`
- Modify: `static-showcase/emerging.html`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/static-showcase-emerging.test.mjs`
- Create: `tests/v57-emerging-ui.test.mjs`

**Interfaces:**
- Consumes: V5.7 performance records by `stockCode`。
- Produces: price 欄位 `今日/1W/1M/3M/6M/YTD/成交額`；volume 欄位 `5D/20D/量比/20D平均成交額/成交額異動`。

- [ ] **Step 1: 新增兩個 view 的欄位、URL sort state 和 `—` 缺值 RED 測試。**

```js
assert.match(html, /1W.*1M.*3M.*6M.*YTD/);
assert.match(html, /5D均量.*20D均量.*量比.*20D平均成交額/);
assert.deepEqual(parseEmergingState("?view=volume&sort=volumeRatio&directionSort=desc").sortKey, "volumeRatio");
```

- [ ] **Step 2: 執行 emerging 指定測試確認 RED。**

Run: `node --test --test-concurrency=2 tests/v57-emerging-ui.test.mjs tests/static-showcase-emerging.test.mjs`

- [ ] **Step 3: 將兩種 table schema、sort types、mobile cards 和 accessible heading 綁定同一 V5.7 model。**

- [ ] **Step 4: 重新驗證 price/volume URL、無成交與不足樣本語義。**

Run: `node --test --test-concurrency=2 tests/v57-emerging-ui.test.mjs tests/static-showcase-emerging.test.mjs`

### Task 7: 補齊 IPO 掛牌後績效

**Files:**
- Modify: `static-showcase/assets/ipo-page.js`
- Modify: `static-showcase/ipo.html`
- Modify: `static-showcase/assets/app.css`
- Create: `tests/v57-ipo-performance-ui.test.mjs`

**Interfaces:**
- Consumes: `performance.records` entityType `ipo`。
- Produces: 已掛牌列的實際承銷價、最新價、5D、20D、1M、掛牌以來與掛牌日，且 URL sort state 可還原。

- [ ] **Step 1: 寫出實際承銷價、尚無交易資料與 sort URL 的 RED 測試。**

```js
assert.match(renderedHtml, /實際承銷價.*掛牌以來/);
assert.match(rowWithoutMarketData, /尚無掛牌後交易資料/);
assert.equal(rowWithMinimumBidOnly.sinceListing, null);
```

- [ ] **Step 2: 執行 IPO performance 測試確認 RED。**

Run: `node --test --test-concurrency=2 tests/v57-ipo-performance-ui.test.mjs`

- [ ] **Step 3: 保留 lifecycle，新增已掛牌 research view 與合法欄位 formatter。**

- [ ] **Step 4: 重跑 IPO lifecycle 與 performance tests。**

Run: `node --test --test-concurrency=2 tests/v57-ipo-performance-ui.test.mjs tests/static-showcase-ipo-ui.test.mjs tests/static-showcase-ipo-radar.test.mjs`

### Task 8: CB 轉換價歷史、事件去重與熱力圖收斂

**Files:**
- Modify: `static-showcase/assets/cb-workbench-v53.js`
- Modify: `static-showcase/assets/cb-detail-v53.js`
- Modify: `static-showcase/assets/cb-workbench-ui.js`
- Modify: `static-showcase/assets/lightweight-charts-adapter.js`
- Modify: `tests/conversion-price-history.test.mjs`
- Create: `tests/v57-cb-detail-history.test.mjs`

**Interfaces:**
- Produces: `conversionPriceHistory[]` records with announcement/effective/old/new/reason/source URL/derived, de-duplicated canonical events, and chart markers.

- [ ] **Step 1: 新增 RED 測試，要求轉換價表欄位、同日合併 marker、80426 流動性文案及無堆疊 heatmap labels。**

```js
assert.match(detail, /轉換價歷程.*舊轉換價.*新轉換價.*官方公告/);
assert.equal(markers.filter((item) => item.date === "2026-08-11").length, 1);
assert.match(detail, /近 20 交易日有成交 \d+ 日/);
assert.doesNotMatch(heatmapHtml, /data-heatmap-label.*data-heatmap-label/);
```

- [ ] **Step 2: 執行 CB history 測試確認 RED。**

Run: `node --test --test-concurrency=2 tests/v57-cb-detail-history.test.mjs tests/conversion-price-history.test.mjs`

- [ ] **Step 3: 只投影可驗證的 TDCC/MOPS/TPEx 歷程，並以 canonical event key 合併事件和 marker。**

- [ ] **Step 4: 預設 heatmap 僅保留 Top N/selected label，完成測試。**

Run: `node --test --test-concurrency=2 tests/v57-cb-detail-history.test.mjs tests/conversion-price-history.test.mjs tests/v56-cb-detail.test.mjs`

### Task 9: 收斂首頁與市場事件頁

**Files:**
- Modify: `static-showcase/index.html`
- Modify: `static-showcase/assets/home-page.js`
- Modify: `static-showcase/events.html`
- Modify: `static-showcase/assets/market-events-page.js`
- Modify: `static-showcase/assets/app.css`
- Create: `tests/v57-events-ui.test.mjs`

**Interfaces:**
- Consumes: verified snapshot diff and canonical events.
- Produces: 首頁「今天有哪些變化／接下來 7 天」、dedupe key、range/type/market/page URL state。

- [ ] **Step 1: 寫出首頁不重複 event、事件首屏最多 30 筆與 Load more URL state 的 RED 測試。**

```js
assert.match(home, /今天有哪些變化/);
assert.match(home, /接下來 7 天/);
assert.equal(renderEvents({ range: "7" }).visible.length <= 30, true);
assert.equal(eventKeys.size, renderedEvents.length);
```

- [ ] **Step 2: 執行事件測試確認 RED。**

Run: `node --test --test-concurrency=2 tests/v57-events-ui.test.mjs tests/static-showcase-ux2-events.test.mjs`

- [ ] **Step 3: 以 canonical id 或 entity/type/effective date 去重，並實作預設 7 日 + 分頁/Load more。**

- [ ] **Step 4: 重跑事件與 snapshot diff 回歸測試。**

Run: `node --test --test-concurrency=2 tests/v57-events-ui.test.mjs tests/v56-daily-changes.test.mjs tests/static-showcase-ux2-events.test.mjs`

### Task 10: 搜尋回歸與可重現 Browser QA

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/v57-browser-qa.mjs`
- Create: `tests/v57-search-regression.test.mjs`
- Create: `tests/v57-browser-qa.test.mjs`

**Interfaces:**
- Produces: `npm run qa:v57`，接受 `BASE_URL` 並生成 1440×1000、390×844 的指定頁面截圖。

- [ ] **Step 1: 寫出 7 組搜尋回歸及 viewport 目錄/檔名 RED 測試。**

```js
for (const [query, expected] of searchCases) assert.deepEqual(search(query).map((row) => row.href), expected);
assert.deepEqual(V57_VIEWPORTS.mobile, { width: 390, height: 844 });
```

- [ ] **Step 2: 執行測試並確認新 QA script 尚不存在。**

Run: `node --test --test-concurrency=2 tests/v57-search-regression.test.mjs tests/v57-browser-qa.test.mjs`

- [ ] **Step 3: 安裝鎖定版本的 Playwright test dependency，加入低並行 QA script，不改搜尋實作。**

```json
"qa:v57": "node scripts/v57-browser-qa.mjs"
```

- [ ] **Step 4: 在本機 build 後啟動站台，以兩種 viewport 寫出 PDF 指定 Before/After 檔名並驗證檔案存在。**

Run: `node --test --test-concurrency=2 tests/v57-search-regression.test.mjs tests/v57-browser-qa.test.mjs`

### Task 11: 建立 V5.7 驗收證據與發布 gate

**Files:**
- Create: `audit-v57/V57_FIX_REPORT.md`
- Create: `audit-v57/V57_FEATURE_MATRIX.csv`
- Create: `audit-v57/V57_DATA_QA.csv`
- Create: `audit-v57/V57_REGRESSION_RESULTS.md`
- Create: `audit-v57/screenshots-before/`
- Create: `audit-v57/screenshots-after/`

**Interfaces:**
- Consumes: unit results、build、typecheck、lint、desktop/mobile screenshot output、公開 URL。
- Produces: V5.7 DoD matrix with PASS/FAIL evidence; no internal source diagnostics in product UI.

- [ ] **Step 1: 建立每一條 DoD 的初始 matrix 與 Before 截圖清單。**

- [ ] **Step 2: 執行完整驗證。**

Run: `npm run build && node --test --test-concurrency=2 && npm run typecheck && npm run lint && npm run qa:v57`

- [ ] **Step 3: 對公開部署 URL 重跑 `qa:v57`，檢查每張桌機/手機截圖沒有溢出、截斷或重複。**

- [ ] **Step 4: 完成 V57 report、matrix、data QA、regression results，只有所有 P0/P1/P2、mobile、search、deployment 都有 fresh PASS evidence 時才標示 COMPLETE。**

