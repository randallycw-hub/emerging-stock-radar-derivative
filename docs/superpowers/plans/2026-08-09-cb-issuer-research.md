# 可轉債發行公司研究資料 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以發行公司代碼精確接入上市與上櫃公司的產業及最新月營收，讓可轉債詳情可核對公司基本面，同時不把名稱模糊比對或失敗來源帶入正式行情。

**Architecture:** 保留既有 94025 興櫃月營收契約，抽出可重用的同欄位 CSV parser，再為上市 `t187ap05_L.csv` 與上櫃 `t187ap05_O.csv` 建立兩個精確 source policy。`CbIssuerResearchSnapshot` 只投影目前 11406 可轉債發行公司的精確代碼；跨市場重複、名稱衝突或來源失敗皆顯式隔離。每個市場可沿用自己的上一版成功 section，不阻塞既有 CB 價格、條款或事件快照。

**Tech Stack:** TypeScript、Node.js 22 ESM、原生 `fetch`、Node `node:test`、既有 94025 parser／日期／decimal 工具及原子 generation 發布流程。

## Global Constraints

- 必須先保留並通過所有既有 94025 測試；不得改變興櫃資料集 94025 的來源身份或發布語義。
- CPU 密集工作最多 2 執行緒，live smoke 使用 `BelowNormal` 優先權；一般測試不得提高並行度。
- 唯一允許的新資料 URL 是 `https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv` 與 `https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv`；redirect、非 CSV Content-Type、超量、未知欄位或空資料一律拒絕。
- 上市與上櫃資料只用於 11406 發行公司代碼的精確補充；不得靠公司名稱、簡稱或前綴模糊合併。
- 使用來源提供的月增率／年增率，不由已四捨五入數字重新計算；營收單位固定保留 `仟元`。
- `備註` 僅留在 raw fixture 稽核層，不進入公開公司研究模型。
- 新來源在 fixture、live smoke、授權與登錄審查前最多為 `VERIFIED_FOR_IMPLEMENTATION`，不得先標記 production approved。
- 公司研究資料是補充來源；任一市場失敗不得刪除或污染 CB 主資料，也不得以第三方網站自動 fallback。

---

### Task 1: 共用月營收契約與兩個精確來源政策

**Files:**
- Modify: `lib/source-verification/source-94025.ts`
- Create: `lib/source-verification/source-cb-issuer-research.ts`
- Modify: `tests/source-verification/source-94025.test.mjs`
- Create: `tests/source-verification/source-cb-issuer-research.test.mjs`
- Create: `tests/fixtures/source-verification/cb-issuer-research/listed-minimal.csv`
- Create: `tests/fixtures/source-verification/cb-issuer-research/otc-minimal.csv`
- Create: `tests/fixtures/source-verification/cb-issuer-research/metadata.json`
- Create: `docs/source-verification/cb-issuer-research-evidence.md`

**Interfaces:**
- Preserves: `parse94025Csv(text)` and `normalize94025Row(row)` unchanged for existing callers。
- Produces:

```ts
export function parseMonthlyRevenueCsv(
  text: string,
  sourceName: string,
): Source94025Row[];

export const CB_ISSUER_RESEARCH_SOURCE_POLICIES = {
  listed: {
    sourceId: "data-gov-18420-listed-monthly-revenue",
    url: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
    market: "listed",
  },
  otc: {
    sourceId: "data-gov-56510-otc-monthly-revenue",
    url: "https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv",
    market: "otc",
  },
} as const;
```

- [ ] **Step 1: Save reviewed minimal fixtures and integrity metadata**

Preserve exact header and representative live rows from each CSV. `metadata.json` records metadata page, exact resource URL, retrieval time, HTTP status, final URL, Content-Type, byte count, full-response SHA-256, selected row identities and OGL 1.0 evidence. Minimal CSV hashes must also be recorded; do not fabricate hashes in tests.

- [ ] **Step 2: Write failing parser and policy tests**

```js
test("listed and otc policies allow only the two reviewed CSV resources", () => {
  assert.equal(CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed.url,
    "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv");
  assert.equal(CB_ISSUER_RESEARCH_SOURCE_POLICIES.otc.url,
    "https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv");
});

test("shared monthly revenue parser preserves all 14 exact aliases", async () => {
  const [row] = parseMonthlyRevenueCsv(await fixture("listed-minimal.csv"), "listed monthly revenue");
  assert.equal(row.companyCode, "1101");
  assert.equal(normalize94025Row(row).revenueUnit, "仟元");
});
```

Also require unknown／missing headers, duplicate month-company identity, invalid ROC dates, invalid decimals, HTML bodies and empty datasets to fail closed. Re-run legacy 94025 alias, normalization and schema-comparison tests in the same command.

- [ ] **Step 3: Run RED**

Run: `node --test tests/source-verification/source-94025.test.mjs tests/source-verification/source-cb-issuer-research.test.mjs`

Expected: FAIL because the shared export and issuer-research policy are absent.

- [ ] **Step 4: Extract the smallest backward-compatible parser seam**

Rename no existing public types. Export `parseMonthlyRevenueCsv(text, sourceName)` as the strict shared implementation; make `parse94025Csv(text)` delegate to it with source label `94025 CSV`. Keep exact aliases, duplicate checks and normalization behavior identical. In `source-cb-issuer-research.ts`, freeze the two policies and expose a URL/method validator that accepts GET only, rejects credentials, fragments, query mutations, redirects and alternate hosts.

- [ ] **Step 5: Run GREEN and commit**

Run: `node --test tests/source-verification/source-94025.test.mjs tests/source-verification/source-cb-issuer-research.test.mjs`

Expected: PASS.

```bash
git add lib/source-verification/source-94025.ts lib/source-verification/source-cb-issuer-research.ts tests/source-verification/source-94025.test.mjs tests/source-verification/source-cb-issuer-research.test.mjs tests/fixtures/source-verification/cb-issuer-research docs/source-verification/cb-issuer-research-evidence.md
git commit -m "test: verify CB issuer revenue sources"
```

### Task 2: 精確發行公司投影、來源回退與研究快照

**Files:**
- Modify: `lib/source-verification/source-cb-issuer-research.ts`
- Modify: `tests/source-verification/source-cb-issuer-research.test.mjs`
- Create: `lib/market-data/cb-issuer-research.ts`
- Create: `tests/cb-issuer-research.test.mjs`

**Interfaces:**
- Consumes: exact `issuerCode` set from normalized 11406 bonds and independently settled listed／OTC source results。
- Produces:

```ts
export type CbIssuerResearchRecord = {
  issuerCode: string;
  issuerName: string;
  market: "listed" | "otc";
  industryName: string;
  revenueMonth: string;
  sourcePublishedOn: string;
  revenueUnit: "仟元";
  currentMonthRevenue: string;
  monthOverMonthPercent: string | null;
  yearOverYearPercent: string | null;
  cumulativeRevenue: string | null;
  cumulativeYearOverYearPercent: string | null;
};

export type CbIssuerResearchSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  records: readonly CbIssuerResearchRecord[];
  sources: {
    listed: { status: "current" | "stale" | "unavailable"; dataDate: string | null; fetchedAt: string | null };
    otc: { status: "current" | "stale" | "unavailable"; dataDate: string | null; fetchedAt: string | null };
  };
  diagnostics: readonly { issuerCode: string; reason: "CROSS_MARKET_CONFLICT" | "NAME_CONFLICT" | "MISSING_REVENUE" }[];
};

export async function fetchCbIssuerResearchSources(options?: {
  fetchImpl?: typeof fetch;
}): Promise<{ listed: PromiseSettledResult<string>; otc: PromiseSettledResult<string> }>;

export function buildCbIssuerResearchSnapshot(input: {
  generatedAt: string;
  issuers: readonly { issuerCode: string; issuerName: string }[];
  listed: PromiseSettledResult<string>;
  otc: PromiseSettledResult<string>;
  previous?: CbIssuerResearchSnapshot;
}): CbIssuerResearchSnapshot;
```

- [ ] **Step 1: Write failing exact-join tests**

```js
test("projects only current CB issuers by exact company code", () => {
  const snapshot = buildCbIssuerResearchSnapshot(input({ issuers: [issuer("1101")] }));
  assert.deepEqual(snapshot.records.map(row => row.issuerCode), ["1101"]);
  assert.equal(snapshot.records[0].industryName, "水泥工業");
});

test("excludes rather than guesses when one issuer occurs in both markets", () => {
  const snapshot = buildCbIssuerResearchSnapshot(crossMarketConflictInput("9999"));
  assert.equal(snapshot.records.some(row => row.issuerCode === "9999"), false);
  assert.deepEqual(snapshot.diagnostics, [{ issuerCode: "9999", reason: "CROSS_MARKET_CONFLICT" }]);
});
```

Also test exact issuer-code/name agreement after Unicode NFC plus whitespace-only normalization, newest `(sourcePublishedOn, revenueMonth)` selection, stable ordering, optional ratio nulls, invalid previous snapshot rejection, one-market stale fallback and no previous data => `unavailable`.

- [ ] **Step 2: Run RED**

Run: `node --test tests/source-verification/source-cb-issuer-research.test.mjs tests/cb-issuer-research.test.mjs`

Expected: FAIL because fetch and snapshot builder are absent.

- [ ] **Step 3: Implement bounded two-source fetch**

Fetch both exact URLs concurrently with `Promise.allSettled`; this is the maximum concurrency of 2. Require HTTP 200, final URL equality, a CSV-compatible Content-Type and at most 2,000,000 response bytes per source. Decode UTF-8 with BOM handling, parse through `parseMonthlyRevenueCsv`, and never request another URL after failure.

- [ ] **Step 4: Implement deterministic issuer projection and per-market fallback**

Normalize each successful source, select the newest row per company code, then project only the deduplicated 11406 issuer set. Require issuer names to match after Unicode NFC, trim and internal ASCII／full-width whitespace collapse only; do not remove legal suffixes or perform fuzzy matching. Otherwise record `NAME_CONFLICT` and exclude. If the same exact code exists in both current market sources, record `CROSS_MARKET_CONFLICT` and exclude. On source failure, reuse only the previous records belonging to that same market and mark them `stale`; never replace listed data with OTC or vice versa. Preserve no raw `noteText`.

- [ ] **Step 5: Validate the full snapshot envelope**

Add `parseCbIssuerResearchSnapshot(value)` that rejects unknown schema version, invalid timestamps/dates, duplicate issuer codes, invalid decimals, market/source-status mismatch and diagnostics for codes that still appear in records. Return cloned immutable data so callers cannot mutate a prior published snapshot.

- [ ] **Step 6: Run GREEN and commit**

Run: `node --test tests/source-verification/source-cb-issuer-research.test.mjs tests/cb-issuer-research.test.mjs`

Expected: PASS.

```bash
git add lib/source-verification/source-cb-issuer-research.ts lib/market-data/cb-issuer-research.ts tests/source-verification/source-cb-issuer-research.test.mjs tests/cb-issuer-research.test.mjs
git commit -m "feat: build exact CB issuer research snapshot"
```

### Task 3: 接入 BondMarketView 與原子 generation

**Files:**
- Modify: `lib/market-data/types.ts`
- Modify: `lib/market-data/bond-market-view.ts`
- Modify: `tests/bond-market-view.test.mjs`
- Modify: `scripts/build-bond-market-snapshot.mjs`
- Modify: `scripts/refresh-static-showcase-data.mjs`
- Modify: `scripts/stage-static-showcase.mjs`
- Modify: `tests/build-bond-market-snapshot.test.mjs`
- Modify: `tests/refresh-static-showcase-data.test.mjs`
- Modify: `tests/stage-static-showcase.test.mjs`
- Modify: `tests/formal-market-data-contract.test.mjs`

**Interfaces:**
- Consumes: validated `CbIssuerResearchSnapshot` and existing 11406 issuer identity。
- Extends `BondMarketView`:

```ts
issuerResearch: {
  market: "listed" | "otc";
  industryName: string;
  revenueMonth: string;
  sourcePublishedOn: string;
  revenueUnit: "仟元";
  currentMonthRevenue: string;
  monthOverMonthPercent: string | null;
  yearOverYearPercent: string | null;
  cumulativeRevenue: string | null;
  cumulativeYearOverYearPercent: string | null;
} | null;
```

- Produces: `cb-issuer-research.json`, enriched `bond-market-view.json`, manifest entry and runtime `datasets.cbIssuerResearch`。

- [ ] **Step 1: Write failing view and generation contract tests**

```js
test("joins issuer research to every bond of the same exact issuer code", () => {
  const views = buildBondMarketViews(fixture({ issuerResearch: [research("1101")] }));
  assert.equal(views[0].issuerResearch?.industryName, "水泥工業");
  assert.equal(views[0].issuerResearch?.revenueMonth, "2026-07");
});

test("publishes issuer research in the same generation as enriched bond views", async () => {
  assert.ok(generatedFiles.includes("cb-issuer-research.json"));
  assert.match(runtime, /datasets:\{[^}]*cbIssuerResearch/s);
});
```

Also assert absent research yields `issuerResearch: null`, duplicate research issuer codes fail closed, and no name-only record can enter a view. Generation failure before pointer replacement leaves every previous file/current pointer unchanged.

- [ ] **Step 2: Run RED**

Run: `node --test tests/bond-market-view.test.mjs tests/build-bond-market-snapshot.test.mjs tests/refresh-static-showcase-data.test.mjs tests/stage-static-showcase.test.mjs tests/formal-market-data-contract.test.mjs`

Expected: FAIL on missing type, artifact and runtime key.

- [ ] **Step 3: Extend the view by exact issuer code**

Accept `issuerResearch?: readonly CbIssuerResearchRecord[]` in `buildBondMarketViews`. Validate unique issuer codes before creating a `Map`; attach a cloned public subset to every exact issuer-code match. Never compare or normalize company names in this presentation join because identity was already verified by the snapshot builder.

- [ ] **Step 4: Stage the research snapshot atomically**

Before fetching, validate the prior generation’s `cb-issuer-research.json` when present. Settle current listed／OTC sources, build the next snapshot, pass its records into `buildBondMarketViews`, and stage `cb-issuer-research.json`, `bond-market-view.json`, hashes, manifest and runtime in one candidate directory. Verify both envelopes and cross-file issuer values before replacing the generation pointer. An issuer-research failure may publish stale／unavailable supplemental status but may not change or erase the verified CB market values.

- [ ] **Step 5: Update stage/runtime allowlists**

Add only `datasets.cbIssuerResearch` and `cb-issuer-research.json`; do not expose raw full-market L/O CSVs to the browser. Keep the published artifact limited to active 11406 issuer records and compact source statuses.

- [ ] **Step 6: Run GREEN and commit**

Run: `node --test tests/bond-market-view.test.mjs tests/build-bond-market-snapshot.test.mjs tests/refresh-static-showcase-data.test.mjs tests/stage-static-showcase.test.mjs tests/formal-market-data-contract.test.mjs`

Expected: PASS.

```bash
git add lib/market-data/types.ts lib/market-data/bond-market-view.ts tests/bond-market-view.test.mjs scripts/build-bond-market-snapshot.mjs scripts/refresh-static-showcase-data.mjs scripts/stage-static-showcase.mjs tests/build-bond-market-snapshot.test.mjs tests/refresh-static-showcase-data.test.mjs tests/stage-static-showcase.test.mjs tests/formal-market-data-contract.test.mjs
git commit -m "feat: publish CB issuer research data"
```

### Task 4: Live smoke、來源登錄與完整驗證

**Files:**
- Create: `scripts/live-source-smoke/cb-issuer-research.mjs`
- Create: `docs/source-verification/cb-issuer-research-live-smoke.md`
- Modify: `docs/data-source-registry.md`
- Modify: `tests/production-source-approval.test.mjs`

**Interfaces:**
- Consumes: exact source policies, parsers, snapshot builder and generation integration。
- Produces: dated evidence and individual production status only after each source passes all gates。

- [ ] **Step 1: Add a read-only one-shot smoke script**

The script fetches only the two reviewed URLs, prints source ID, requested/final URL, HTTP status, Content-Type, response bytes, SHA-256, row count, newest revenue month/date, exact active-CB issuer match count and conflict counts. It writes no live response to committed directories and redacts no failure as success.

- [ ] **Step 2: Run under the required Windows limits**

```powershell
$p = Start-Process -FilePath node -ArgumentList @('scripts/live-source-smoke/cb-issuer-research.mjs') -WindowStyle Hidden -PassThru
$p.PriorityClass = 'BelowNormal'
$p | Wait-Process
$p.Refresh()
if ($p.ExitCode -ne 0) { exit $p.ExitCode }
```

Expected: both exact resources return 200 without redirect, valid CSV Content-Type and schema, nonempty rows, plausible latest revenue month not later than retrieval month, and no duplicate month-company identities. A source failing these conditions remains unapproved.

- [ ] **Step 3: Record evidence without copying full datasets**

Write retrieval date, metadata pages (data.gov dataset 18420 and 56510), OGL 1.0 status, exact URLs, response hashes/sizes, newest months, parser counts, issuer match rates, rejected conflicts and warnings. Note that the site uses source-published monthly figures and that absence from either source is not inferred as a market-status event.

- [ ] **Step 4: Run all project gates**

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm test`

Expected: all commands exit 0 and no live CSV remains in the worktree.

- [ ] **Step 5: Promote each resource independently and commit**

Only a source whose fixture integrity, schema, attribution, live evidence, failure behavior and projection scope all pass becomes `APPROVED_FOR_PRODUCTION`. A failed listed source does not block approval of OTC, but its records remain stale／unavailable and never borrow from OTC.

```bash
git add scripts/live-source-smoke/cb-issuer-research.mjs docs/source-verification/cb-issuer-research-live-smoke.md docs/data-source-registry.md tests/production-source-approval.test.mjs
git commit -m "docs: approve verified CB issuer research sources"
```
