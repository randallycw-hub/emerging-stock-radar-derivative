# CB Public Analysis Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立公開、盤後、可搜尋的可轉債分析工作台，提供全市場列表、每檔詳細研究、六維條件、六種中性策略條件、日／週／月 K 線、法人／營運／事件資料、每日全量同步與封存查詢，同時禁止投資建議及虛構缺漏資料。

**Architecture:** 延伸既有嚴格市場資料 domain 與原子發布流程，新增一份經完整驗證的 `bond-workbench.json` 作為列表與詳細頁主資料；OHLC 歷史沿用並擴充 `bond-market-history.json`。市場衍生值與策略條件先在 Node/TypeScript 純函式完成；技術指標由一份 Node tests 與瀏覽器共用的純 ES module 計算，避免兩套公式。靜態頁只讀已發布資料、做搜尋／排序／繪圖，不在瀏覽器抓第三方來源。候選 generation 完成 schema、hash、record count、cross-file 與 lifecycle 驗證後，最後才切換 `current.json`。

**Tech Stack:** Node.js 22、TypeScript 5、ES modules、Node test runner、Vinext/Next 靜態建置、原生 HTML/CSS/JavaScript、Canvas 2D（K 線）及現有 Sites stage 流程。

## Global Constraints

- 實作前先確認工作樹乾淨。當前 Task 5 的 staged／unstaged smoke 變更必須先在自己的審查流程中提交或撤回；本計畫不得吸收、不重排也不得覆寫那些變更。
- 所有 CPU 密集命令使用 Windows `BelowNormal` 優先權，`UV_THREADPOOL_SIZE=2`，測試使用 `--test-concurrency=1`；不得使用全部 CPU 核心。
- 普通測試、lint、typecheck、build、stage 全程離線；live smoke、正式資料抓取與 production deploy 必須另有明確授權。
- 所有正式來源仍須通過 central Source Registry。不得新增 Yahoo、第三方頁面、未核准 API 或名稱模糊串接。
- 不複製 RobotCB、thefew 或其他網站的版面、TCRI、專有評分、估值模型與訊號，只實作本規格已核准的公開公式及中性條件。
- 缺值維持 `null`／`pending`；不得改成零、沿用別家公司／市場資料或以收盤價製造 OHLC。
- 公開介面不得出現「建議買進／賣出／放空／套利下單」等投資指令，不產生部位、股數、張數、避險比率或進出場價。
- 每一 Task 都先新增失敗測試並確認 RED，再做最小實作轉為 GREEN；完成後只提交該 Task 列出的檔案。
- 下列測試命令均在此低負載 wrapper 內執行：

```powershell
$process = Get-Process -Id $PID
$previousPriority = $process.PriorityClass
try {
  $process.PriorityClass = 'BelowNormal'
  $env:UV_THREADPOOL_SIZE = '2'
  # 執行本 Task 指定的 node/npm.cmd 命令
} finally {
  $process.PriorityClass = $previousPriority
}
```

---

### Task 1: 建立工作台快照、條款投影與封存生命週期契約

**Files:**
- Create: `lib/market-data/bond-workbench.ts`
- Modify: `lib/market-data/types.ts`
- Modify: `scripts/lib/bond-inputs-from-11406.mjs`
- Create: `tests/bond-workbench.test.mjs`
- Modify: `tests/build-bond-market-snapshot.test.mjs`

**Contract:**

```ts
export type BondLifecycleStatus = "active" | "archived";
export type BondArchiveReason =
  | "matured"
  | "redeemed"
  | "balance_exhausted"
  | "removed_from_official_roster";
export type BondFieldState =
  | "complete"
  | "stale"
  | "date_mismatch"
  | "missing"
  | "accumulating";

export type BondTermSummary = {
  bondCode: string;
  issuerCode: string;
  bondName: string;
  issuerName: string;
  issueDate: string | null;
  listingDate: string | null;
  maturityDate: string;
  issueAmount: string | null;
  outstandingAmount: string | null;
  outstandingDataDate: string | null;
  initialConversionPrice: string | null;
  conversionStartDate: string | null;
  conversionEndDate: string | null;
  putDates: readonly string[];
  putPrice: string | null;
  securedStatus: string | null;
  underwriter: string | null;
  trustee: string | null;
  unitFaceValueTwd: string | null;
};

export type BondWorkbenchEvent = {
  eventId: string;
  type:
    | "conversion_adjustment"
    | "conversion_suspension"
    | "ex_dividend"
    | "put"
    | "redemption"
    | "maturity"
    | "listing"
    | "delisting";
  date: string;
  title: string;
  sourceId: string;
  sourceUrl: string | null;
};

export type BondWorkbenchFieldStates = {
  price: BondFieldState;
  valuation: BondFieldState;
  outstanding: BondFieldState;
  institutions: BondFieldState;
  company: BondFieldState;
  events: BondFieldState;
  history: BondFieldState;
};

export type BondWorkbenchRecord = {
  bondCode: string;
  status: BondLifecycleStatus;
  archiveReason: BondArchiveReason | null;
  archivedAt: string | null;
  term: BondTermSummary;
  view: BondMarketView;
  events: readonly BondWorkbenchEvent[];
  fieldStates: BondWorkbenchFieldStates;
};

export type BondWorkbenchSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  dataDate: string;
  records: readonly BondWorkbenchRecord[];
};

export function parseBondWorkbenchSnapshot(value: unknown): BondWorkbenchSnapshot;
export function buildBondWorkbenchSnapshot(input: {
  generatedAt: string;
  dataDate: string;
  asOfDate: string;
  currentTerms: readonly BondTermSummary[];
  currentViews: readonly BondMarketView[];
  currentEvents: readonly BondWorkbenchEvent[];
  previous?: BondWorkbenchSnapshot;
}): BondWorkbenchSnapshot;
```

- `bondCode` 為唯一主鍵；公司名稱只能作顯示／搜尋別名，不作 join key。
- 11406 條款投影只使用目前正式欄位：發行／掛牌／到期日、發行與餘額、發行時轉換價、轉換起訖、賣回日期／價格、擔保、承銷商與受託人；面額由已驗證 supplemental snapshot 加入。公開說明書、重設條款或其他尚無核准來源的欄位不寫入假值。
- 封存原因優先順序：已驗證提前贖回下櫃日已到 → 到期日已過 → 目前餘額為零 → 從完整正式名冊消失。
- 當日零成交、價格為空或來源暫時 stale 不得導致封存。
- 已封存紀錄保持封存；重新出現在正式名冊只能由明確測試覆蓋的官方更正路徑解除，不可默默復活。
- 前一份 snapshot 必須在任何 merge 前完整 fail-closed 驗證；回傳 deep clone + deep freeze，按 `bondCode` 穩定排序。

- [ ] **Step 1: 寫 RED 測試鎖定 schema 與生命週期**

測試 active 新增、同碼重複、5／6 位代碼、到期、贖回、餘額歸零、名冊消失、零成交不封存、既有 archive 保留、hidden/symbol/sparse schema drift、previous malformed before merge、輸入排列決定性與 defensive freeze。

Run: `node --test --test-concurrency=1 tests/bond-workbench.test.mjs`

Expected: FAIL，因 `bond-workbench.ts` 尚不存在或 exports 尚未實作。

- [ ] **Step 2: 最小實作 strict parser 與 builder**

重用現有日期、十進位與 `BondMarketView` 驗證邊界；動態 map／array 容器使用 `Reflect.ownKeys` 與 dense-array 檢查，禁止靜默捨棄 hidden/symbol 欄位。

- [ ] **Step 3: 擴充 11406 純 mapper 的英文條款投影**

保留現有私募未掛牌排除、日期 alias 與精確金額規則；不得要求目前正式 mapper 尚無的發行日、轉換期間或公開說明書 URL。缺少的完整條款在後續 UI 顯示「未取得」，不推測。

- [ ] **Step 4: 跑 focused tests**

Run: `node --test --test-concurrency=1 tests/bond-workbench.test.mjs tests/bond-market-view.test.mjs tests/build-bond-market-snapshot.test.mjs`

Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add lib/market-data/bond-workbench.ts lib/market-data/types.ts scripts/lib/bond-inputs-from-11406.mjs tests/bond-workbench.test.mjs tests/build-bond-market-snapshot.test.mjs
git commit -m "feat: define CB workbench lifecycle snapshot"
```

---

### Task 2: 實作六維研究條件與六種策略條件（不產生總分或建議）

**Files:**
- Create: `lib/market-data/bond-strategy-assessment.ts`
- Modify: `lib/market-data/types.ts`
- Create: `tests/bond-strategy-assessment.test.mjs`
- Modify: `tests/bond-workbench.test.mjs`

**Contract:**

```ts
export type DimensionState = "favorable" | "watch" | "risk" | "pending";
export type ConditionState = "met" | "partial" | "pending" | "not_met";

export type AssessmentCheck = {
  code: string;
  label: string;
  state: ConditionState;
  actual: string | null;
  threshold: string;
  dataDate: string | null;
  sourceId: string | null;
  missingReason: string | null;
};

export type BondAssessment = {
  dimensions: readonly {
    code: "price" | "days" | "premium" | "remaining" | "spread" | "liquidity";
    state: DimensionState;
    checks: readonly AssessmentCheck[];
  }[];
  strategies: readonly {
    code:
      | "stock_bond_relative"
      | "maturity_put"
      | "equity_relative"
      | "stock_equivalent"
      | "arbitrage"
      | "dynamic_hedge";
    state: ConditionState;
    checks: readonly AssessmentCheck[];
  }[];
};

export function evaluateBondAssessment(input: {
  view: BondMarketView;
  history: readonly BondMarketHistoryPoint[];
  spreadPercent: string | null;
  spreadDataDate: string | null;
  borrowability: "available" | "unavailable" | "unknown";
  conversionSuspended: boolean | null;
  publicFinancials: {
    ttmProfitState: "profitable" | "loss" | "unknown";
    revenueTrendState: "up" | "down" | "unknown";
    psPercentile: string | null;
    dataDate: string | null;
  };
}): BondAssessment;
```

**公開規則常數（須在程式與 UI 方法說明共用同一份資料）：**

- 價格：`<=115` 條件良好、`>115 && <=130` 需留意、`>130` 風險偏高。
- 剩餘天數：`>=365` 條件良好、`180–364` 需留意、`<180` 風險偏高。
- 溢價率：`<=10%` 條件良好、`>10% && <=30%` 需留意、`>30%` 風險偏高。
- 剩餘比例：`>=70%` 條件良好、`>10% && <70%` 需留意、`<=10%` 風險偏高。
- 盤後價差：`<0.9%` 條件良好、`0.9–2%` 需留意、`>2%` 風險偏高；目前無核准價差資料時一律 pending。
- 流動性：同時呈現當日量、5 日均量、20 日均量、剩餘張數週轉率，不加權成總分；5 日均量 `<10` 張為風險、`10–49` 為需留意、`>=50` 為條件良好，樣本不足為 accumulating/pending。
- 股債相對：轉換價值 `70–120`、溢價率 `<30%`、剩餘天數 `>=365`；缺一項就依缺漏程度為 partial/pending。
- 到期賣回：公開賣回日存在、基準價 `<100`；信用評等／TCRI 未取得不得自行判斷，該 check 為 pending。
- 現股相對觀察：溢價率 `>30%`，並只在公開 TTM、營收趨勢及 PS 資料可驗證時判斷；目前缺少核准 TTM/PS 來源，相關 check 必須 pending。
- 等同現股：溢價率 `<2%` 且盤後價差 `<2%`；任一缺漏為 pending。
- 套利：折價（溢價率 `<0%`）、可融券、未停轉及交易成本均需可驗證；不得計算建議部位。
- 動態避險：公開波動度 `>25%`、剩餘天數 `>=365`、溢價率 `<2%`，且融券／停轉狀態可驗證；不得輸出 hedge ratio。

- [ ] **Step 1: 寫 RED 測試涵蓋六個研究樣本與缺值邊界**

建立聯電一、金像電三、博智二、偉詮電一、至上 11、順德一的匿名化純 fixture，驗證門檻兩側、折價、零成交、短歷史、價差缺漏、日期 mismatch、融券／停轉 unknown、TTM/PS missing。

Run: `node --test --test-concurrency=1 tests/bond-strategy-assessment.test.mjs`

Expected: FAIL，因 assessment module 尚不存在。

- [ ] **Step 2: 實作純條件引擎**

所有比較使用現有 decimal helpers；condition state 聚合規則為：全部必要 check met 才 met；至少一個 not_met 且無 missing 為 not_met；met 與 missing 混合為 partial；無足夠可判斷 check 為 pending。

- [ ] **Step 3: 在 workbench record 加入 assessment，拒絕跨日期值**

策略需要跨來源的欄位，其 `dataDate` 不一致時 check 必須 pending 並寫 `DATE_MISMATCH`，不得沿用其他日期。

- [ ] **Step 4: 加入禁止投資指令的契約測試**

掃描所有公開 label／explanation，拒絕「建議買進」「建議賣出」「放空 X 張」「套利下單」「避險比率」等指令式字串；允許「套利條件部分符合」等教育性描述。

- [ ] **Step 5: Focused GREEN**

Run: `node --test --test-concurrency=1 tests/bond-strategy-assessment.test.mjs tests/bond-workbench.test.mjs tests/bond-derived-metrics.test.mjs`

Expected: PASS。

- [ ] **Step 6: Commit**

```powershell
git add lib/market-data/bond-strategy-assessment.ts lib/market-data/types.ts tests/bond-strategy-assessment.test.mjs tests/bond-workbench.test.mjs
git commit -m "feat: evaluate neutral CB research conditions"
```

---

### Task 3: 擴充每日 OHLC 歷史與 append-only 合併契約

**Files:**
- Modify: `lib/market-data/types.ts`
- Modify: `lib/market-data/bond-market-history.ts`
- Modify: `scripts/build-bond-market-snapshot.mjs`
- Modify: `scripts/backfill-bond-market-history.mjs`
- Modify: `tests/bond-market-history.test.mjs`
- Modify: `tests/build-bond-market-snapshot.test.mjs`

**History point extension:**

```ts
export type BondMarketHistoryPoint = {
  bondCode: string;
  date: string;
  cbOpen: string | null;
  cbHigh: string | null;
  cbLow: string | null;
  cbClose: string | null;
  cbAverage: string | null;
  cbChange: string | null;
  cbTradingUnits: string;
  cbTurnover: string;
  stockClose: string | null;
  effectiveConversionPrice: string | null;
  conversionValue: string | null;
  premiumRate: string | null;
};
```

- `parseBondMarketHistory(value)` 完整檢查 exact keys、dense array、日期、canonical decimal、OHLC 關係、duplicate `(bondCode,date)`，並回傳 frozen clone。
- 當官方行情該日有該債券但成交量為零時，仍新增一個日期點；OHLC 全部為 `null`，不得用 previous close 或 average 補 K 棒。
- 有 OHLC 時必須滿足 `low <= open/close <= high`；缺一個 OHLC 就整組視為不可畫 K 棒，但成交量／事件仍保留。
- 同日同債重跑產生完全相同 point 時 idempotent；不同 point 一律拒絕。正式更正日後只能透過含 `sourceId/retrievedAt/sha256` 的顯式 correction evidence API 處理，不在一般 refresh 靜默覆寫。
- `buildHistoryPoints` 不再因 `cbClose === null` 直接刪除該日。

- [ ] **Step 1: 寫 RED 測試**

涵蓋完整 OHLC、零成交 gap、部分 OHLC 拒絕畫圖、high/low 反轉、同日重複、衝突重跑、日期 mismatch 不算 conversion/premium、previous malformed 先拒、append-only。

Run: `node --test --test-concurrency=1 tests/bond-market-history.test.mjs`

Expected: FAIL，因新欄位／parser 尚不存在。

- [ ] **Step 2: 實作 strict parser、builder 與 merge**

保留原有 conversion value/premium 的同日契約；歷史只使用 `CbQuote.tradingUnits`，成交金額不冒充量。

- [ ] **Step 3: 更新 publisher/backfill 使用新 parser**

讀 previous history 後先完整 parse，再 collect；staged history 再 parse/hash/count。backfill 只接受已核准離線輸入或既有發布資料，不新增 live fallback。

- [ ] **Step 4: Focused GREEN**

Run: `node --test --test-concurrency=1 tests/bond-market-history.test.mjs tests/build-bond-market-snapshot.test.mjs`

Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add lib/market-data/types.ts lib/market-data/bond-market-history.ts scripts/build-bond-market-snapshot.mjs scripts/backfill-bond-market-history.mjs tests/bond-market-history.test.mjs tests/build-bond-market-snapshot.test.mjs
git commit -m "feat: preserve verified CB OHLC history"
```

---

### Task 4: 建立週／月 K 聚合與技術指標純運算引擎

**Files:**
- Create: `static-showcase/assets/bond-technical-analysis.js`
- Create: `tests/bond-technical-analysis.test.mjs`

**Public pure API:**

```ts
export type CandlePeriod = "day" | "week" | "month";
export type TechnicalCandle = {
  periodStart: string;
  periodEnd: string;
  open: string;
  high: string;
  low: string;
  close: string;
  tradingUnits: string;
  turnover: string;
};

export type BollingerPoint = {
  middle: string | null;
  upper: string | null;
  lower: string | null;
};
export type StochasticPoint = { k: string | null; d: string | null };
export type MacdPoint = {
  macd: string | null;
  signal: string | null;
  histogram: string | null;
};

export function verifiedDailyCandles(points: readonly BondMarketHistoryPoint[]): readonly TechnicalCandle[];
export function aggregateCandles(candles: readonly TechnicalCandle[], period: "week" | "month"): readonly TechnicalCandle[];
export function simpleMovingAverage(candles: readonly TechnicalCandle[], period: number): readonly (string | null)[];
export function bollingerBands(candles: readonly TechnicalCandle[], period?: 20, multiplier?: 2): readonly BollingerPoint[];
export function relativeStrengthIndex(candles: readonly TechnicalCandle[], period?: 14): readonly (string | null)[];
export function stochasticKd(candles: readonly TechnicalCandle[], lookback?: 9, kPeriod?: 3, dPeriod?: 3): readonly StochasticPoint[];
export function macd(candles: readonly TechnicalCandle[], fast?: 12, slow?: 26, signal?: 9): readonly MacdPoint[];
```

**Formula decisions:**

- 週期以 Asia/Taipei 曆日分組；週一為週首，月線以 `YYYY-MM` 分組。
- 週／月 open=第一個有效日 K open、high=max、low=min、close=最後有效日 K close，量額為精確整數加總。
- MA 使用 simple moving average；EMA 以首個完整期間 SMA 作 seed。
- Bollinger 使用 20 期 population standard deviation、上下 2 倍；輸出六位小數 canonical string。
- RSI 使用 Wilder 14；KD 使用 9-3-3 且初始 K/D=50；MACD 使用 EMA 12/26、signal 9。
- 所有輸出只能是數值或 `null`，不輸出「黃金交叉／買點／賣點」等訊號。
- 日 K 缺 OHLC 就不建 candle，時間軸保留 gap；樣本不足回 `null`，UI 顯示「資料累積中」。

- [ ] **Step 1: 寫 RED 測試**

以小型可手算序列驗日→週／月 OHLC、跨年週、gap、量額加總、MA5/20/60、Bollinger、RSI、KD、MACD seed、超大整數與輸入不突變。

Run: `node --test --test-concurrency=1 tests/bond-technical-analysis.test.mjs`

Expected: FAIL，module 尚不存在。

- [ ] **Step 2: 實作 aggregation 與 indicators**

此檔是 Node tests 與靜態瀏覽器共同 import 的唯一公式實作，使用內建 scaled-BigInt decimal helpers；需要平方根時採固定精度整數法，六位小數後 round-half-away-from-zero，不直接累積 binary float 誤差。不得在 detail/chart module 再複製第二套指標公式。

- [ ] **Step 3: 加入 no-signal contract test**

序列化所有輸出與 metadata，確認不含 advice／signal 字眼。

- [ ] **Step 4: Focused GREEN**

Run: `node --test --test-concurrency=1 tests/bond-technical-analysis.test.mjs tests/bond-market-history.test.mjs`

Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add static-showcase/assets/bond-technical-analysis.js tests/bond-technical-analysis.test.mjs
git commit -m "feat: derive CB candlesticks and indicators"
```

---

### Task 5: 將 workbench artifact 接入原子發布、runtime 與 stage allowlist

**Files:**
- Modify: `scripts/build-bond-market-snapshot.mjs`
- Modify: `scripts/refresh-static-showcase-data.mjs`
- Modify: `scripts/stage-static-showcase.mjs`
- Modify: `tests/build-bond-market-snapshot.test.mjs`
- Modify: `tests/refresh-static-showcase-data.test.mjs`
- Modify: `tests/stage-static-showcase.test.mjs`
- Modify: `tests/formal-market-data-contract.test.mjs`
- Modify: `tests/static-showcase-artifacts.test.mjs`

**Artifact/runtime contract:**

- 新增 generation file `bond-workbench.json`。
- `runtime.datasets.bondWorkbench` 必須精確等於當代 `generations/<id>/bond-workbench.json`。
- manifest entry 必須包含 SHA-256、byte count、record count、schema version 與 workbench source-state summary。
- publisher 在任何 network/collect 前讀取並完整驗證 previous workbench、previous history、previous supplemental 與 previous issuer research。
- current term/view/history/supplemental/issuer research/workbench 必須同 candidate 建立；逐 bondCode 交叉驗證，不得有名稱 join、遺失 current bond、重複 current bond 或錯誤 archive。
- staged generation 的 schema/hash/count/runtime/path/cross-file 驗證全部成功後，才能 rename generation；`current.json` 仍是最後一步。
- stage 使用 exact file allowlist + selective copy，不能回到 recursive copy。
- 測試 harness 只接受固定 data-only scenario enum；不得新增 `workbenchBuilder`、`sourceResults`、callback、root/path/destination 等 production-capable seam。

- [ ] **Step 1: 寫 builder RED**

新增 workbench artifact/hash/count/runtime 缺漏、previous malformed before fetch、archive merge、candidate workbench/view mismatch、history mismatch、source state mismatch、corrupt artifact 不發布。

Run: `node --test --test-concurrency=1 tests/build-bond-market-snapshot.test.mjs`

Expected: FAIL，因 artifact/runtime 尚未接線。

- [ ] **Step 2: 實作 builder candidate 與 staged verifier**

`buildBondWorkbenchSnapshot` 只吃已驗證內部資料；正式 builder 不新增 offline source injection。候選 artifact 寫入 staging 後重新讀回 parser 驗證。

- [ ] **Step 3: 寫 outer refresh RED 並接線**

在固定 harness 增加 `workbench` corruption scenario；驗證 corruption 發生後 previous workbench、generation pointer、current pointer 逐 byte 不變。

Run: `node --test --test-concurrency=1 tests/refresh-static-showcase-data.test.mjs`

- [ ] **Step 4: 寫 stage/formal RED 並更新 exact allowlist**

涵蓋 declared missing、undeclared extra、wrong runtime path、inactive generation、legacy generation 相容、raw CSV／URL／錯誤 reason 不得被 stage。

Run: `node --test --test-concurrency=1 tests/stage-static-showcase.test.mjs tests/formal-market-data-contract.test.mjs tests/static-showcase-artifacts.test.mjs`

- [ ] **Step 5: Combined GREEN**

Run: `node --test --test-concurrency=1 tests/build-bond-market-snapshot.test.mjs tests/refresh-static-showcase-data.test.mjs tests/stage-static-showcase.test.mjs tests/formal-market-data-contract.test.mjs tests/static-showcase-artifacts.test.mjs`

Expected: PASS，且測試已明確封鎖 global live fetch。

- [ ] **Step 6: Commit**

```powershell
git add scripts/build-bond-market-snapshot.mjs scripts/refresh-static-showcase-data.mjs scripts/stage-static-showcase.mjs tests/build-bond-market-snapshot.test.mjs tests/refresh-static-showcase-data.test.mjs tests/stage-static-showcase.test.mjs tests/formal-market-data-contract.test.mjs tests/static-showcase-artifacts.test.mjs
git commit -m "feat: publish atomic CB workbench data"
```

---

### Task 6: 重做列表搜尋、排序、分頁與封存切換

**Files:**
- Modify: `static-showcase/bonds.html`
- Create: `static-showcase/assets/bond-list-page.js`
- Modify: `static-showcase/assets/bonds-page.js`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/static-showcase-bond-ui.test.mjs`
- Modify: `tests/bond-table-sort.test.mjs`
- Modify: `tests/formal-bond-pages.test.mjs`

**UI contract:**

- `bonds-page.js` 只負責資料載入、route 與 page orchestration；列表純邏輯移至 `bond-list-page.js`。
- 搜尋輸入支援 5／6 位代碼、債券名稱、公司名稱；文字作 Unicode NFC、trim 與 ASCII code case normalization，不作 fuzzy join。
- URL state：`?q=<text>&archived=1&sort=<key>&direction=asc|desc&page=<n>`；詳細頁沿用 `?bond=<bondCode>`。
- 預設只列 active；「包含已封存」才加入 archived。封存列顯示原因與封存日。
- 欄位固定為：代碼／名稱、CB close、conversion value、premium、stock close、conversion price、remaining ratio、next event、data date、data quality。
- 可比較欄位按鈕循環 `asc → desc → none`，並正確更新 `aria-sort`。null 永遠排在有值之後，不論 asc/desc。
- 每頁 50 筆；桌面是寬表格但不得要求整頁水平滑動，手機改卡片。搜尋／排序只在瀏覽器使用已下載 snapshot，不對外 fetch。

- [ ] **Step 1: 寫 RED 純函式測試**

export `normalizeBondQuery`、`filterBondRecords`、`sortBondRecords`、`paginateBondRecords`；測代碼、部分名稱、公司、同公司多 CB、archive toggle、null ordering、stable tie、URL round-trip。

Run: `node --test --test-concurrency=1 tests/bond-table-sort.test.mjs tests/static-showcase-bond-ui.test.mjs`

Expected: FAIL，因新 module/markup 尚未存在。

- [ ] **Step 2: 實作列表 module 與 markup**

保留深／淺色 theme；提高文字對比，所有 button/input/row focus 可見，空結果提供清除篩選動作。

- [ ] **Step 3: 拆分 orchestration，保持 deep link**

直接開測試 fixture `?bond=90001` 必須定位 active 或 archived record；找不到時顯示明確不存在，不回列表首筆。

- [ ] **Step 4: Focused GREEN**

Run: `node --test --test-concurrency=1 tests/static-showcase-bond-ui.test.mjs tests/bond-table-sort.test.mjs tests/formal-bond-pages.test.mjs`

Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add static-showcase/bonds.html static-showcase/assets/bond-list-page.js static-showcase/assets/bonds-page.js static-showcase/assets/app.css tests/static-showcase-bond-ui.test.mjs tests/bond-table-sort.test.mjs tests/formal-bond-pages.test.mjs
git commit -m "feat: rebuild searchable CB market list"
```

---

### Task 7: 建立搜尋式詳細分析頁與可追溯條件卡

**Files:**
- Create: `static-showcase/assets/bond-detail-page.js`
- Modify: `static-showcase/assets/bonds-page.js`
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/assets/app.css`
- Create: `tests/static-showcase-bond-detail.test.mjs`
- Modify: `tests/static-showcase-bond-ui.test.mjs`
- Modify: `tests/formal-bond-pages.test.mjs`

**Section order:**

1. 債券身分、active/archive、資料日、完整度。
2. 風險與缺漏提醒。
3. 六維條件（不顯示總分）。
4. 六種策略條件。
5. K 線容器。
6. 條款。
7. 法人 1／5／20 日。
8. 公司月營收與已核准公開財務欄位。
9. 事件時程。

**Presentation rules:**

- 每個 dimension/strategy 顯示完整規則、actual、threshold、通過／未通過／缺漏、dataDate、sourceId 與 state。
- UI 名稱採中性文字：「股債相對條件」「到期賣回條件」「現股相對觀察」「等同現股條件」「套利條件」「動態避險條件」。
- 固定揭露：「本頁為公開資料的教育性條件檢核，不構成投資建議或交易指令。」
- TCRI、TTM、PS 或融券資料未取得時顯示「目前無核准公開資料／待確認」，不可隱藏 check 或填零。
- 桌面用 tabs：總覽、條款與事件、法人、公司營運；手機用可收合 `<details>`，避免長頁一直滑。
- 所有公式可展開檢視，至少包含 conversion value、premium、remaining units、remaining ratio、turnover 與 days。

- [ ] **Step 1: 寫 RED rendering contract tests**

建立完整、partial、date_mismatch、archived、TTM unavailable 五種 fixture；測 section order、六維／六策略完整、資料日與來源、公式、archive reason、direct URL、缺漏文字。

Run: `node --test --test-concurrency=1 tests/static-showcase-bond-detail.test.mjs`

Expected: FAIL，detail module 尚不存在。

- [ ] **Step 2: 實作純 render helpers 與 detail controller**

DOM 內容一律 escape；外部 source link 只允許 snapshot 已驗證的 HTTPS URL 並加 `noopener noreferrer`。

- [ ] **Step 3: 加入 no-advice UI gate**

測試掃描 HTML、JS 靜態字串與 fixture rendered output，禁止總分、推薦、買進、賣出、放空、下單、部位及 hedge ratio 指令；「條件符合」本身可存在。

- [ ] **Step 4: Focused GREEN**

Run: `node --test --test-concurrency=1 tests/static-showcase-bond-detail.test.mjs tests/static-showcase-bond-ui.test.mjs tests/formal-bond-pages.test.mjs`

Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add static-showcase/assets/bond-detail-page.js static-showcase/assets/bonds-page.js static-showcase/bonds.html static-showcase/assets/app.css tests/static-showcase-bond-detail.test.mjs tests/static-showcase-bond-ui.test.mjs tests/formal-bond-pages.test.mjs
git commit -m "feat: render detailed public CB analysis"
```

---

### Task 8: 實作一般技術分析式 K 線、成交量、均線與事件標記

**Files:**
- Create: `static-showcase/assets/bond-candlestick-chart.js`
- Modify: `static-showcase/assets/bond-detail-page.js`
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/assets/app.css`
- Create: `tests/static-showcase-candlestick.test.mjs`
- Modify: `tests/static-showcase-bond-detail.test.mjs`

**Chart contract:**

- Canvas 主圖：K 棒、MA5/20/60；副圖：成交量。
- 切換日／週／月與 1M／3M／6M／1Y／3Y；預設日 K + 6M。
- 游標顯示日期、O/H/L/C、成交量；鍵盤左右鍵亦可逐根移動，旁邊提供螢幕閱讀器可讀摘要。
- 上漲／下跌顏色不能只靠紅綠，K 棒還需實心／空心或線型差異；深淺色均達足夠對比。
- event marker：conversion adjustment、conversion suspension、ex-dividend、put、redemption、maturity；相同日期堆疊而不遮蔽 K 棒。
- 進階區預設收合：Bollinger(20,2)、RSI(14)、KD(9,3,3)、MACD(12,26,9)，只畫數值，不畫買賣箭頭。
- 缺 OHLC 日形成 gap；不可畫一根 `open=high=low=close` 的假 K。樣本不足顯示「資料累積中」。archive record 仍可畫歷史。
- 大量 3Y 資料只在 viewport 畫可見 candles，避免 O(n²) hover；不引入第三方 chart CDN。

- [ ] **Step 1: 寫 RED chart model tests**

export `buildChartModel`、`selectVisibleCandles`、`buildEventMarkers`；測 gap、range、week/month、hover payload、MA、indicator unavailable、archive history、同日多事件與 no-signal。

Run: `node --test --test-concurrency=1 tests/static-showcase-candlestick.test.mjs`

Expected: FAIL，chart module 尚不存在。

- [ ] **Step 2: 實作 chart model 與 Canvas renderer**

`bond-candlestick-chart.js` 直接 import Task 4 的 `bond-technical-analysis.js`；瀏覽器不得以另一套公式重新計算指標。

- [ ] **Step 3: 接入 detail tabs 與 accessibility**

window resize、devicePixelRatio、pointer/touch/keyboard 均有界；canvas 旁保留最新 OHLC 文字與可開啟資料表。

- [ ] **Step 4: Focused GREEN**

Run: `node --test --test-concurrency=1 tests/static-showcase-candlestick.test.mjs tests/static-showcase-bond-detail.test.mjs tests/static-showcase-bond-ui.test.mjs`

Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add static-showcase/assets/bond-candlestick-chart.js static-showcase/assets/bond-detail-page.js static-showcase/bonds.html static-showcase/assets/app.css tests/static-showcase-candlestick.test.mjs tests/static-showcase-bond-detail.test.mjs
git commit -m "feat: add accessible CB candlestick analysis"
```

---

### Task 9: 完成每日全名冊同步、歷史更正證據與 22:30 排程入口

**Files:**
- Create: `scripts/run-nightly-market-refresh.mjs`
- Modify: `scripts/refresh-static-showcase-data.mjs`
- Modify: `scripts/backfill-bond-market-history.mjs`
- Create: `tests/nightly-market-refresh.test.mjs`
- Modify: `tests/public-site-refresh-schedule.test.mjs`
- Modify: `tests/refresh-static-showcase-data.test.mjs`
- Modify: `docs/sync-schedule.md`

**Operational contract:**

- CLI `node scripts/run-nightly-market-refresh.mjs --date YYYY-MM-DD` 只接受 Asia/Taipei 22:30 所屬資料日；手動重跑使用同一 candidate validation，不另設 bypass。
- 每次從完整已驗證 11406 roster 產生 current set：新增、更新、archive；無成交只保留 active + no-trade state。
- 必要來源（roster/core terms/core CB quote）任一失敗，不切新 pointer。
- optional issuer research／institution／redemption／underwriting 只能使用自己前一個 validated snapshot 並標 stale；不可跨市場／公司借用。
- history correction 只接受 data-only manifest：`bondCode/date/sourceId/retrievedAt/sha256/beforeHash/afterHash`，先驗證官方 correction evidence，再重建 candidate；一般 nightly path 不接受 correction callback/path。
- runner 成功後只產生已驗證的 static build input；真正 production deployment 仍須由選定 hosting 的排程／build hook 呼叫。hosting token、build hook URL 不寫入 repo。
- `docs/sync-schedule.md` 以 UTF-8 重寫相關段落，明列 22:30、錯誤策略、封存、不覆寫歷史及部署責任邊界。

- [ ] **Step 1: 寫 RED runner tests**

完全 mock 已核准 fetch 邊界，驗 22:30 Taipei date、full roster add/update/archive、zero-trade active、required failure rollback、optional stale、wrong date、unsupported option、no external deployment side effect。

Run: `node --test --test-concurrency=1 tests/nightly-market-refresh.test.mjs tests/public-site-refresh-schedule.test.mjs`

Expected: FAIL，runner 尚不存在。

- [ ] **Step 2: 實作 data-only runner 與 time contract**

不得在 import 時執行 CLI，不得讀 secret；CLI exact args 在任何 IO 前驗證。

- [ ] **Step 3: 寫 history correction RED/GREEN**

驗 correction evidence 欄位、hash、只改指定日、前後 generation 可追溯；缺證據、錯 hash、跨 bond 或額外欄位全部拒絕。

- [ ] **Step 4: Atomic regression**

Run: `node --test --test-concurrency=1 tests/nightly-market-refresh.test.mjs tests/refresh-static-showcase-data.test.mjs tests/build-bond-market-snapshot.test.mjs tests/public-site-refresh-schedule.test.mjs`

Expected: PASS，並逐 byte 驗 previous `current.json`、workbench、history 未被失敗 candidate 改寫。

- [ ] **Step 5: Commit**

```powershell
git add scripts/run-nightly-market-refresh.mjs scripts/refresh-static-showcase-data.mjs scripts/backfill-bond-market-history.mjs tests/nightly-market-refresh.test.mjs tests/public-site-refresh-schedule.test.mjs tests/refresh-static-showcase-data.test.mjs docs/sync-schedule.md
git commit -m "feat: schedule full CB roster refresh"
```

---

### Task 10: 全市場不變條件、視覺 QA、正式 build 與發布前驗收

**Files:**
- Create: `tests/cb-workbench-acceptance.test.mjs`
- Modify: `tests/static-showcase-pages.test.mjs`
- Modify: `tests/formal-bond-pages.test.mjs`
- Modify: `tests/static-showcase-artifacts.test.mjs`
- Modify: `README.md`
- Modify: `docs/data-source-registry.md`

**Acceptance matrix:**

- 六檔設計樣本：聯電一、金像電三、博智二、偉詮電一、至上 11、順德一；fixture 只存公開欄位與資料日，不存登入內容或第三方專有分數。
- Edge cases：零成交、無 OHLC、日期 mismatch、同公司多 CB、新增、到期、下櫃、贖回、餘額歸零、optional stale、歷史累積不足、archive direct URL。
- 全市場 invariants：bondCode unique；issuerCode exact；term/view/history/workbench 一致；outstanding/remaining 不超發行量；策略跨來源日期一致；archive 不出現在預設 active list。
- UI：search、sort、pagination、archive toggle、detail deep link、desktop tabs、mobile collapsible、dark/light、keyboard、focus、contrast、no horizontal whole-page scroll。
- 安全：一般測試封鎖 live network；沒有 raw response、公司個資、登入 session、third-party token、rejection body、未核准 URL 被 stage。
- 內容：沒有綜合投資總分、買賣／放空／下單建議、TCRI 仿造、hedge ratio 或第三方 layout copy。

- [ ] **Step 1: 寫 end-to-end offline RED**

從匿名完整 candidate 走 builder → outer refresh → stage → static page loaders，驗 artifact/runtime/routes/search/archive/chart model 全部串接。

Run: `node --test --test-concurrency=1 tests/cb-workbench-acceptance.test.mjs tests/static-showcase-pages.test.mjs tests/formal-bond-pages.test.mjs tests/static-showcase-artifacts.test.mjs`

- [ ] **Step 2: 修正所有具體 integration failure**

每次只處理一個失敗根因並先跑該 focused file；不得用放寬 parser、刪測試或新增 fallback 取得全綠。

- [ ] **Step 3: 完整靜態驗證**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
node --test --test-concurrency=1
git diff --check
```

Expected: lint 0 errors（僅可保留已記錄的既有 warnings）、typecheck 0、build/stage 0、full tests 0 failure、diff-check 0。

- [ ] **Step 4: 瀏覽器視覺驗收（本機、無 live fetch）**

啟動 `npm.cmd run dev`（BelowNormal），以 in-app browser 檢查：

1. 1440px 淺色列表與詳細頁。
2. 1440px 深色列表與詳細頁。
3. 390px 手機搜尋、收合區與 K 線。
4. 鍵盤搜尋、排序、開啟／關閉 detail、chart hover 替代文字。
5. archive toggle 與固定 archived fixture `?bond=90001` direct URL。

每個視圖截圖留在測試紀錄；若文字對比、裁切或橫向滑動不合格，修正後重跑相同 viewport。

- [ ] **Step 5: 更新公開方法與來源說明**

README 與 source registry docs 僅描述實際已核准來源、公式、資料日、stale/archive/accumulating 意義與無投資建議界線；不得宣稱目前沒有來源的 TTM/PS/TCRI 已提供。

- [ ] **Step 6: Final review and commit**

先使用 `superpowers:requesting-code-review`；處理所有 Critical/Important 後重跑 Step 3。然後：

```powershell
git add tests/cb-workbench-acceptance.test.mjs tests/static-showcase-pages.test.mjs tests/formal-bond-pages.test.mjs tests/static-showcase-artifacts.test.mjs README.md docs/data-source-registry.md
git commit -m "test: verify public CB analysis workbench"
```

- [ ] **Step 7: Production publication（需另行明確授權）**

使用 `sites:sites-hosting` 或最終選定 hosting 的受控部署流程建立新 version，先驗 staging URL，再要求使用者明確允許公開 production deploy。發布後只做 read-only smoke；若資料或 UI 有誤，不重抓資料，回滾至上一個已驗證 version。

---

## Deferred Separate Work

- 興櫃「進度雷達」與「IPO 行程」中備註／狀態為「撤件」或「自撤」的資料移除，依已核准 IPO 規格另開一個小型 TDD 任務處理；不得混入本 CB 工作台 commits。
- TWSA 承銷頁 live DOM drift 與法人千分位正規化仍沿用 Task 5 的獨立 source-contract 修正流程；在完成嚴格驗證前，工作台只顯示 unavailable/stale，不放寬來源 parser。
- 盤中即時行情、下單、個人化警示、TCRI、專有估值與自動避險不在本計畫。
