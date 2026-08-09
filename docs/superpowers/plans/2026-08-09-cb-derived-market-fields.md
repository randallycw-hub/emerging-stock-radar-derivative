# 可轉債衍生市場欄位 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以已驗證面額、流通餘額、成交張數與補充快照，正確產生剩餘張數、剩餘比例、成交週轉率、法人累計及提前贖回事件，並原子發布到既有盤後 generation。

**Architecture:** 將精確算術集中於 `bond-derived-metrics.ts`，避免 UI 自行換算。`buildBondMarketViews` 只按 exact bond code 合併補充快照並產生完整 `BondMarketView`；建置腳本同一批次輸出核心 view 與補充快照，失敗時不切換 generation pointer。

**Tech Stack:** TypeScript、Node.js 22 ESM、BigInt、既有 decimal 工具、Node `node:test`、靜態 generation 發布器。

## Global Constraints

- 必須先依序完成 `2026-08-09-cb-supplemental-sources.md` 與 `2026-08-09-cb-issuer-research.md`；本計畫擴充 `BondMarketView` 時必須保留已接入的 `issuerResearch`。
- 「剩餘張數」只在面額規則已驗證、流通餘額為整數且可整除時產生；不得四捨五入。
- `成交週轉率 = CB 成交張數 ÷ 剩餘張數 × 100%`；不得使用成交金額欄位 `turnover`。
- 成交張數日期與流通餘額資料日期不一致時，成交週轉率必須是 `null`。
- 法人 5／20 日累計只加總該債券實際存在的有效交易日，不補曆日零值。
- 提前贖回優先於賣回，賣回優先於到期；所有事件都要保留日期與來源狀態。
- 缺值維持 `null`／`—`，不得產生估算值、交易評分或買賣建議。

---

### Task 1: 精確剩餘籌碼與成交週轉算術

**Files:**
- Create: `lib/market-data/bond-derived-metrics.ts`
- Create: `tests/bond-derived-metrics.test.mjs`

**Interfaces:**
- Consumes:

```ts
export type BondRemainingMetricInput = {
  issueAmount: string | null;
  outstandingAmount: string | null;
  outstandingDataDate: string | null;
  faceValueTwd: string | null;
  cbTradeUnits: string;
  cbTradeDate: string | null;
};
```

- Produces:

```ts
export type BondRemainingMetrics = {
  remainingUnits: string | null;
  remainingRatio: string | null;
  dailyTurnoverRate: string | null;
  missingReasons: readonly (
    | "NO_VERIFIED_FACE_VALUE"
    | "OUTSTANDING_NOT_INTEGER"
    | "OUTSTANDING_NOT_DIVISIBLE"
    | "INVALID_ISSUE_AMOUNT"
    | "BALANCE_TRADE_DATE_MISMATCH"
    | "ZERO_REMAINING_UNITS"
  )[];
};

export function deriveBondRemainingMetrics(input: BondRemainingMetricInput): BondRemainingMetrics;
```

- [ ] **Step 1: Write failing exact-arithmetic tests**

```js
test("derives exact remaining units, remaining ratio and daily turnover", () => {
  assert.deepEqual(deriveBondRemainingMetrics({
    issueAmount: "150000000", outstandingAmount: "123100000",
    outstandingDataDate: "2026-08-07", faceValueTwd: "100000",
    cbTradeUnits: "2462", cbTradeDate: "2026-08-07",
  }), {
    remainingUnits: "1231", remainingRatio: "82.07", dailyTurnoverRate: "200",
    missingReasons: [],
  });
});

test("never rounds a non-divisible balance into remaining units", () => {
  const result = deriveBondRemainingMetrics({
    issueAmount: "150000000", outstandingAmount: "123100001",
    outstandingDataDate: "2026-08-07", faceValueTwd: "100000",
    cbTradeUnits: "1", cbTradeDate: "2026-08-07",
  });
  assert.equal(result.remainingUnits, null);
  assert.equal(result.dailyTurnoverRate, null);
  assert.ok(result.missingReasons.includes("OUTSTANDING_NOT_DIVISIBLE"));
});

test("does not compute turnover across different data dates", () => {
  const result = deriveBondRemainingMetrics({
    issueAmount: "150000000", outstandingAmount: "123100000",
    outstandingDataDate: "2026-08-06", faceValueTwd: "100000",
    cbTradeUnits: "10", cbTradeDate: "2026-08-07",
  });
  assert.equal(result.remainingUnits, "1231");
  assert.equal(result.dailyTurnoverRate, null);
  assert.ok(result.missingReasons.includes("BALANCE_TRADE_DATE_MISMATCH"));
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/bond-derived-metrics.test.mjs`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement minimal exact arithmetic**

Validate integer text with `/^(?:0|[1-9]\d*)$/`; use `BigInt` modulus/division for `remainingUnits`; use existing `divideDecimal`／`multiplyDecimal` for two-decimal percentage output. Reject `outstandingAmount > issueAmount`, non-positive face value and non-integer trade units with `TypeError` because those are contract violations, not displayable missing data.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/bond-derived-metrics.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/market-data/bond-derived-metrics.ts tests/bond-derived-metrics.test.mjs
git commit -m "feat: derive exact CB remaining metrics"
```

### Task 2: 法人累計與事件優先摘要

**Files:**
- Modify: `lib/market-data/bond-supplemental.ts`
- Modify: `tests/bond-supplemental-snapshot.test.mjs`

**Interfaces:**
- Consumes: `CbSupplementalSnapshot.institutionHistory` and `.redemptions`。
- Produces:

```ts
export type CbInstitutionSummary = {
  dataDate: string | null;
  dailyNetUnits: string | null;
  net5dUnits: string | null;
  net20dUnits: string | null;
};

export function summarizeCbInstitution(
  snapshot: CbSupplementalSnapshot | undefined,
  bondCode: string,
  asOfDate: string,
): CbInstitutionSummary;

export function currentCbRedemption(
  snapshot: CbSupplementalSnapshot | undefined,
  bondCode: string,
  asOfDate: string,
): CbRedemptionEvent | null;
```

- [ ] **Step 1: Write failing accumulation tests**

```js
test("uses the newest 1, 5 and 20 actual trading records", () => {
  const summary = summarizeCbInstitution(snapshotWith25TradingDays(), "54642", "2026-08-07");
  assert.equal(summary.dailyNetUnits, "69");
  assert.equal(summary.net5dUnits, "145");
  assert.equal(summary.net20dUnits, "420");
});

test("returns only redemption events still relevant to the active bond", () => {
  assert.equal(currentCbRedemption(snapshot, "31312", "2026-08-07")?.delistingDate, "2026-09-21");
  assert.equal(currentCbRedemption(snapshot, "31312", "2026-09-22"), null);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/bond-supplemental-snapshot.test.mjs --test-name-pattern="actual trading|redemption events"`

Expected: FAIL because both exported functions are missing.

- [ ] **Step 3: Implement deterministic summaries**

Filter records by exact code and `tradingDate <= asOfDate`, sort descending, sum signed integer `totalNetUnits` for slices `[0,1)`, `[0,5)`, `[0,20)`. Return `null` for 5d／20d when fewer than 5／20 records exist, instead of presenting a partial period as complete. For redemptions, require `announcementDate <= asOfDate <= delistingDate`, then choose the newest announcement deterministically.

- [ ] **Step 4: Run GREEN and commit**

Run: `node --test tests/bond-supplemental-snapshot.test.mjs`

Expected: PASS.

```bash
git add lib/market-data/bond-supplemental.ts tests/bond-supplemental-snapshot.test.mjs
git commit -m "feat: summarize CB institutions and redemption events"
```

### Task 3: 擴充 BondMarketView

**Files:**
- Modify: `lib/market-data/types.ts`
- Modify: `lib/market-data/bond-market-view.ts`
- Modify: `scripts/build-bond-market-snapshot.mjs`
- Modify: `tests/bond-market-view.test.mjs`
- Modify: `tests/build-bond-market-snapshot.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–2 and `CbSupplementalSnapshot`。
- Changes `buildBondMarketViews` input to:

```ts
export function buildBondMarketViews(input: {
  asOfDate: string;
  bonds: readonly Record<string, unknown>[];
  cbQuotes: readonly CbQuote[];
  stockCloses: readonly StockClose[];
  conversionPrices: readonly ConversionPriceVersion[];
  supplemental?: CbSupplementalSnapshot;
}): readonly BondMarketView[];
```

- Adds exact fields to `BondMarketView`:

```ts
outstandingDataDate: string | null;
remainingUnits: string | null;
remainingRatio: string | null;
dailyTurnoverRate: string | null;
institutionDataDate: string | null;
institutionNetUnits: string | null;
institutionNet5dUnits: string | null;
institutionNet20dUnits: string | null;
redemptionEvent: CbRedemptionEvent | null;
nextEventType: "redemption" | "put" | "maturity";
nextEventDate: string;
daysToNextEvent: number;
dataQuality: "complete" | "partial" | "date_mismatch";
```

- [ ] **Step 1: Write failing view tests**

```js
test("enriches a view with remaining units, turnover, institutions and redemption priority", () => {
  const view = buildBondMarketViews(fullInputWithSupplemental())[0];
  assert.equal(view.remainingUnits, "1231");
  assert.equal(view.remainingRatio, "82.07");
  assert.equal(view.dailyTurnoverRate, "200");
  assert.equal(view.institutionNetUnits, "69");
  assert.equal(view.nextEventType, "redemption");
  assert.equal(view.nextEventDate, "2026-09-21");
});
```

Add separate cases for no supplemental snapshot, non-divisible balance, date mismatch, no put date, expired redemption and insufficient 5／20 history.

- [ ] **Step 2: Run RED**

Run: `node --test tests/bond-market-view.test.mjs tests/build-bond-market-snapshot.test.mjs`

Expected: FAIL on missing fields/signature.

- [ ] **Step 3: Preserve 11406 balance date**

Change `bondInputsFrom11406Rows` to map source `資料日期`／`DataDate` into ISO `outstandingDataDate`; `parseBondInput` must require a valid date whenever `outstandingAmount` is present. Pass `input.supplemental?.unitFaceValueTwd ?? null` into `deriveBondRemainingMetrics`.

- [ ] **Step 4: Implement event and quality logic**

Use event priority `redemption > nextPutDate > maturityDate`. `dataQuality` is `date_mismatch` when derived metrics include `BALANCE_TRADE_DATE_MISMATCH`; otherwise `partial` when core `missingReasons` or derived missing reasons exist; otherwise `complete`. Append derived reason strings to `missingReasons` without renaming existing reason codes.

- [ ] **Step 5: Run GREEN and commit**

Run: `node --test tests/bond-derived-metrics.test.mjs tests/bond-supplemental-snapshot.test.mjs tests/bond-market-view.test.mjs tests/build-bond-market-snapshot.test.mjs`

Expected: PASS.

```bash
git add lib/market-data/types.ts lib/market-data/bond-market-view.ts scripts/build-bond-market-snapshot.mjs tests/bond-market-view.test.mjs tests/build-bond-market-snapshot.test.mjs
git commit -m "feat: enrich CB market views"
```

### Task 4: 將補充快照接入原子 generation

**Files:**
- Modify: `scripts/build-bond-market-snapshot.mjs`
- Modify: `scripts/refresh-static-showcase-data.mjs`
- Modify: `tests/build-bond-market-snapshot.test.mjs`
- Modify: `tests/refresh-static-showcase-data.test.mjs`
- Modify: `tests/formal-market-data-contract.test.mjs`

**Interfaces:**
- Consumes: `fetchCbSupplementalSources` and `buildCbSupplementalSnapshot`。
- Produces generation files `bond-market-view.json`, `bond-market-history.json`, `conversion-prices.json`, `bond-supplemental.json` and runtime key `datasets.bondSupplemental`。

- [ ] **Step 1: Write failing atomic-publication tests**

```js
test("writes the supplemental artifact and exposes it in generation runtime", async () => {
  const result = await buildBondMarketSnapshot(fixtureInput());
  assert.equal(result.runtime.datasets.bondSupplemental.endsWith("/bond-supplemental.json"), true);
  assert.equal((await readJson(result.paths.bondSupplemental)).schemaVersion, 1);
});

test("reuses validated previous supplemental data when one source is unavailable", async () => {
  const result = await refreshStaticShowcase({ supplementalFetcher: partialFailureFetcher });
  assert.equal(result.supplemental.sources.underwriting.state, "stale");
  assert.deepEqual(result.supplemental.underwritingCases, previous.underwritingCases);
});

test("does not switch the generation pointer when the supplemental artifact is corrupt", async () => {
  await assert.rejects(() => refreshStaticShowcase({ supplementalBuilder: corruptBuilder }), /supplemental/);
  assert.deepEqual(await readJson(pointerPath), previousPointer);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/build-bond-market-snapshot.test.mjs tests/refresh-static-showcase-data.test.mjs tests/formal-market-data-contract.test.mjs`

Expected: FAIL because the runtime does not expose `bondSupplemental`.

- [ ] **Step 3: Implement generation integration**

Before building views, read the previous generation’s `bond-supplemental.json` through the existing pointer, validate it with `parseCbSupplementalSnapshot`, settle current source fetches, build the new snapshot, and pass it into `buildBondMarketViews`. Stage all JSON files first; verify schema, URLs, hashes and record arrays; only then replace the generation pointer. Do not write supplemental data into the 11406 dataset or D1 `bond_issuances` table.

- [ ] **Step 4: Add runtime and manifest contracts**

`buildGenerationRuntime` must emit:

```js
datasets: {
  ...existingDatasets,
  bondSupplemental: `${base}/bond-supplemental.json`,
}
```

The manifest market section records each supplemental source state/data date but the public CB page must not render a methodology panel.

- [ ] **Step 5: Run focused and full gates**

Run: `node --test tests/build-bond-market-snapshot.test.mjs tests/refresh-static-showcase-data.test.mjs tests/formal-market-data-contract.test.mjs`

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm test`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-bond-market-snapshot.mjs scripts/refresh-static-showcase-data.mjs tests/build-bond-market-snapshot.test.mjs tests/refresh-static-showcase-data.test.mjs tests/formal-market-data-contract.test.mjs
git commit -m "feat: publish CB supplemental market data"
```

### Task 5: Live smoke 與 production 核准

**Files:**
- Create: `docs/source-verification/cb-supplemental-live-smoke.md`
- Modify: `docs/data-source-registry.md`

**Interfaces:**
- Consumes: the completed collectors and parsers。
- Produces: dated evidence and resource status promotion only when every required check passes。

- [ ] **Step 1: Run the one-shot read-only collector**

Run under BelowNormal priority with no more than two concurrent requests:

```powershell
$p = Start-Process -FilePath node -ArgumentList @('scripts/build-bond-market-snapshot.mjs','--live-smoke') -WindowStyle Hidden -PassThru
$p.PriorityClass = 'BelowNormal'
$p | Wait-Process
$p.Refresh()
if ($p.ExitCode -ne 0) { exit $p.ExitCode }
```

Expected: HTTP 200, exact Content-Type, schemas match fixtures, institution data date equals the latest completed trading day, redemption and underwriting distinguish valid empty sets from failures, and no credentials/cookies are used.

- [ ] **Step 2: Record exact evidence**

Document run time, requested URLs/methods, final URLs, response sizes, row counts, data dates, hashes, parser counts, cross-source bond-code match rate, rejected rows and all warnings. Do not paste complete third-party responses.

- [ ] **Step 3: Re-run project gates**

Run: `npm test`

Run: `npm run lint`

Run: `npm run typecheck`

Expected: all exit 0 after live data is discarded from the worktree.

- [ ] **Step 4: Promote only passed resources**

Change an individual resource from `VERIFIED_FOR_IMPLEMENTATION` to `APPROVED_FOR_PRODUCTION` only when its fixture, live smoke, attribution, failure behavior and UI scope all pass. Leave a failed resource at its earlier status; the other two may proceed independently.

- [ ] **Step 5: Commit**

```bash
git add docs/source-verification/cb-supplemental-live-smoke.md docs/data-source-registry.md
git commit -m "docs: approve verified CB supplemental sources"
```
