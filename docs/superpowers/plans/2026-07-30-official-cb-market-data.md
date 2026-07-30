# Official Convertible Bond Market Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder convertible-bond market fields with verified official daily-close data, current conversion prices, correctly dated derived metrics, and a scheduled static public site that does not depend on Cloudflare.

**Architecture:** Keep issue terms, CB quotes, listed/OTC stock closes, and current conversion prices as separate verified datasets. Normalize them into a `BondMarketView` only after exact bond-code and issuer-code joins, publish generated JSON to the static site only after all integrity gates pass, and retain the previously deployed GitHub Pages artifact when a refresh fails.

**Tech Stack:** Node.js >=22.13.0, TypeScript 5.9.3, Node test runner, existing CSV/fixture verification utilities, static HTML/CSS/JavaScript, GitHub Actions and GitHub Pages.

## Global Constraints

- Time zone is exactly `Asia/Taipei`.
- Market data is end-of-day only; no intraday quotes, WebSocket, or real-time claims.
- Run the main refresh at 20:30 and retries at 21:30 and 23:00 Taiwan time.
- Use only verified official TWSE, TPEx, and MOPS resources.
- Do not ingest The Few, Yahoo Finance, CBAS, TCRI, Goodinfo, or StatementDog data.
- The TPEx OpenAPI operation `bond_cb_daily` is a dealer buy/sell report, not a per-bond close-price feed; it must remain excluded.
- Collection concurrency is at most `2`; local CPU-intensive commands run with at most two threads and below-normal Windows priority.
- Do not use Cloudflare Worker, D1, Wrangler, or the existing relay workflow for this feature.
- A failed or partial refresh must not overwrite the last verified public artifact.
- Different price dates must never be presented as an ordinary same-date premium calculation.
- The main visual accents are clay orange and muted violet; green is not a primary background or text color.

---

## File Structure

### New source and domain units

- `lib/source-verification/source-cb-market.ts`: strict parsing and normalization for official CB quotes, TWSE/TPEX stock closes, and MOPS current conversion-price pages.
- `lib/market-data/types.ts`: normalized market records and public `BondMarketView` contracts.
- `lib/market-data/decimal.ts`: decimal-safe division, multiplication, subtraction, and percentage formatting.
- `lib/market-data/bond-market-view.ts`: exact joins, common-date selection, derived metrics, event countdowns, and missing-data reasons.
- `scripts/lib/map-limit.mjs`: deterministic concurrency limit of two.
- `scripts/lib/official-market-fetch.mjs`: official GET/POST collectors and request metadata.
- `scripts/build-bond-market-snapshot.mjs`: stages, validates, and publishes static JSON atomically.

### New evidence and fixtures

- `docs/source-verification/cb-market-evidence.md`
- `docs/source-verification/cb-market-resource-decision.md`
- `tests/fixtures/source-verification/cb-market/tpex-cb-quote.json`
- `tests/fixtures/source-verification/cb-market/twse-stock-close.json`
- `tests/fixtures/source-verification/cb-market/tpex-stock-close.json`
- `tests/fixtures/source-verification/cb-market/tpex-conversion-index.json`
- `tests/fixtures/source-verification/cb-market/mops-bond-detail.html`
- `tests/fixtures/source-verification/cb-market/metadata.json`

### Static public output

- `static-showcase/data/cb-quotes.json`
- `static-showcase/data/stock-closes.json`
- `static-showcase/data/conversion-prices.json`
- `static-showcase/data/bond-market-view.json`
- `static-showcase/data/manifest.json`
- `static-showcase/assets/app.js`
- `static-showcase/assets/app.css`

### Existing files modified

- `scripts/refresh-static-showcase-data.mjs`
- `static-showcase/index.html`
- `.github/workflows/deploy-github-pages.yml`
- `package.json`

### Existing Cloudflare relay removed

- `.github/workflows/relay-public-snapshot.yml`
- `scripts/relay-approved-sources.mjs`

---

### Task 1: Verify and quarantine the exact official resources

**Files:**
- Create: `docs/source-verification/cb-market-evidence.md`
- Create: `docs/source-verification/cb-market-resource-decision.md`
- Create: `tests/fixtures/source-verification/cb-market/metadata.json`
- Create: `tests/source-verification/source-cb-market-resources.test.mjs`
- Modify: `docs/data-source-registry.md`

**Interfaces:**
- Consumes: existing resource-status vocabulary in `docs/data-source-registry.md`.
- Produces: explicit resource decisions consumed by all later tasks; no adapter may be written for a rejected resource.

- [ ] **Step 1: Write the failing resource-decision test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CB market decisions approve only the verified price resources", async () => {
  const text = await readFile(
    new URL("../../docs/source-verification/cb-market-resource-decision.md", import.meta.url),
    "utf8",
  );
  assert.match(text, /bond\/cbDayQry[\s\S]+VERIFIED_FOR_IMPLEMENTATION/);
  assert.match(text, /STOCK_DAY_ALL[\s\S]+VERIFIED_FOR_IMPLEMENTATION/);
  assert.match(text, /tpex_mainboard_daily_close_quotes[\s\S]+VERIFIED_FOR_IMPLEMENTATION/);
  assert.match(text, /bond\/convSearch[\s\S]+VERIFIED_FOR_IMPLEMENTATION/);
  assert.match(text, /t120sg01[\s\S]+VERIFIED_FOR_IMPLEMENTATION/);
  assert.match(text, /bond_cb_daily[\s\S]+SUSPENDED/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/source-verification/source-cb-market-resources.test.mjs
```

Expected: FAIL because the decision document does not exist.

- [ ] **Step 3: Capture and document the official contracts**

Record these exact candidates and observed semantics:

```text
POST https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry
body template: new URLSearchParams({ date, code: bondCode, response: "json" })
fields: 日期,交易模式,收市價,漲跌,開市價,最高價,最低價,成交筆數,單位,成交金額(元),平均價

GET https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL
fields: Date,Code,Name,TradeVolume,TradeValue,OpeningPrice,HighestPrice,LowestPrice,ClosingPrice,Change,Transaction

GET https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes
fields: Date,SecuritiesCompanyCode,CompanyName,Close,Change,Open,High,Low,Average,TradingShares,TransactionAmount,TransactionNumber

POST https://www.tpex.org.tw/www/zh-tw/bond/convSearch
body: name=bondIssuer&searchNo=&response=json
fields: 發行機構代碼,發行機構名稱,債券名稱,掛牌日期,發行資料

GET the `officialDetailUrl` returned by `convSearch`; allow only protocol `https:`, host `mopsov.twse.com.tw`, and path `/mops/web/t120sg01`
fields used: 發行時轉(交)換價格,最新轉(交)換價格,最近轉(交)換價格生效日期
```

The decision must explicitly retain this quarantine:

```text
GET https://www.tpex.org.tw/openapi/v1/bond_cb_daily
status: SUSPENDED
reason: response is grouped by FinancialInstitutionsCode and contains dealer purchase/sell amounts, not bond code, close price, or per-bond volume.
```

- [ ] **Step 4: Create metadata evidence**

`metadata.json` must satisfy this TypeScript shape:

```ts
type CapturedMetadata = {
  capturedAt: string;
  resources: Array<{
    resourceId: string;
    method: "GET" | "POST";
    url: string;
    status: 200;
    contentType: string;
    responseHash: `sha256:${string}`;
    recordCount: number;
  }>;
};
```

Add one entry for each approved candidate and one suspended `bond_cb_daily` entry. Hashes and counts must be generated from the captured fixture bytes, not typed from memory.

- [ ] **Step 5: Run the resource-decision test**

Run:

```powershell
node --test tests/source-verification/source-cb-market-resources.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add docs/source-verification/cb-market-evidence.md docs/source-verification/cb-market-resource-decision.md docs/data-source-registry.md tests/fixtures/source-verification/cb-market/metadata.json tests/source-verification/source-cb-market-resources.test.mjs
git commit -m "docs: verify official convertible bond market sources"
```

---

### Task 2: Normalize official quote and conversion-price payloads

**Files:**
- Create: `lib/source-verification/source-cb-market.ts`
- Create: `lib/market-data/types.ts`
- Create: `tests/source-verification/source-cb-market.test.mjs`
- Create: the five fixture files listed in File Structure

**Interfaces:**
- Produces:

```ts
export type CbQuote = {
  bondCode: string;
  tradingDate: string;
  tradingMode: "equivalent" | "negotiated";
  close: string | null;
  change: string | null;
  open: string | null;
  high: string | null;
  low: string | null;
  tradeCount: string;
  tradingUnits: string;
  turnover: string;
  average: string | null;
};

export type StockClose = {
  companyCode: string;
  market: "listed" | "otc";
  tradingDate: string;
  close: string;
  change: string;
  volume: string;
  turnover: string;
};

export type ConversionPriceVersion = {
  bondCode: string;
  issuerCode: string;
  initialConversionPrice: string;
  currentConversionPrice: string;
  effectiveDate: string;
  officialDetailUrl: string;
};
```

- [ ] **Step 1: Write failing parser tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeCbQuoteRow,
  parseMopsConversionPrice,
} from "../../lib/source-verification/source-cb-market.ts";

const officialDetailUrl =
  "https://mopsov.twse.com.tw/mops/web/t120sg01?encodeURIComponent=1&step=1&firstin=1&bond_id=35221";
const detailHtml = await readFile(
  new URL("../fixtures/source-verification/cb-market/mops-bond-detail.html", import.meta.url),
  "utf8",
);

test("normalizes an equivalent-trading CB quote", () => {
  const quote = normalizeCbQuoteRow("35221", [
    "1150729", "等價", "103.5000", "1.5000", "103.5000",
    "103.5000", "103.5000", "2", "10", "1,035,000", "103.50",
  ]);
  assert.deepEqual(quote, {
    bondCode: "35221",
    tradingDate: "2026-07-29",
    tradingMode: "equivalent",
    close: "103.5",
    change: "1.5",
    open: "103.5",
    high: "103.5",
    low: "103.5",
    tradeCount: "2",
    tradingUnits: "10",
    turnover: "1035000",
    average: "103.5",
  });
});

test("normalizes MOPS latest conversion price and effective date", () => {
  const value = parseMopsConversionPrice(detailHtml, officialDetailUrl);
  assert.equal(value.currentConversionPrice, "88.1");
  assert.equal(value.effectiveDate, "2025-11-09");
});
```

- [ ] **Step 2: Run the parser test to verify it fails**

Run:

```powershell
node --test tests/source-verification/source-cb-market.test.mjs
```

Expected: FAIL with missing module or missing exported parser.

- [ ] **Step 3: Implement strict normalization**

Use exact exports:

```ts
export function normalizeCbQuoteRow(bondCode: string, row: readonly string[]): CbQuote;
export function normalizeTwseStockClose(row: Record<string, string>): StockClose;
export function normalizeTpexStockClose(row: Record<string, string>): StockClose;
export function parseConversionIndex(payload: unknown): readonly {
  bondCode: string;
  issuerCode: string;
  officialDetailUrl: string;
}[];
export function parseMopsConversionPrice(
  html: string,
  officialDetailUrl: string,
): ConversionPriceVersion;
```

Validation rules:

```ts
if (!/^\d{5,6}$/.test(bondCode)) throw new TypeError("invalid bond code");
if (!/^https:\/\/mopsov\.twse\.com\.tw\/mops\/web\/t120sg01\?/.test(officialDetailUrl)) {
  throw new TypeError("unapproved MOPS detail URL");
}
if (currentConversionPrice === "0") throw new TypeError("invalid current conversion price");
```

Blank CB quote cells normalize to `null`; blank volume/count fields normalize to `"0"`. Reject unknown row lengths, malformed ROC dates, HTML without both latest-price labels, duplicate bond codes, and URLs outside the exact MOPS host/path.

- [ ] **Step 4: Run parser and existing guardrail tests**

Run:

```powershell
node --test tests/source-verification/source-cb-market.test.mjs tests/phase1-1-source-quarantine.test.mjs
```

Expected: PASS; existing prohibition against unverified providers remains intact.

- [ ] **Step 5: Commit**

```powershell
git add lib/source-verification/source-cb-market.ts lib/market-data/types.ts tests/source-verification/source-cb-market.test.mjs tests/fixtures/source-verification/cb-market
git commit -m "feat: normalize official convertible bond market data"
```

---

### Task 3: Implement decimal-safe derived metrics and common-date joins

**Files:**
- Create: `lib/market-data/decimal.ts`
- Create: `lib/market-data/bond-market-view.ts`
- Create: `tests/bond-market-view.test.mjs`

**Interfaces:**
- Consumes: `CbQuote`, `StockClose`, `ConversionPriceVersion` from Task 2 and normalized 11406 records.
- Produces:

```ts
export type BondMarketView = {
  bondCode: string;
  issuerCode: string;
  bondName: string;
  cbClose: string | null;
  cbPriceDate: string | null;
  cbTradeUnits: string;
  stockClose: string | null;
  stockPriceDate: string | null;
  currentConversionPrice: string | null;
  conversionPriceEffectiveDate: string | null;
  valuationDate: string | null;
  valuationCbClose: string | null;
  valuationStockClose: string | null;
  conversionValue: string | null;
  premiumRate: string | null;
  outstandingAmount: string | null;
  outstandingReductionRate: string | null;
  maturityDate: string;
  daysToMaturity: number;
  nextPutDate: string | null;
  daysToNextPut: number | null;
  staleCbPrice: boolean;
  missingReasons: readonly string[];
};

export function buildBondMarketViews(input: {
  asOfDate: string;
  bonds: readonly Record<string, unknown>[];
  cbQuotes: readonly CbQuote[];
  stockCloses: readonly StockClose[];
  conversionPrices: readonly ConversionPriceVersion[];
}): readonly BondMarketView[];
```

- [ ] **Step 1: Write failing calculation tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildBondMarketViews } from "../lib/market-data/bond-market-view.ts";

const bond = {
  bondCode: "35221",
  issuerCode: "3522",
  bondName: "御嵿一",
  maturityDate: "2028-07-29",
  issueAmount: "500000000",
  outstandingAmount: "400000000",
};

function quote(tradingDate, close) {
  return {
    bondCode: "35221",
    tradingDate,
    tradingMode: "equivalent",
    close,
    change: "0",
    open: close,
    high: close,
    low: close,
    tradeCount: "1",
    tradingUnits: "1",
    turnover: "103500",
    average: close,
  };
}

function stock(tradingDate, close) {
  return {
    companyCode: "3522",
    market: "otc",
    tradingDate,
    close,
    change: "0",
    volume: "1000",
    turnover: "39000",
  };
}

function conversion(effectiveDate, currentConversionPrice) {
  return {
    bondCode: "35221",
    issuerCode: "3522",
    initialConversionPrice: "40",
    currentConversionPrice,
    effectiveDate,
    officialDetailUrl:
      "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=35221",
  };
}

function fixture(overrides = {}) {
  return {
    asOfDate: "2026-07-30",
    bonds: [bond],
    cbQuotes: [],
    stockCloses: [],
    conversionPrices: [],
    ...overrides,
  };
}

test("uses a common valuation date", () => {
  const [view] = buildBondMarketViews(fixture({
    cbQuotes: [quote("2026-07-29", "103.5")],
    stockCloses: [stock("2026-07-29", "38.25"), stock("2026-07-30", "39")],
    conversionPrices: [conversion("2025-11-09", "35.1")],
  }));
  assert.equal(view.stockClose, "39");
  assert.equal(view.stockPriceDate, "2026-07-30");
  assert.equal(view.valuationDate, "2026-07-29");
  assert.equal(view.valuationCbClose, "103.5");
  assert.equal(view.valuationStockClose, "38.25");
  assert.equal(view.staleCbPrice, true);
});

test("does not compute when no common date exists", () => {
  const [view] = buildBondMarketViews(fixture({
    cbQuotes: [quote("2026-07-29", "103.5")],
    stockCloses: [stock("2026-07-30", "39")],
    conversionPrices: [conversion("2025-11-09", "35.1")],
  }));
  assert.equal(view.conversionValue, null);
  assert.equal(view.premiumRate, null);
  assert.equal(view.valuationCbClose, null);
  assert.equal(view.valuationStockClose, null);
  assert.ok(view.missingReasons.includes("NO_COMMON_VALUATION_DATE"));
});
```

- [ ] **Step 2: Run the calculation tests to verify they fail**

Run:

```powershell
node --test tests/bond-market-view.test.mjs
```

Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement decimal operations and formulas**

Implement decimal arithmetic using scaled integers:

```ts
export function divideDecimal(left: string, right: string, scale: number): string;
export function multiplyDecimal(left: string, right: string, scale: number): string;
export function subtractDecimal(left: string, right: string, scale: number): string;
```

Apply:

```ts
conversionValue = multiplyDecimal(
  divideDecimal(stockCloseOnValuationDate, currentConversionPrice, 8),
  "100",
  2,
);
premiumRate = multiplyDecimal(
  subtractDecimal(divideDecimal(cbCloseOnValuationDate, conversionValue, 8), "1", 8),
  "100",
  2,
);
outstandingReductionRate = multiplyDecimal(
  subtractDecimal("1", divideDecimal(outstandingAmount, issueAmount, 8), 8),
  "100",
  2,
);
```

Never call the last value `convertedRate`.

- [ ] **Step 4: Run calculation tests**

Run:

```powershell
node --test tests/bond-market-view.test.mjs
```

Expected: PASS for same-date, mixed-date, no-common-date, zero-input, effective-date, maturity, and put-date cases.

- [ ] **Step 5: Commit**

```powershell
git add lib/market-data/decimal.ts lib/market-data/bond-market-view.ts tests/bond-market-view.test.mjs
git commit -m "feat: derive dated convertible bond market metrics"
```

---

### Task 4: Build the bounded official collector

**Files:**
- Create: `scripts/lib/map-limit.mjs`
- Create: `scripts/lib/official-market-fetch.mjs`
- Create: `tests/official-market-fetch.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces:

```js
export async function mapLimit(values, limit, worker);
export async function fetchMopsDetail(officialDetailUrl, fetchImpl = fetch);
export async function fetchCurrentOfficialMarketData({
  bondCodes,
  issuerCodes,
  date,
  fetchImpl = fetch,
});
```

- [ ] **Step 1: Write failing concurrency and allowlist tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { mapLimit } from "../scripts/lib/map-limit.mjs";
import { fetchMopsDetail } from "../scripts/lib/official-market-fetch.mjs";

test("never exceeds two concurrent detail requests", async () => {
  let active = 0;
  let peak = 0;
  await mapLimit(["1", "2", "3", "4"], 2, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active -= 1;
  });
  assert.equal(peak, 2);
});

test("rejects a conversion detail URL outside MOPS", async () => {
  const fakeFetch = async () => {
    throw new Error("fetch must not run before URL validation");
  };
  await assert.rejects(
    () => fetchMopsDetail("https://example.com/detail", fakeFetch),
    /URL_NOT_ALLOWED/,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test tests/official-market-fetch.test.mjs
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement exact HTTP methods and bounded retries**

Use:

```js
const TPEX_CB_QUOTE = "https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry";
const TWSE_CLOSE = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
const TPEX_CLOSE = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes";
const TPEX_CONVERSION_INDEX = "https://www.tpex.org.tw/www/zh-tw/bond/convSearch";
```

POST bodies:

```js
new URLSearchParams({ date: "2026/07/30", code: bondCode, response: "json" });
new URLSearchParams({ name: "bondIssuer", searchNo: "", response: "json" });
```

`cbDayQry` returns a monthly table. Select the newest normalized row whose date is not later than the requested date, retain its actual trade date, and mark a bond as no-trade/missing when that month contains no eligible row.

Retry only the same exact URL and body for network errors, HTTP 429, and 5xx. Use at most three attempts and never switch to a third-party fallback. `mapLimit` must be called with `2`.

- [ ] **Step 4: Add the low-load script**

Add:

```json
{
  "scripts": {
    "snapshot:cb-market": "node scripts/build-bond-market-snapshot.mjs"
  }
}
```

The script itself performs no CPU-parallel work and limits network detail requests to two.

- [ ] **Step 5: Run tests**

Run:

```powershell
node --test tests/official-market-fetch.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add scripts/lib/map-limit.mjs scripts/lib/official-market-fetch.mjs tests/official-market-fetch.test.mjs package.json
git commit -m "feat: collect official market data with bounded concurrency"
```

---

### Task 5: Stage and atomically publish the static market snapshot

**Files:**
- Create: `scripts/build-bond-market-snapshot.mjs`
- Create: `tests/build-bond-market-snapshot.test.mjs`
- Modify: `scripts/refresh-static-showcase-data.mjs`
- Modify: `static-showcase/data/manifest.json` through the generator only

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: four JSON files and a manifest in `static-showcase/data`.

```js
export async function buildBondMarketSnapshot({
  outputDir,
  collectImpl = fetchCurrentOfficialMarketData,
  now = () => new Date(),
});
```

- [ ] **Step 1: Write failing atomic-publication tests**

```js
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildBondMarketSnapshot } from "../scripts/build-bond-market-snapshot.mjs";

async function makePublishedDirectory() {
  const root = await mkdtemp(join(tmpdir(), "cb-market-test-"));
  const outputDir = join(root, "data");
  await mkdir(outputDir);
  await writeFile(
    join(outputDir, "manifest.json"),
    JSON.stringify({ generatedAt: "2026-07-29T12:30:00.000Z" }),
  );
  return outputDir;
}

const validCollectedMarketData = {
  cbQuotes: [],
  stockCloses: [],
  conversionPrices: [],
  views: [{
    bondCode: "35221",
    valuationDate: null,
    premiumRate: null,
  }],
};

test("a failed candidate leaves the published directory unchanged", async () => {
  const publicDir = await makePublishedDirectory();
  const brokenCollect = async () => ({ ...validCollectedMarketData, views: [] });
  const before = await readFile(join(publicDir, "manifest.json"), "utf8");
  await assert.rejects(
    () => buildBondMarketSnapshot({
      outputDir: publicDir,
      collectImpl: brokenCollect,
      now: () => new Date("2026-07-30T12:30:00.000Z"),
    }),
    /VALIDATION_FAILED/,
  );
  assert.equal(await readFile(join(publicDir, "manifest.json"), "utf8"), before);
});

test("a valid candidate publishes all files with one generatedAt", async () => {
  const publicDir = await makePublishedDirectory();
  const result = await buildBondMarketSnapshot({
    outputDir: publicDir,
    collectImpl: async () => validCollectedMarketData,
    now: () => new Date("2026-07-30T12:30:00.000Z"),
  });
  assert.equal(result.status, "published");
  assert.equal(result.files.length, 4);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test tests/build-bond-market-snapshot.test.mjs
```

Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement staging and validation**

Use a sibling staging directory:

```js
const stagingDir = await mkdtemp(join(dirname(outputDir), ".cb-market-"));
```

Write these candidate files:

```text
cb-quotes.json
stock-closes.json
conversion-prices.json
bond-market-view.json
```

Validate before rename:

```js
if (views.length === 0) errors.push("EMPTY_BOND_MARKET_VIEW");
if (new Set(views.map((v) => v.bondCode)).size !== views.length) {
  errors.push("DUPLICATE_BOND_CODE");
}
if (views.some((v) => v.premiumRate !== null && v.valuationDate === null)) {
  errors.push("DERIVED_VALUE_WITHOUT_VALUATION_DATE");
}
if (errors.length) throw new Error(`VALIDATION_FAILED:${errors.join(",")}`);
```

Only after all JSON files can be parsed back and the manifest hashes match may the builder replace the published files. Restore the prior files if any rename fails.

Return a structured update report containing source IDs, response hashes, row counts, missing counts, duplicate counts, and validation errors. Print that report to the local console or GitHub Actions job summary; do not render raw technical errors in the public page.

- [ ] **Step 4: Update the existing showcase refresh**

`refreshStaticShowcase()` must run the existing 94025/11406/11586 refresh first, pass normalized 11406 bond/issuer codes to `buildBondMarketSnapshot`, and update the manifest only when both phases succeed.

- [ ] **Step 5: Run publication and existing static tests**

Run:

```powershell
node --test tests/build-bond-market-snapshot.test.mjs tests/refresh-static-showcase-data.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add scripts/build-bond-market-snapshot.mjs scripts/refresh-static-showcase-data.mjs tests/build-bond-market-snapshot.test.mjs
git commit -m "feat: publish verified static bond market snapshots"
```

---

### Task 6: Render the wide CB table and single-bond workbench

**Files:**
- Create: `static-showcase/assets/app.js`
- Create: `static-showcase/assets/app.css`
- Create: `tests/static-showcase-bond-ui.test.mjs`
- Modify: `static-showcase/index.html`
- Modify: `scripts/refresh-static-showcase-data.mjs`

**Interfaces:**
- Consumes: `bond-market-view.json` from Task 5.
- Produces: `renderBondTable(views)` and `renderBondWorkbench(view, history)` in the static browser runtime.

- [ ] **Step 1: Write failing static UI contract tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("static showcase exposes all required CB trading labels", async () => {
  const [html, js] = await Promise.all([
    readFile(new URL("../static-showcase/index.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/app.js", import.meta.url), "utf8"),
  ]);
  for (const label of [
    "CB 收盤", "股票收盤", "目前轉換價", "轉換價值", "溢價率",
    "成交量", "流通餘額", "到期／賣回", "資料日期",
  ]) assert.match(js, new RegExp(label));
  assert.match(html, /assets\/app\.css/);
  assert.match(html, /assets\/app\.js/);
});
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run:

```powershell
node --test tests/static-showcase-bond-ui.test.mjs
```

Expected: FAIL because the modular static assets do not exist.

- [ ] **Step 3: Extract presentation from generated data**

Change `runtime.js` to a small generated bootstrap that assigns only the manifest and dataset URLs. Move reusable UI behavior to `assets/app.js`. `index.html` must load:

```html
<link rel="stylesheet" href="./assets/app.css">
<script type="module" src="./assets/app.js"></script>
```

The app loads:

```js
async function expectJson(response) {
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}:${response.url}`);
  }
  return response.json();
}

const [manifest, marketViews] = await Promise.all([
  fetch("./data/manifest.json", { cache: "no-store" }).then(expectJson),
  fetch("./data/bond-market-view.json", { cache: "no-store" }).then(expectJson),
]);
```

- [ ] **Step 4: Implement the desktop table and mobile cards**

Desktop core columns:

```js
const columns = [
  "CB／標的", "CB 收盤", "股票收盤", "目前轉換價", "轉換價值",
  "溢價率", "成交量", "流通餘額", "到期／賣回",
];
```

Rules:

- At widths >=1180px, all nine groups fit without horizontal page scrolling.
- At widths <820px, render cards instead of the desktop table.
- Every price displays its own date.
- `staleCbPrice` renders the visible label `非當日成交`.
- `null` renders `—` plus the first `missingReasons` explanation.
- Filters include search, low price, low premium, near-100 conversion value, one-year maturity, next put, no trade, and missing data.

- [ ] **Step 5: Implement the hash-routed workbench**

Use:

```js
location.hash = `bond=${encodeURIComponent(bondCode)}`;
```

The workbench sections are:

```text
交易摘要
價格日期與估值日
價格走勢
轉換與餘額
契約生命週期
發行條款
公告與文件
資料來源
```

The standard premium card must be absent when `valuationDate` is null. Original MOPS and TPEx document links open in a new tab with `rel="noopener noreferrer"`.

- [ ] **Step 6: Implement the approved visual system**

CSS tokens:

```css
:root {
  --paper: #f5f1e8;
  --ink: #241f22;
  --clay: #b96849;
  --violet: #7a638f;
}
[data-theme="dark"] {
  --paper: #171619;
  --ink: #f7f1e9;
  --clay: #db8967;
  --violet: #b69acb;
}
```

No green token may be used for primary backgrounds, headings, links, or buttons. Positive/negative financial values must use icons or explicit signs in addition to color.

- [ ] **Step 7: Run UI, accessibility, and build tests**

Run:

```powershell
node --test tests/static-showcase-bond-ui.test.mjs tests/formal-bond-pages.test.mjs
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```powershell
git add static-showcase/index.html static-showcase/assets/app.js static-showcase/assets/app.css scripts/refresh-static-showcase-data.mjs tests/static-showcase-bond-ui.test.mjs
git commit -m "feat: add official convertible bond trading workspace"
```

---

### Task 7: Add official historical series without mixing dates

**Files:**
- Create: `lib/market-data/bond-market-history.ts`
- Create: `scripts/backfill-bond-market-history.mjs`
- Create: `static-showcase/data/bond-market-history.json`
- Create: `tests/bond-market-history.test.mjs`
- Modify: `scripts/lib/official-market-fetch.mjs`
- Modify: `static-showcase/assets/app.js`

**Interfaces:**
- Produces:

```ts
export type BondMarketHistoryPoint = {
  bondCode: string;
  date: string;
  cbClose: string | null;
  stockClose: string | null;
  effectiveConversionPrice: string | null;
  conversionValue: string | null;
  premiumRate: string | null;
};

export function buildHistoryPoints(input: {
  cbQuotes: readonly CbQuote[];
  stockCloses: readonly StockClose[];
  conversionPrices: readonly ConversionPriceVersion[];
}): readonly BondMarketHistoryPoint[];
```

- [ ] **Step 1: Write failing history tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildHistoryPoints } from "../lib/market-data/bond-market-history.ts";

const cbQuotes = [
  {
    bondCode: "35221",
    tradingDate: "2026-07-29",
    tradingMode: "equivalent",
    close: "103.5",
    change: "0",
    open: "103.5",
    high: "103.5",
    low: "103.5",
    tradeCount: "1",
    tradingUnits: "1",
    turnover: "103500",
    average: "103.5",
  },
];
const stockCloses = [
  {
    companyCode: "3522",
    market: "otc",
    tradingDate: "2026-07-29",
    close: "36.21",
    change: "0",
    volume: "1000",
    turnover: "36210",
  },
  {
    companyCode: "3522",
    market: "otc",
    tradingDate: "2026-07-30",
    close: "39",
    change: "0",
    volume: "1000",
    turnover: "39000",
  },
];
const conversionPrices = [{
  bondCode: "35221",
  issuerCode: "3522",
  initialConversionPrice: "40",
  currentConversionPrice: "35",
  effectiveDate: "2025-11-09",
  officialDetailUrl:
    "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=35221",
}];

test("history never computes premium from different dates", () => {
  const points = buildHistoryPoints({ cbQuotes, stockCloses, conversionPrices });
  assert.equal(points.find((p) => p.date === "2026-07-29").premiumRate, "0.04");
  assert.equal(points.find((p) => p.date === "2026-07-30").premiumRate, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/bond-market-history.test.mjs
```

Expected: FAIL with missing history builder.

- [ ] **Step 3: Implement official monthly history requests**

Use the existing TPEx CB quote POST once per bond/month:

```js
new URLSearchParams({
  date: `${year}/${String(month).padStart(2, "0")}/01`,
  code: bondCode,
  response: "json",
});
```

Use TWSE listed-stock monthly history:

```text
GET new URL("https://www.twse.com.tw/exchangeReport/STOCK_DAY") with query `{ response: "json", date: yearMonth + "01", stockNo: issuerCode }`
```

Use TPEx OTC monthly history:

```text
POST https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock
body template: new URLSearchParams({ code: issuerCode, date: `${year}/${month}/01`, response: "json" })
```

The one-time backfill covers the latest 12 completed/current months, uses concurrency `2`, deduplicates by `bondCode + date`, and writes no point whose official date cannot be normalized.

Apply a conversion-price version only when `effectiveDate <= point.date`. Because the verified MOPS detail contract exposes the initial and latest versions but not a complete adjustment history, points before the latest effective date must keep `effectiveConversionPrice`, `conversionValue`, and `premiumRate` as `null` unless a separately verified official adjustment version exists. Never apply today's conversion price retrospectively.

- [ ] **Step 4: Add 1M/3M/6M/1Y chart ranges**

Range selection filters by exact calendar cutoff. If a requested range has no verified points, render `此期間尚無可驗證資料`; do not interpolate prices.

- [ ] **Step 5: Run history and UI tests**

Run:

```powershell
node --test tests/bond-market-history.test.mjs tests/static-showcase-bond-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add lib/market-data/bond-market-history.ts scripts/backfill-bond-market-history.mjs scripts/lib/official-market-fetch.mjs static-showcase/data/bond-market-history.json static-showcase/assets/app.js tests/bond-market-history.test.mjs
git commit -m "feat: add official convertible bond price history"
```

---

### Task 8: Replace the Cloudflare relay with scheduled GitHub Pages deployment

**Files:**
- Modify: `.github/workflows/deploy-github-pages.yml`
- Delete: `.github/workflows/relay-public-snapshot.yml`
- Delete: `scripts/relay-approved-sources.mjs`
- Create: `tests/github-pages-schedule.test.mjs`

**Interfaces:**
- Consumes: static generator and tests from Tasks 5–7.
- Produces: three daily attempts with no Cloudflare dependency.

- [ ] **Step 1: Write the failing workflow test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Pages refresh runs at the three Taiwan evening times", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-github-pages.yml", import.meta.url),
    "utf8",
  );
  for (const cron of ["30 12 * * 1-5", "30 13 * * 1-5", "0 15 * * 1-5"]) {
    assert.match(workflow, new RegExp(cron.replaceAll("*", "\\*")));
  }
  assert.doesNotMatch(workflow, /workers\.dev|wrangler|PIPELINE_DB/);
});
```

- [ ] **Step 2: Run the workflow test to verify it fails**

Run:

```powershell
node --test tests/github-pages-schedule.test.mjs
```

Expected: FAIL because the schedule is absent.

- [ ] **Step 3: Update the Pages workflow**

Use:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
  schedule:
    - cron: "30 12 * * 1-5"
    - cron: "30 13 * * 1-5"
    - cron: "0 15 * * 1-5"
```

The job steps must be:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: npm
- run: npm ci
- run: npm run snapshot:cb-market
  env:
    TZ: Asia/Taipei
    UV_THREADPOOL_SIZE: "2"
- run: npm test
- uses: actions/configure-pages@v5
- uses: actions/upload-pages-artifact@v3
  with:
    path: static-showcase
- uses: actions/deploy-pages@v4
```

Set `timeout-minutes: 45`. A generator or test failure must stop before artifact upload, leaving the previously deployed Pages version intact.

Before a retry run performs collection, compare the public manifest's trading date and completeness status with the requested market date. If the same date is already published with all mandatory sources complete, exit successfully with `refresh=skipped`; otherwise continue the exact same official-source refresh. This prevents the 21:30 and 23:00 retries from consuming work after a successful 20:30 publication.

- [ ] **Step 4: Remove the Cloudflare relay**

Delete only the two files listed for deletion. Verify no scheduled workflow contains `workers.dev`, `wrangler`, or `PIPELINE_DB`.

- [ ] **Step 5: Run workflow and full tests**

Run:

```powershell
node --test tests/github-pages-schedule.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add .github/workflows/deploy-github-pages.yml tests/github-pages-schedule.test.mjs
git rm .github/workflows/relay-public-snapshot.yml scripts/relay-approved-sources.mjs
git commit -m "ci: schedule verified GitHub Pages market refresh"
```

---

### Task 9: Final verification and public deployment

**Files:**
- Modify only if verification exposes a defect in a file owned by Tasks 1–8.

**Interfaces:**
- Produces: a verified static artifact and public deployment with rollback safety.

- [ ] **Step 1: Run source-specific tests**

```powershell
node --test tests/source-verification/source-cb-market-resources.test.mjs tests/source-verification/source-cb-market.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run calculations, collector, snapshot, history, and workflow tests**

```powershell
node --test tests/bond-market-view.test.mjs tests/official-market-fetch.test.mjs tests/build-bond-market-snapshot.test.mjs tests/bond-market-history.test.mjs tests/static-showcase-bond-ui.test.mjs tests/github-pages-schedule.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run full project verification with two-thread limits**

```powershell
$env:UV_THREADPOOL_SIZE="2"
npm run typecheck
npm run lint
npm test
```

Expected: all commands exit `0`.

- [ ] **Step 4: Perform a live read-only smoke collection**

Run the collector without publishing:

```powershell
$env:CB_MARKET_DRY_RUN="1"
$env:UV_THREADPOOL_SIZE="2"
npm run snapshot:cb-market
```

Expected output includes:

```text
mode=dry-run
concurrency=2
validation=passed
published=false
```

The dry run must report source URLs, response hashes, row counts, price dates, missing counts, and duplicate counts without exposing credentials.

- [ ] **Step 5: Build and inspect the public artifact**

```powershell
npm run build
```

Open the generated static showcase locally and verify:

```text
desktop: 1440 × 900
mobile: 390 × 844
themes: light and dark
states: current, non-trading, delayed, missing field, rejected candidate
```

- [ ] **Step 6: Push and run the manual Pages workflow**

```powershell
git push origin main
gh workflow run deploy-github-pages.yml
$runId = gh run list --workflow deploy-github-pages.yml --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $runId --exit-status
```

Expected: source collection, validation, test, artifact upload, and Pages deploy all succeed.

- [ ] **Step 7: Verify the public site**

Confirm on the public URL:

- no fixture/test banners;
- CB values have official dates;
- current conversion price has its effective date;
- different-date prices do not show an ordinary premium;
- official document links work;
- no request is made to `workers.dev`;
- previous deployment remains reachable if a deliberate dry-run failure is injected locally.

- [ ] **Step 8: Handle verification corrections**

If Step 1–7 exposes a defect, return to the task that owns that file, repeat that task's failing-test → implementation → passing-test cycle, and use that task's exact `git add` list. If no defect is found, do not create an empty commit.
