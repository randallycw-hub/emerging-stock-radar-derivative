# 可轉債交易核心欄位強化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓可轉債主表第一眼清楚呈現 CB 盤後收盤價、轉換溢價率、官方流通餘額、到期日與距離事件天數，並保留可排序與資料日期語義。

**Architecture:** 沿用現有 `static-showcase/bonds.html` 與 `assets/bonds-page.js` 的資料快照與排序架構。主表新增明確的到期日欄位，事件欄位改為「最近賣回／到期」摘要；餘額維持官方 `目前餘額` 的原始面額語義，在尚未驗證面額換算規則前不標示為「張數」。詳細工作台同步顯示相同核心欄位與日期，避免表格與詳細頁語義不一致。

**Tech Stack:** 靜態 HTML、原生 ES modules、Node.js `node:test`、現有 `sortRows`。

## Global Constraints

- 只使用已發布的官方快照欄位；缺漏或無共同估值日一律顯示「—」，不得推測。
- `CB 收盤價（盤後）`、股票收盤價、轉換價與溢價率必須保留各自資料日期；溢價率僅使用共同估值日計算結果。
- `目前餘額` 的原始單位尚未完成面額換算驗證前，顯示為「流通餘額」，不得改稱「剩餘張數」。
- 保留既有深／淺色主題、URL 查詢參數、分頁與欄位排序行為。

---

### Task 1: 補齊可轉債主表核心欄位

**Files:**
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/assets/bonds-page.js`
- Modify: `static-showcase/assets/app.css`
- Test: `tests/static-showcase-bond-ui.test.mjs`

**Interfaces:**
- Consumes: `state.views` 的 `cbClose`, `premiumRate`, `outstandingAmount`, `maturityDate`, `daysToMaturity`, `cbPriceDate`, `valuationDate`。
- Produces: 主表欄位 `CB 收盤價（盤後）`, `轉換溢價率`, `流通餘額`, `到期日`, `距到期／賣回`；既有排序鍵與篩選維持可用。

- [x] **Step 1: Write the failing test**

在 `tests/static-showcase-bond-ui.test.mjs` 的欄位清單加入 `CB 收盤價（盤後）`、`到期日`、`距到期／賣回`，並要求 JS 同時含有 `maturityDate`、`daysToMaturity` 與 `cbPriceDate`。

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/static-showcase-bond-ui.test.mjs`

Expected: FAIL，因現有主表只有 `CB 收盤價` 與 `到期／賣回事件`，沒有明確的 `到期日` 欄位。

- [x] **Step 3: Write minimal implementation**

在 `bonds.html`：

```html
<th aria-sort="none"><button type="button" data-sort-key="cbClose" data-sort-type="number">CB 收盤價（盤後） <span aria-hidden="true"></span></button></th>
<th aria-sort="none"><button type="button" data-sort-key="daysToMaturity" data-sort-type="number">距到期／賣回 <span aria-hidden="true"></span></button></th>
<th aria-sort="none"><button type="button" data-sort-key="maturityDate" data-sort-type="text">到期日 <span aria-hidden="true"></span></button></th>
```

在 `bonds-page.js`：

```js
const sortType = state.sortKey === "bondCode" || state.sortKey === "bondName" || state.sortKey === "maturityDate" ? "text" : "number";
// renderBondRow 依序輸出：CB 收盤價、溢價率、流通餘額、到期日、距到期／賣回。
const maturityDate = view.maturityDate ?? "—";
const eventSummary = eventMetric(view);
```

把 `renderBondRow` 的餘額副標改成「官方目前餘額」；只有 `view.outstandingAmount` 非空時顯示數值，否則維持「資料暫缺」。為 `renderBondCard` 與詳細工作台加入 `到期日` 與 `距到期／賣回`，並把 CB 主欄位文案統一成 `CB 收盤價（盤後）`。

在 `app.css`：

```css
.bond-table th button { white-space: nowrap; }
.bond-table th:nth-child(1),
.bond-table td:nth-child(1) { position: sticky; left: 0; z-index: 2; }
```

沿用既有色彩變數，不新增綠色警示色；缺漏值仍使用既有 `metric-alert`／`metric-violet` 語義。

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/static-showcase-bond-ui.test.mjs tests/bond-table-sort.test.mjs tests/formal-bond-pages.test.mjs`

Expected: PASS；主表欄位、URL 排序鍵、穩定排序與正式頁契約檢查全部通過。

- [x] **Step 5: Commit**

```bash
git add static-showcase/bonds.html static-showcase/assets/bonds-page.js static-showcase/assets/app.css tests/static-showcase-bond-ui.test.mjs
git commit -m "feat: clarify convertible bond core market fields"
```

### Task 2: 驗證資料語義與正式建置

**Files:**
- Modify: `tests/static-showcase-bond-ui.test.mjs`
- Test: `tests/formal-market-data-contract.test.mjs`
- Test: `tests/build-bond-market-snapshot.test.mjs`

**Interfaces:**
- Consumes: Task 1 的主表語義與既有 `bond-market-view` snapshot。
- Produces: 可重現的資料日期、共同估值日、餘額原始單位與缺漏值驗證。

- [x] **Step 1: Write the failing test**

新增測試斷言：

```js
assert.match(js, /CB 收盤價（盤後）/);
assert.match(js, /官方目前餘額/);
assert.match(js, /共同估值日/);
assert.match(js, /maturityDate/);
```

並在正式市場資料契約測試中確認 `premiumRate === null` 時不渲染數值，且 `outstandingAmount` 維持原始來源欄位。

- [x] **Step 2: Run focused verification**

Run: `node --test tests/static-showcase-bond-ui.test.mjs tests/formal-market-data-contract.test.mjs tests/build-bond-market-snapshot.test.mjs`

Expected: PASS，且不新增未驗證的面額換算或即時行情。

- [x] **Step 3: Run project gates**

Run: `npm test`

Expected: 全部既有測試 PASS；若測試數量變動，輸出需明確列出新增測試通過。

- [x] **Step 4: Commit**

```bash
git add tests/static-showcase-bond-ui.test.mjs tests/formal-market-data-contract.test.mjs tests/build-bond-market-snapshot.test.mjs
git commit -m "test: verify bond market field semantics"
```
