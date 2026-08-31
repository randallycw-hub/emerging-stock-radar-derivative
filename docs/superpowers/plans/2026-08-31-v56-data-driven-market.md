# V5.6 資料驅動市場前台實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將現有公開市場資訊站升級為以官方有效資料快照驅動的每日異動、跨市場績效、價格與事件研究工具。

**Architecture:** 所有前台讀取由公開 generation 產生的 V5.6 canonical read model。資料管線只接受 TWSE、TPEx、MOPS、TDCC、SFB 的已核准來源；快照差異僅比較兩份通過 schema 與 record-count 驗證的有效資料，擷取失敗沿用 last-known-good。前端以同一份資料供首頁、CB、興櫃、IPO、公司與搜尋使用。

**Tech Stack:** Node.js ESM、TypeScript 來源驗證、靜態 HTML/CSS/JavaScript、TradingView Lightweight Charts 5.x、Node test runner、Vinext Sites。

**Spec:** `C:/Users/USER/Desktop/台灣盤後市場資訊台_V5.6_資料驅動前台_每日異動_市場表現_價格與事件_Codex完整執行規格 (1).pdf`

## Global Constraints

- 僅使用官方 TWSE／TPEx／MOPS／TDCC／SFB 資料；禁止 Yahoo、券商、CBAS 或第三方數值成為 canonical source。
- 任何預定公開模組須先有已驗證資料與 fallback；未知資料保留 `null`，前台顯示 `—`、`待公布`、`待定`、`今日無成交` 或 `資料暫時無法取得`，不得轉為 0。
- 前台不顯示 API、來源 ID、雜湊、內部來源狀態、缺漏原因或 QA 診斷；重要事件可提供 allowlist 官方公告連結。
- 價格歷史與績效只使用有效交易日；期間不足時以 `—` 表示。CB／標的／轉換價不同資料日不得強行計算。
- 不顯示 RSI、MACD、KD、BOLL、MA 或任何買賣／預測訊號。圖表僅為官方 OHLCV、成交量與事件標記。
- 官方擷取維持單一明細請求與最多兩個一般併發工作；建置與測試使用不超過兩個工作執行緒並以低於正常優先權執行。
- 每個公開頁面共用 canonical dataset；外部 URL 需 allowlist、HTML escape、`noopener noreferrer`。

---

### Task 1: V5.6 Canonical contract、null semantics 與來源覆蓋

**Files:**
- Create: `static-showcase/assets/v56-market-data.js`
- Create: `tests/v56-market-data.test.mjs`
- Modify: `docs/data-source-registry.md`
- Modify: `lib/pipeline/source-registry.ts`

**Interfaces:**
- `buildV56MarketData({ manifest, masters, history, workbench, emerging, ipo, rightsEvents, previous })` 回傳 `{ schemaVersion: 3, dataDate, securityMaster, priceHistory, cbMaster, cbEvents, ipoPipeline, dailyChanges, performance, searchIndex, meta }`。
- `displayFinancialValue(value, context)` 只把已驗證的 `0` 顯示為 `0`；`null` 依語意回傳 `—`、`待公布`、`待定` 或 `今日無成交`。

- [ ] **Step 1: 寫失敗測試**

```js
test('V5.6 model preserves missing values and emits a canonical stock-to-CB relation', () => {
  const model = buildV56MarketData({ manifest, masters, history: [], workbench, emerging, ipo: [], rightsEvents: null, previous: null });
  assert.equal(model.cbMaster.records[0].currentConversionPrice, null);
  assert.equal(model.securityMaster.records[0].relatedCbCodes[0], '23032');
  assert.equal(displayFinancialValue(null, 'undetermined'), '待定');
});
```

- [ ] **Step 2: 確認測試因 V5.6 export 缺失而失敗**

Run: `node --test --test-concurrency=2 tests/v56-market-data.test.mjs`

- [ ] **Step 3: 實作最小 canonical projection 與資料來源對照**

```js
const record = Object.freeze({
  securityId: `stock:${stockCode}`, stockCode, name, market, industry, status,
  relatedCbCodes, dataDate,
});
// 所有欄位先檢查 isFiniteNumber；未核對或缺值一律為 null，不使用 || 0。
```

將 OHLCV、CB 日價、事件、轉換價歷史與 IPO pipeline 的必填欄位寫入內部 contract，並在 source registry 對應其官方 resource、資料用途和 refresh rule。

- [ ] **Step 4: 跑 focused tests 並提交資料契約**

Run: `node --test --test-concurrency=2 tests/v56-market-data.test.mjs tests/production-source-approval.test.mjs`

### Task 2: 官方價格歷史、有效交易日績效與 Daily Snapshot Diff

**Files:**
- Create: `lib/market-data/v56-daily-changes.ts`
- Create: `lib/market-data/v56-performance.ts`
- Create: `tests/v56-daily-changes.test.mjs`
- Create: `tests/v56-performance.test.mjs`
- Modify: `scripts/lib/official-market-fetch.mjs`
- Modify: `scripts/refresh-static-showcase-data.mjs`
- Modify: `scripts/build-bond-market-snapshot.mjs`

**Interfaces:**
- `buildDailyChanges({ previous, current })` 只在兩快照 schema、source、資料日、record count 都有效時回傳穩定的 `changeId`、`oldValue`、`newValue`、`changeType`、`effectiveDate`。
- `calculatePeriodReturn(history, period)` 使用 1D/1W/1M/3M/6M/YTD 對應的有效交易日；樣本不足回傳 `null`。

- [ ] **Step 1: 寫失敗測試**

```js
test('does not manufacture a change after an invalid replacement snapshot', () => {
  assert.deepEqual(buildDailyChanges({ previous: validSnapshot, current: invalidSnapshot }), []);
});
test('uses the fifth prior valid session for one-week return', () => {
  assert.equal(calculatePeriodReturn(validSessions, '1W'), 0.05);
});
```

- [ ] **Step 2: 確認紅燈**

Run: `node --test --test-concurrency=2 tests/v56-daily-changes.test.mjs tests/v56-performance.test.mjs`

- [ ] **Step 3: 以官方月歷史建立可驗證 OHLCV 與 LKG snapshot**

```js
const periods = { '1D': 1, '1W': 5, '1M': 20, '3M': 60, '6M': 120 };
const start = nthPriorValidSession(history, periods[period]);
return start === null ? null : latest.close / start.close - 1;
```

只有完整驗證後才發佈新的 current snapshot；任何整批失敗維持上一份 complete generation。以 CB／IPO／興櫃變化類型建立 daily changes，不把大面積 `null` 視為刪除或異動。

- [ ] **Step 4: 跑 tests 並提交快照與績效資料層**

Run: `node --test --test-concurrency=2 tests/v56-daily-changes.test.mjs tests/v56-performance.test.mjs tests/official-market-fetch.test.mjs`

### Task 3: V5.6 generation artifact、搜尋索引與私有欄位防護

**Files:**
- Modify: `scripts/stage-static-showcase.mjs`
- Modify: `static-showcase/assets/site-search.js`
- Create: `tests/v56-staging.test.mjs`
- Create: `tests/v56-search.test.mjs`

**Interfaces:**
- Staging 寫入 `market-data-v56.json`、`daily-changes-v56.json`、`performance-v56.json`、`price-events-v56.json` 與 `search-index-v56.json`，並將 URL 登錄於 runtime。
- `searchCanonicalIndex(query, index)` 直接查 V5.6 index，支援 `2303`、`聯電`、`23032`、`聯電二`、`3313`、`美威`，鍵盤與手機行為保持現有介面。

- [ ] **Step 1: 寫失敗測試**

```js
test('staging emits every V5.6 runtime artifact with no internal source fields', async () => {
  const runtime = await stageFixture();
  assert.match(runtime.marketDataV56Url, /market-data-v56\.json$/);
  assert.doesNotMatch(await publicArtifact(runtime.marketDataV56Url), /rawSourceId|missingReason|diagnostics/);
});
```

- [ ] **Step 2: 確認紅燈並實作 V5.6 runtime 寫入**

Run: `node --test --test-concurrency=2 tests/v56-staging.test.mjs tests/v56-search.test.mjs`

- [ ] **Step 3: 實作 artifact projection 與 deterministic search index**

```js
runtime.marketDataV56Url = `${base}/market-data-v56.json`;
runtime.dailyChangesV56Url = `${base}/daily-changes-v56.json`;
runtime.performanceV56Url = `${base}/performance-v56.json`;
```

搜尋載入失敗時只顯示「搜尋資料載入失敗／暫時無法搜尋」，絕不誤顯示「查無結果」。

- [ ] **Step 4: 跑 staging、搜尋及 public privacy scan tests 並提交**

Run: `node --test --test-concurrency=2 tests/v56-staging.test.mjs tests/v56-search.test.mjs tests/static-showcase-search.test.mjs`

### Task 4: 首頁「今天發生什麼」與市場異動工作區

**Files:**
- Modify: `static-showcase/index.html`
- Modify: `static-showcase/assets/home-page.js`
- Modify: `static-showcase/assets/home-static-fallback.js`
- Modify: `static-showcase/assets/app.css`
- Create: `tests/v56-home.test.mjs`

**Interfaces:**
- 首頁從 `dailyChanges` 顯示 CB／IPO／興櫃異動摘要、近期重要事件與導向各工作區的 Top N。
- `selectImportantEvents(events, dataDate, limit=5)` 按 deadline/effective date 升冪，無可靠事件回傳空列表而非虛構卡片。

- [ ] **Step 1: 寫失敗測試並確認首頁含真實 Old → New**

```js
test('home renders verified CB, IPO and emerging changes with old and new values', () => {
  const html = renderV56Home(model);
  assert.match(html, /今日有哪些變化/);
  assert.match(html, /舊值/);
  assert.doesNotMatch(html, /來源 ID|資料完整度|風險與缺漏/);
});
```

- [ ] **Step 2: 實作首頁並確保長期空資料模組不渲染**

- [ ] **Step 3: 跑首頁 regression tests 並提交**

Run: `node --test --test-concurrency=2 tests/v56-home.test.mjs tests/home-summary.test.mjs tests/public-homepage.test.mjs`

### Task 5: CB 市場總覽、全部 CB tabs、Pipeline、權利事件與快速研究 Modal

**Files:**
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/bonds-filter.html`
- Modify: `static-showcase/bonds-issuance.html`
- Modify: `static-showcase/bonds-events.html`
- Modify: `static-showcase/assets/bonds-page.js`
- Modify: `static-showcase/assets/bond-list-page.js`
- Modify: `static-showcase/assets/bond-issuance-page.js`
- Modify: `static-showcase/assets/bond-events-page.js`
- Create: `static-showcase/assets/cb-v56-workspace.js`
- Create: `tests/v56-cb-workspace.test.mjs`

**Interfaces:**
- `projectCbWorkspace(model)` 提供分組 tabs：行情、估值、流通、條款、期間、事件；只含可驗證欄位。
- `buildCbIssuancePipeline(record)` 保留公告→送件→生效→競拍/詢圈→定價→掛牌，最低投標價、得標價與實際承銷價用獨立欄位，未定價為 `待定`。
- `openCbResearchModal(cbCode, model)` 顯示摘要、期間績效、事件、條款、流通、轉換價歷史，並保留完整詳情路徑。

- [ ] **Step 1: 寫失敗 tests**

```js
test('CB issuance keeps auction floor and actual offer price distinct', () => {
  const row = projectPipeline(sourceRecord);
  assert.equal(row.auctionFloorPrice, 98);
  assert.equal(row.actualOfferPrice, 102.5);
});
test('CB modal uses a real five digit bond code and hides unavailable tabs', () => {
  assert.match(renderCbModal(model.records[0]), /23032/);
  assert.doesNotMatch(renderCbModal({}), /流通餘額/);
});
```

- [ ] **Step 2: 實作 CB 總覽、tab 分組、資料表 URL 排序、Modal、法人動向與完整 events**

大型表格手機版固定「代碼／名稱」首欄、其餘欄位水平捲動、表頭 sticky；只在 verified data 存在時顯示 tab 或欄位。

- [ ] **Step 3: 跑 tests 並提交 CB 前台**

Run: `node --test --test-concurrency=2 tests/v56-cb-workspace.test.mjs tests/static-showcase-v53-cb-pages.test.mjs tests/cb-workbench-acceptance.test.mjs`

### Task 6: 價格與事件 Lightweight Charts 5.x

**Files:**
- Modify: `package.json`
- Modify: `scripts/stage-static-showcase.mjs`
- Replace: `static-showcase/assets/klinechart-adapter.js`
- Modify: `static-showcase/assets/bond-detail-page.js`
- Modify: `static-showcase/assets/company-overview.js`
- Create: `static-showcase/assets/price-event-chart.js`
- Create: `tests/v56-price-event-chart.test.mjs`

**Interfaces:**
- `mountPriceEventChart({ host, candles, events, range, market })` 使用 Lightweight Charts 5.x `createChart`、`addSeries(CandlestickSeries)`、`createSeriesMarkers`，回傳 `{ state, focusEvent, dispose }`。
- `focusEvent(eventId)` 以同一 canonical event ID 將圖表可見範圍定位並同步下方事件紀錄。

- [ ] **Step 1: 寫失敗測試**

```js
test('price-event chart accepts verified candles and only supported event markers', () => {
  const model = buildPriceEventChartModel(candles, events);
  assert.equal(model.candles.length, 2);
  assert.deepEqual(model.markers.map((item) => item.id), ['event:23032:2026-08-28']);
  assert.doesNotMatch(model.serialized, /MACD|RSI|KDJ|BOLL|MA5/);
});
```

- [ ] **Step 2: 安裝固定的 Lightweight Charts 5.x、更新 staging vendor、確認紅燈後實作**

- [ ] **Step 3: 建立 3M/6M/1Y（股票）與 3M/6M/全部（CB）範圍、Volume、marker 與 tooltip**

桌機圖高 340–400px、手機 280–320px；上漲紅、下跌綠、淡 grid、右側價格軸與下方時間軸。只使用官方 OHLCV，無資料時顯示資料狀態而不畫假 K 棒。

- [ ] **Step 4: 跑 chart tests 並提交**

Run: `node --test --test-concurrency=2 tests/v56-price-event-chart.test.mjs tests/static-showcase-kline-adapter.test.mjs tests/static-showcase-candlestick.test.mjs`

### Task 7: 興櫃 Performance、IPO 掛牌後績效與公司資料整合

**Files:**
- Modify: `static-showcase/emerging.html`
- Modify: `static-showcase/ipo.html`
- Modify: `static-showcase/ipo-radar.html`
- Modify: `static-showcase/company.html`
- Modify: `static-showcase/assets/emerging-page.js`
- Modify: `static-showcase/assets/ipo-page.js`
- Modify: `static-showcase/assets/company-overview.js`
- Create: `tests/v56-company-market-pages.test.mjs`

**Interfaces:**
- `projectEmergingPerformance(records, history)` 顯示最新價、1W/1M/3M/YTD、成交額與變化；僅以有足夠有效交易日的標的計算。
- `projectIpoPostListing(record, history)` 顯示實際承銷價、最新價、5D/20D/60D/掛牌以來；不足期回傳 `null`。

- [ ] **Step 1: 寫失敗 tests 並確認「無成交」不被視為價格零**

```js
test('IPO post-listing return is absent until enough valid sessions exist', () => {
  assert.equal(projectIpoPostListing(record, oneSession).return20d, null);
});
test('emerging rows retain today-no-trade instead of a fabricated close', () => {
  assert.equal(projectEmergingPerformance([noTrade], []).records[0].tradeState, 'no_trade');
});
```

- [ ] **Step 2: 實作 Performance 與公司交會頁**

公司頁由 `security_master` 用代碼關聯公司、CB、IPO、營收與事件；無對應資料的區塊不呈現空白大卡。

- [ ] **Step 3: 跑 tests 並提交**

Run: `node --test --test-concurrency=2 tests/v56-company-market-pages.test.mjs tests/static-showcase-emerging-ui.test.mjs tests/static-showcase-ipo-ui.test.mjs`

### Task 8: V5.6 資料品質、跨頁一致與公開網站驗收

**Files:**
- Create: `scripts/v56-data-quality-qa.mjs`
- Create: `tests/v56-data-quality-qa.test.mjs`
- Modify: `package.json`
- Modify: `docs/testing-and-acceptance-plan.md`

**Interfaces:**
- `auditV56Data({ market, officialSamples })` 驗證至少上市 10、上櫃 10、興櫃 10 檔各 20 有效日 OHLCV；20 檔 CB、10 件權利事件、10 件發行 pipeline，以及跨頁 event ID／資料日一致性。

- [ ] **Step 1: 寫失敗 QA test**

```js
test('V5.6 audit rejects fabricated zero, incomplete history and cross-page event drift', () => {
  assert.throws(() => auditV56Data({ market: invalidModel }), /V5.6 QA failed/);
});
```

- [ ] **Step 2: 實作 QA、刷新官方快照、執行 build／typecheck／lint／完整雙工作者測試**

- [ ] **Step 3: 以桌機與 390px 實測首頁、CB 市場總覽、今日異動、績效、發行、事件、CB modal、圖表、興櫃、IPO、搜尋與公司頁**

- [ ] **Step 4: 提交、保存經驗收的正式成品並發布**

發佈後以公開網址確認新的 data date、V5.6 UI、搜尋路由、無內部診斷文字與手機無文件水平溢出。
