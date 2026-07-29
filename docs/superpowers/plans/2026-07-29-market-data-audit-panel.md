# Market Data Audit Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在興櫃官方盤後資料頁加入可查核的來源、日期、擷取時間與資料語意資訊。

**Architecture:** 延用 `TrackerPayload.marketSource` 作為伺服器產生的查核中繼資料；Dashboard 只負責呈現，不直接呼叫官方端點。來源失敗維持既有 unavailable 狀態。

**Tech Stack:** Next.js/Vinext、React、TypeScript、Node test runner、現有 CSS token 系統。

## Global Constraints

- 只使用 Source Registry 已核准的 TPEx 興櫃官方盤後端點。
- `dailyAveragePrice` 只能顯示為日均價，不得稱為收盤價。
- 不新增即時行情、第三方報價、漲跌幅計算、技術指標或可轉債盤後價格。
- 來源錯誤時不得使用 fixture、未登錄來源或零值補齊。

### Task 1: 加入查核資訊卡與來源卡

**Files:**
- Modify: `app/Dashboard.tsx` 的 `MarketView` 與 `TrackerPayload.marketSource` 型別
- Modify: `app/globals.css` 市場頁樣式
- Test: `tests/rendered-html.test.mjs`、`tests/no-market-quotes.test.mjs`

**Interfaces:**
- Consumes: `marketRows` 與 `marketSource.dataDate/fetchedAt/officialUrl`。
- Produces: 可存取的查核狀態區與官方來源連結。

- [ ] **Step 1: 擴充測試**，要求 Dashboard 包含「官方資料日期」「本站擷取時間」「資料語意」「官方來源」及來源連結欄位。
- [ ] **Step 2: 執行測試確認新斷言失敗**。
- [ ] **Step 3: 在 `MarketView` 加入查核資訊卡與來源卡，空狀態也顯示完整狀態說明。**
- [ ] **Step 4: 新增響應式 CSS，沿用現有 copper/light-dark token，確保小螢幕不產生頁面橫向溢出。**
- [ ] **Step 5: 執行該組測試確認通過。**
- [ ] **Step 6: 提交 `feat: add market data audit panel`。**

### Task 2: 全量品質驗證

**Files:**
- Verify: `app/Dashboard.tsx`, `app/globals.css`, `lib/tracker.mjs`
- Test: `tests/*.test.mjs`, `tests/source-verification/*.test.mjs`

- [ ] **Step 1: 執行 `npm.cmd run typecheck`。**
- [ ] **Step 2: 執行 `npm.cmd run lint`。**
- [ ] **Step 3: 執行 `npm.cmd test -- --runInBand`，確認 build 與 166 項既有測試全部通過。**
- [ ] **Step 4: 若全部通過，檢查 `git status --short` 並回報結果；不修改來源規則或加入未核准資料。**
