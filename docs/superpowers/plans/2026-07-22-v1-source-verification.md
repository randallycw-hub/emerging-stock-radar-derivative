# V1 資料來源驗證與 Fixture Contract Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 逐一保存四個 V1 候選資料集的可稽核證據、最小合法 Fixture、嚴格 source schema、欄位 mapping 與隔離測試，使通過人工關卡的單一資料集具備升級至 `VERIFIED_FOR_IMPLEMENTATION` 的充分材料，但不建立正式 Adapter 或 production 核准。

**Architecture:** 驗證資產分成三層：`tests/fixtures/source-verification` 保存最小化原始樣本與不可變 metadata；`lib/source-verification` 只放無網路 I/O 的 parser、schema、normalizer 與 join 純函式；`tools/source-verification` 承擔人工證據檢查及獨立 live smoke，且不得被 runtime import。預設測試只讀 Fixture、mock `fetch` 與 in-memory evidence repository；任何狀態升級只產生可供人工簽核的決策結果，不自動改寫 Source Registry。

**Tech Stack:** Node.js 22、TypeScript 5.9、Node `node:test`／`assert`、內建 Web Fetch API、內建 `node:crypto`、現有 vinext／Next.js 建置；不新增 npm dependency。

## Global Constraints

- 本計畫只規劃第一階段；開始執行前須另獲使用者核准。
- 四個循序狀態為 `CANDIDATE` → `APPROVED_FOR_V1_DESIGN` → `VERIFIED_FOR_IMPLEMENTATION` → `APPROVED_FOR_PRODUCTION`；`SUSPENDED` 是獨立暫停狀態。
- 本階段最高只能由人工把個別資料集升級為 `VERIFIED_FOR_IMPLEMENTATION`，不得標成 `APPROVED_FOR_PRODUCTION`。
- 正式來源 Adapter 只能在該資料集已人工升級為 `VERIFIED_FOR_IMPLEMENTATION` 後另案實作；本計畫不建立正式 Adapter。
- 禁止 Yahoo、Yahoo Finance、CBAS、券商接口、未公開 API、未授權第三方金融 API、HTML 大量爬蟲及 `bond_cb_daily`。
- 不取得、保存、映射或顯示股票／可轉債市場價格、買賣價、成交量、成交明細、投資計算或建議；契約欄位 `initialConversionPrice`、`putPrice` 不作行情運算。
- `npm test`、`npm run lint`、`npm run typecheck`、`npm run build` 全程不得連官方網路；只可使用 Fixture、mock HTTP 與 in-memory repository。
- live smoke 使用獨立人工命令，只讀 GET，不寫 published snapshot、D1 或正式資料；失敗只輸出報告，不切換來源。
- Fixture 只保存支援明列測試案例所需的最少列與欄，不保存無關的大量資料；metadata 必須記錄原始 response hash 與裁切後 Fixture hash。
- 官方日期保存為 `YYYY-MM-DD` 的 `Asia/Taipei` 日曆日期；取得時間與檢查時間保存為 UTC ISO datetime。
- 所有 CPU 密集命令使用 Windows `BelowNormal`，設定 `UV_THREADPOOL_SIZE=2`，不得使用全部 CPU 核心。
- 不建立或綁定 D1、Cloudflare 資源，不修改 hosting project，不 Push、不 Merge、不部署。

---

## 基線與目前 Source Registry 狀態

設計基線為 `4734c4b docs: clarify v1 source approval stages`。該 commit 包含九份 V1 設計文件；本計畫執行時不得改寫該 commit。

| 資料集 | 目前狀態 | 已完成查核 | 升級 `VERIFIED_FOR_IMPLEMENTATION` 尚缺證據 |
|---|---|---|---|
| 11406 轉(交)換債發行資料下載 | `APPROVED_FOR_V1_DESIGN` | data.gov.tw 頁、OGL 1.0、免費、官方 CSV、TPEx OAS 與 `/bond_ISSBD5_data` 候選對應已記錄 | 同次取得的最小 CSV/JSON 樣本與 hash、schema 等價證據、正式主 resource 選擇、債券種類代碼、空日期、多重賣回日期、中文數值／單位規則、完整 mapping、錯誤 Fixture、顯名人工覆核 |
| 94025 興櫃公司每月營業收入彙總表 | `APPROVED_FOR_V1_DESIGN` | metadata／授權頁、MOPS CSV 主機、OAS 角色、TPEx `/t187ap05_R` 候選 endpoint 分開記錄 | 三種角色的保存證據、同資料月份 CSV/JSON 欄位比對、正式主 resource 選擇、負值／空值／破折號／百分比／單位規則、同月公司代號唯一性、完整 mapping、顯名人工覆核 |
| 11586 向本公司申請上市之本國公司 | `APPROVED_FOR_V1_DESIGN` | data.gov.tw 頁、OGL 1.0、TWSE CSV、OAS 與 `/company/applylistingLocal` 候選對應已記錄 | 同次 CSV/JSON 最小樣本、JSON 鍵值錯位檢查、日期欄位 schema、白名單 mapping、承銷價排除測試、錯誤 Fixture、正式主 resource 選擇、顯名人工覆核 |
| 28567 公開發行公司基本資料 | `APPROVED_FOR_V1_DESIGN` | data.gov.tw 頁、OGL 1.0、MOPS CSV、TWSE OAS 與 `/opendata/t187ap03_P` 對應已完成到設計核准程度 | 同次 CSV/JSON 最小樣本、欄位 schema、公司代號唯一性、個資／最小化檢查、與 94025 的精確 join／歧義拒絕測試、不得推論興櫃身分測試、正式主 resource 選擇、顯名人工覆核；在這些證據完成前不得作正式實作來源 |

### 仍未核准的候選與暫停來源

| 來源 | 狀態 | 要進入後續設計核准所缺證據／處置 |
|---|---|---|
| 28568 興櫃公司基本資料 | `CANDIDATE` | 重新確認獨立資料集頁、授權、正式 endpoint／resource、OAS 對應、schema 與完整名錄用途；本階段不納入 |
| 11394 申請上櫃公司 | `CANDIDATE` | 確認正式 resource、OAS 對應、授權、schema 與白名單 mapping；本階段不納入 |
| 興櫃新增／終止／重大訊息 | `CANDIDATE` | 找到符合逐一核准標準的確切資料集頁、正式 resource、授權與欄位；不得用一般網頁補足 |
| TDCC 可轉換公司債月分析 11462 | `CANDIDATE` | endpoint、授權、用途邊界、schema 與是否涉及第三方權利尚未核准 |
| 金管會預計生效案件／新聞附件 | `CANDIDATE` | 一般新聞與附件不是正式 API；需獨立資料集與 resource 證據，否則僅能規劃人工建立 |
| 興櫃行情 11747 | `SUSPENDED` | 違反永久價格／成交量禁令，不進升級流程 |
| 可轉債成交行情 `bond_cb_daily` | `SUSPENDED` | 違反永久市場行情禁令，不進升級流程 |
| Yahoo、CBAS、券商、未公開接口、HTML 爬蟲 | `SUSPENDED` | 永久禁止，不得成為主要來源、比較來源或 fallback |

## 預計檔案結構與單一責任

```text
lib/source-verification/
  types.ts                 # Fixture、證據、核准決策與 HTTP 結果型別
  fixture-metadata.ts      # metadata 嚴格驗證、SHA-256 與 row count 驗證
  csv.ts                   # 無網路、RFC 4180 最小 CSV parser
  evidence-repository.ts   # repository contract 與 in-memory 實作
  source-11406.ts          # 11406 source schema、CSV/JSON parse、normalize
  source-94025.ts          # 94025 source schema、CSV/JSON parse、normalize
  source-11586.ts          # 11586 source schema、CSV/JSON parse、normalize
  source-28567.ts          # 28567 source schema、normalize、94025 join
  http-client.ts           # 注入 fetch 的 timeout／HTTP／body 錯誤分類
  verification-gate.ts     # 證據完整性評估；不自動改 registry
tools/source-verification/
  catalog.ts               # 僅驗證工具可讀的 dataset/resource 候選清單
  verify-fixtures.mts      # 本機 fixture metadata/hash 驗證命令
  live-smoke.mts           # 人工 live GET 與隔離 JSON 報告
tests/source-verification/
  fixture-metadata.test.mjs
  source-11406.test.mjs
  source-94025.test.mjs
  source-11586.test.mjs
  source-28567.test.mjs
  http-client.test.mjs
  live-smoke.test.mjs
  verification-gate.test.mjs
tests/fixtures/source-verification/{11406,94025,11586,28567}/
  csv-minimal.csv           # 人工裁切的最小 CSV 樣本
  openapi-minimal.json      # 人工裁切的最小 JSON 樣本
  metadata.json             # 來源、授權、hash、列數與人工檢查紀錄
docs/source-verification/
  11406-evidence.md
  94025-evidence.md
  11586-evidence.md
  28567-evidence.md
  review-checklist.md
outputs/source-smoke/       # gitignored live smoke 報告，不被測試或 production 讀取
```

---

### Task 1: 來源證據與 Fixture 保存規範

**Files:**
- Create: `lib/source-verification/types.ts`
- Create: `lib/source-verification/fixture-metadata.ts`
- Create: `lib/source-verification/csv.ts`
- Create: `lib/source-verification/evidence-repository.ts`
- Create: `tests/source-verification/fixture-metadata.test.mjs`
- Create: `docs/source-verification/review-checklist.md`

**Single responsibilities:** `types.ts` 只定義跨 Task 契約；`fixture-metadata.ts` 只驗證 metadata 與內容一致性；`csv.ts` 只解析 UTF-8 CSV；repository 只保存本次 process 內的驗證證據；review checklist 只列人工簽核欄位。

**Interfaces:**
- Consumes: `lib/domain/dates.ts` 的 `isIsoDateTime()`。
- Produces: `FixtureMetadata`, `FixturePrivacyReview`, `SourceEvidence`, `VerificationDecision`, `parseFixtureMetadata(value)`, `sha256Hex(bytes)`, `verifyFixtureIntegrity(metadata, bytes, parsedRowCount)`, `parseCsv(text)`, `VerificationEvidenceRepository`, `InMemoryVerificationEvidenceRepository`。
- `parseCsv(text: string): readonly Readonly<Record<string, string>>[]`。
- `verifyFixtureIntegrity(metadata: FixtureMetadata, bytes: Uint8Array, fixtureRowCount: number): void`；hash、列數或人工檢查旗標不符時丟出 `FixtureIntegrityError`。

- [ ] **Step 1: Write the failing metadata and in-memory repository tests**

```js
test("fixture metadata requires provenance, minimization, privacy review and two hashes", () => {
  const value = validMetadata();
  assert.equal(parseFixtureMetadata(value).datasetId, "11406");
  for (const key of ["sourceId", "datasetId", "datasetName", "resourceUrl", "fetchedAt", "httpContentType", "sourceResponseSha256", "fixtureSha256", "sourceRowCount", "fixtureRowCount", "licenseName", "providerName", "manuallyReviewed", "privacyReview", "samplingMethod"]) {
    const invalid = structuredClone(value);
    delete invalid[key];
    assert.throws(() => parseFixtureMetadata(invalid), new RegExp(key));
  }
});

test("in-memory repository replaces evidence only by sourceId", async () => {
  const repo = new InMemoryVerificationEvidenceRepository();
  await repo.save({ sourceId: "data-gov-11406", datasetId: "11406", checks: [] });
  assert.equal((await repo.get("data-gov-11406"))?.datasetId, "11406");
  assert.equal((await repo.list()).length, 1);
});
```

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run: `node --test tests/source-verification/fixture-metadata.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/source-verification/fixture-metadata.ts` or missing named exports.

- [ ] **Step 3: Define exact shared types**

```ts
export type RegistryStage = "CANDIDATE" | "APPROVED_FOR_V1_DESIGN" | "VERIFIED_FOR_IMPLEMENTATION" | "APPROVED_FOR_PRODUCTION";
export type RegistryPauseState = "SUSPENDED";
export interface FixturePrivacyReview {
  containsPersonalData: boolean;
  excludedFields: string[];
  minimized: boolean;
  deidentified: boolean;
  rationale: string;
}
export interface FixtureMetadata {
  sourceId: string;
  datasetId: "11406" | "94025" | "11586" | "28567";
  datasetName: string;
  resourceRole: "csv" | "openapi_json";
  resourceUrl: string;
  fetchedAt: string;
  httpContentType: string;
  sourceResponseSha256: `sha256:${string}`;
  fixtureSha256: `sha256:${string}`;
  sourceRowCount: number;
  fixtureRowCount: number;
  licenseName: "政府資料開放授權條款－第1版";
  providerName: string;
  manuallyReviewed: boolean;
  privacyReview: FixturePrivacyReview;
  samplingMethod: string;
}
export interface EvidenceCheck { id: string; passed: boolean; evidencePath: string; note: string; }
export interface SourceEvidence { sourceId: string; datasetId: string; checks: EvidenceCheck[]; }
export interface VerificationDecision { eligible: boolean; currentStage: RegistryStage; maximumStage: "APPROVED_FOR_V1_DESIGN" | "VERIFIED_FOR_IMPLEMENTATION"; failedCheckIds: string[]; requiresManualApproval: true; }
```

- [ ] **Step 4: Implement strict metadata, hash, CSV and in-memory repository primitives**

```ts
export function sha256Hex(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
export function verifyFixtureIntegrity(metadata: FixtureMetadata, bytes: Uint8Array, parsedRowCount: number): void {
  if (sha256Hex(bytes) !== metadata.fixtureSha256) throw new FixtureIntegrityError("fixtureSha256 mismatch");
  if (parsedRowCount !== metadata.fixtureRowCount) throw new FixtureIntegrityError("fixtureRowCount mismatch");
  if (!metadata.manuallyReviewed) throw new FixtureIntegrityError("manuallyReviewed must be true");
  if (!metadata.privacyReview.minimized) throw new FixtureIntegrityError("privacyReview.minimized must be true");
}
export interface VerificationEvidenceRepository {
  save(evidence: SourceEvidence): Promise<void>;
  get(sourceId: string): Promise<SourceEvidence | undefined>;
  list(): Promise<SourceEvidence[]>;
}
export class InMemoryVerificationEvidenceRepository implements VerificationEvidenceRepository {
  readonly #items = new Map<string, SourceEvidence>();
  async save(evidence: SourceEvidence): Promise<void> { this.#items.set(evidence.sourceId, structuredClone(evidence)); }
  async get(sourceId: string): Promise<SourceEvidence | undefined> { const item = this.#items.get(sourceId); return item && structuredClone(item); }
  async list(): Promise<SourceEvidence[]> { return [...this.#items.values()].map(item => structuredClone(item)); }
}
```

`parseFixtureMetadata()` must reject unknown keys, non-HTTPS `resourceUrl`, non-UTC `fetchedAt`, hashes not matching `sha256:[0-9a-f]{64}`, negative/non-integer counts, `fixtureRowCount > sourceRowCount`, false `manuallyReviewed`, empty `samplingMethod`, and a privacy review lacking explicit `rationale`. `parseCsv()` must support quoted commas, escaped double quotes, CRLF/LF, UTF-8 BOM, reject duplicate/blank headers, inconsistent column counts and unclosed quotes.

- [ ] **Step 5: Add boundary tests**

```js
test("CSV parser handles quoted commas and rejects malformed rows", () => {
  assert.deepEqual(parseCsv("代號,名稱\r\n1234,\"甲,乙\"\r\n"), [{ 代號: "1234", 名稱: "甲,乙" }]);
  assert.throws(() => parseCsv("代號,代號\n1,2"), /duplicate header/);
  assert.throws(() => parseCsv("代號,名稱\n1"), /column count/);
  assert.throws(() => parseCsv("代號,名稱\n1,\"未結束"), /unclosed quote/);
});
```

- [ ] **Step 6: Run focused and baseline tests**

Run: `node --test tests/source-verification/fixture-metadata.test.mjs`

Expected: PASS with zero failures and no network requests.

Run: `npm test`

Expected: existing 54 tests plus this file pass; build completes and no request reaches an official host.

- [ ] **Step 7: Commit Task 1**

```powershell
git add lib/source-verification/types.ts lib/source-verification/fixture-metadata.ts lib/source-verification/csv.ts lib/source-verification/evidence-repository.ts tests/source-verification/fixture-metadata.test.mjs docs/source-verification/review-checklist.md
git commit -m "test: define source fixture evidence contracts"
```

---

### Task 2: 資料集 11406 Schema 與 Contract Tests

**Files:**
- Create: `lib/source-verification/source-11406.ts`
- Create: `tests/source-verification/source-11406.test.mjs`
- Create: `tests/fixtures/source-verification/11406/csv-minimal.csv`
- Create: `tests/fixtures/source-verification/11406/openapi-minimal.json`
- Create: `tests/fixtures/source-verification/11406/metadata.json`
- Create: `docs/source-verification/11406-evidence.md`

**Single responsibilities:** source module 僅驗證與正規化 11406 白名單欄位；Fixture 只涵蓋正常、空日期、多重賣回日、中文數值／單位與錯誤格式；evidence 文件保存頁面/OAS/resource 對應及主 resource 建議。

**Interfaces:**
- Consumes: `parseCsv()`, `FixtureMetadata`, `isIsoDate()`。
- Produces: `Source11406Row`, `NormalizedBondIssue11406`, `parse11406Csv(text)`, `parse11406Json(value)`, `compare11406ResourceSchemas(csvRows, jsonRows)`, `normalize11406Row(row)`。
- 所有 parse 函式輸出 source row；只有 normalize 函式輸出 domain-shaped record，且不得包含 `price`, `quote`, `volume`, `closePrice` 或 `issuerMarket`。

- [ ] **Step 1: Save manually reviewed minimal fixtures and metadata**

Fixture 必須由人工在瀏覽器或核准的唯讀下載程序取得同次 CSV/JSON response 後裁切，不得由測試即時下載。`metadata.json` 為兩筆 metadata array，分別記錄 CSV 與 OpenAPI resource；`sourceResponseSha256` 是裁切前完整 response hash，`fixtureSha256` 是 repository 中裁切檔 hash，並明列 `samplingMethod` 為「保留一筆完整正常列、一筆含空日期／多重賣回日／中文單位列；刪除其餘列，不改寫保留列字元」。

- [ ] **Step 2: Write failing contract tests**

```js
test("11406 CSV and OpenAPI expose equivalent required field roles", async () => {
  const csvRows = parse11406Csv(await fixture("csv-minimal.csv"));
  const jsonRows = parse11406Json(JSON.parse(await fixture("openapi-minimal.json")));
  assert.deepEqual(compare11406ResourceSchemas(csvRows, jsonRows), { equivalent: true, missingInCsv: [], missingInJson: [] });
});
test("11406 normalizes contract terms but never market data", async () => {
  const [row] = parse11406Csv(await fixture("csv-minimal.csv"));
  const value = normalize11406Row(row);
  assert.match(value.bondId, /^bond:/);
  assert.ok(Array.isArray(value.putDates));
  for (const banned of ["price", "quote", "volume", "closePrice", "issuerMarket"]) assert.equal(banned in value, false);
});
```

- [ ] **Step 3: Run and verify red state**

Run: `node --test tests/source-verification/source-11406.test.mjs`

Expected: FAIL because `source-11406.ts` or its exports do not exist.

- [ ] **Step 4: Implement exact 11406 source and normalized types**

```ts
export interface Source11406Row {
  officialDataDate: string; issuerCode: string; issuerName: string; bondCode: string;
  sourceBondTypeCode: string; seriesNumber: string; trancheNumber: string; shortName: string;
  issueDate: string; listingDate: string; maturityDate: string; issueAmount: string;
  outstandingAmount: string; couponRate: string; securedText: string; securityDescription: string;
  initialConversionPrice: string; conversionStartDate: string; conversionEndDate: string;
  putDatesText: string; putPrice: string; underwriter: string; trustee: string;
  outstandingChangeDate: string; outstandingChangeReason: string; offeringMethod: string;
}
export interface NormalizedBondIssue11406 {
  bondId: string; bondCode?: string; issuerCode: string; issuerName: string; shortName: string;
  sourceBondTypeCode: string; seriesNumber?: string; trancheNumber?: string;
  issueDate: string; listingDate?: string; maturityDate: string; issueAmount: string;
  outstandingAmount: string; couponRate?: string; secured: boolean; securityDescription?: string;
  initialConversionPrice?: string; conversionStartDate?: string; conversionEndDate?: string;
  putDates: string[]; putPrice?: string; underwriter?: string; trustee?: string;
  outstandingChangeDate?: string; outstandingChangeReason?: string; offeringMethod?: string;
  officialDataDate: string;
}
```

Use a fixed alias map derived only from the two saved fixtures. Normalize ROC/Western dates through `parseOfficialCalendarDate(value): string | undefined`; strip commas and a single documented unit suffix from decimal text; preserve coupon clause text only when it is not representable as a decimal; split multiple put dates only on separators actually present in the Fixture; sort and de-duplicate valid put dates. A blank required date, maturity before issue, invalid decimal, unknown source key, duplicate bond identity, or incomplete composite identity must reject the entire parsed Fixture.

- [ ] **Step 5: Add required edge cases and prohibited-source guard**

```js
test("11406 handles blanks, multiple put dates and Chinese numeric units deterministically", () => {
  const value = normalize11406Row(edgeRow({ listingDate: "", putDatesText: "115/01/02、116/01/02", issueAmount: "1,000,000仟元" }));
  assert.equal(value.listingDate, undefined);
  assert.deepEqual(value.putDates, ["2026-01-02", "2027-01-02"]);
  assert.equal(value.issueAmount, "1000000000");
});
test("11406 module cannot reference the market endpoint", async () => {
  assert.doesNotMatch(await readFile(new URL("../../lib/source-verification/source-11406.ts", import.meta.url), "utf8"), /bond_cb_daily|closePrice|dailyVolume/);
});
```

- [ ] **Step 6: Verify Fixture integrity and tests**

Run: `node --test tests/source-verification/fixture-metadata.test.mjs tests/source-verification/source-11406.test.mjs`

Expected: PASS; metadata hashes and Fixture row counts match, CSV/JSON required roles are equivalent, malformed cases are rejected, and no official network call occurs.

- [ ] **Step 7: Commit Task 2**

```powershell
git add lib/source-verification/source-11406.ts tests/source-verification/source-11406.test.mjs tests/fixtures/source-verification/11406 docs/source-verification/11406-evidence.md
git commit -m "test: verify dataset 11406 fixture contract"
```

---

### Task 3: 資料集 94025 Schema 與 Contract Tests

**Files:**
- Create: `lib/source-verification/source-94025.ts`
- Create: `tests/source-verification/source-94025.test.mjs`
- Create: `tests/fixtures/source-verification/94025/csv-minimal.csv`
- Create: `tests/fixtures/source-verification/94025/openapi-minimal.json`
- Create: `tests/fixtures/source-verification/94025/metadata.json`
- Create: `docs/source-verification/94025-evidence.md`

**Single responsibilities:** 驗證 metadata 頁、CSV、OAS、OpenAPI 三種角色；schema 僅接受月營收白名單；evidence 文件記錄唯一主 resource 的人工選擇，不提供 runtime fallback。

**Interfaces:**
- Produces: `Source94025Row`, `NormalizedMonthlyRevenue94025`, `parse94025Csv(text)`, `parse94025Json(value)`, `compare94025ResourceSchemas(csvRows, jsonRows)`, `normalize94025Row(row)`, `assertUnique94025CompanyCodes(rows)`。
- `NormalizedMonthlyRevenue94025` fields: `companyCode`, `companyName`, `industryName`, `yearMonth`, `sourcePublishedOn`, `currentMonthRevenue`, `previousMonthRevenue`, `priorYearMonthRevenue`, `monthOverMonthPercent`, `yearOverYearPercent`, `cumulativeRevenue`, `priorYearCumulativeRevenue`, `cumulativeYearOverYearPercent`。

- [ ] **Step 1: Save the three-role evidence and two minimal resources**

`metadata.json` 必須分開寫 `metadataPageUrl`, CSV resource metadata, `oasUrl`, OpenAPI resource metadata；CSV/JSON Fixture 使用相同 `資料年月` 並各保留一筆正常正值、一筆負成長率、一筆破折號／空值案例。evidence 文件明列正式系統只能在人工覆核時選 `primaryResourceRole: "csv"` 或 `"openapi_json"`，另一者只供此次 schema 比較，不得 fallback。

- [ ] **Step 2: Write failing 94025 tests**

```js
test("94025 keeps metadata, CSV, OAS and OpenAPI roles distinct", async () => {
  const metadata = JSON.parse(await fixture("metadata.json"));
  assert.notEqual(new URL(metadata.csv.resourceUrl).host, new URL(metadata.openapi.resourceUrl).host);
  assert.ok(metadata.oasUrl);
  assert.ok(metadata.metadataPageUrl);
});
test("94025 preserves official ratios and units without recomputation", async () => {
  const rows = parse94025Csv(await fixture("csv-minimal.csv"));
  const value = normalize94025Row(rows.find(row => row.monthOverMonthPercent.startsWith("-")));
  assert.match(value.monthOverMonthPercent, /^-/);
  assert.equal(value.revenueUnit, "仟元");
});
```

- [ ] **Step 3: Run and verify red state**

Run: `node --test tests/source-verification/source-94025.test.mjs`

Expected: FAIL because `source-94025.ts` is absent.

- [ ] **Step 4: Implement the strict schema and mapping**

```ts
export interface NormalizedMonthlyRevenue94025 {
  companyCode: string; companyName: string; industryName: string; yearMonth: string;
  sourcePublishedOn: string; revenueUnit: "仟元";
  currentMonthRevenue: string; previousMonthRevenue?: string; priorYearMonthRevenue?: string;
  monthOverMonthPercent?: string; yearOverYearPercent?: string;
  cumulativeRevenue?: string; priorYearCumulativeRevenue?: string;
  cumulativeYearOverYearPercent?: string;
}
export function assertUnique94025CompanyCodes(rows: readonly NormalizedMonthlyRevenue94025[]): void {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = `${row.yearMonth}:${row.companyCode}`;
    if (keys.has(key)) throw new Source94025ValidationError(`duplicate companyCode for yearMonth: ${key}`);
    keys.add(key);
  }
}
```

Define `normalizeOptionalDecimal(value, { signed, percent })`: trim, convert full-width minus to `-`, remove a terminal `%`, treat only `""`, `"-"`, `"--"`, `"－"` as missing, reject parentheses negatives and embedded units, strip comma grouping, return canonical decimal string. Revenue fields are non-negative; percentage fields allow negative values. Never calculate ratios from revenue numbers.

- [ ] **Step 5: Add edge and resource-selection tests**

```js
test("94025 handles negative, blank, dash and percent values", () => {
  assert.equal(normalize94025Percent("-12.30%"), "-12.30");
  assert.equal(normalize94025Percent("－"), undefined);
  assert.equal(normalize94025Revenue("1,234"), "1234");
  assert.throws(() => normalize94025Revenue("-1"), /non-negative/);
});
test("94025 rejects duplicate company code in one month", () => {
  const row = normalizedRevenue({ companyCode: "1234", yearMonth: "2026-06" });
  assert.throws(() => assertUnique94025CompanyCodes([row, row]), /duplicate/);
});
```

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/source-verification/fixture-metadata.test.mjs tests/source-verification/source-94025.test.mjs`

Expected: PASS; CSV/OpenAPI roles map to the same normalized whitelist, unusual values follow explicit rules, and no fallback function or network request exists.

- [ ] **Step 7: Commit Task 3**

```powershell
git add lib/source-verification/source-94025.ts tests/source-verification/source-94025.test.mjs tests/fixtures/source-verification/94025 docs/source-verification/94025-evidence.md
git commit -m "test: verify dataset 94025 fixture contract"
```

---

### Task 4: 資料集 11586 Schema 與 Contract Tests

**Files:**
- Create: `lib/source-verification/source-11586.ts`
- Create: `tests/source-verification/source-11586.test.mjs`
- Create: `tests/fixtures/source-verification/11586/csv-minimal.csv`
- Create: `tests/fixtures/source-verification/11586/openapi-minimal.json`
- Create: `tests/fixtures/source-verification/11586/metadata.json`
- Create: `docs/source-verification/11586-evidence.md`

**Single responsibilities:** 驗證 CSV 與 `/company/applylistingLocal` 欄位角色、偵測 JSON key/value 錯位、只輸出上市申請里程碑，不接受承銷價格。

**Interfaces:**
- Produces: `Source11586Row`, `NormalizedListingApplication11586`, `parse11586Csv(text)`, `parse11586Json(value)`, `compare11586ResourceSchemas(csvRows, jsonRows)`, `detect11586MisalignedFields(row)`, `normalize11586Row(row)`。
- normalized fields: `companyCode`, `companyName`, `appliedOn`, `reviewedOn?`, `boardApprovedOn?`, `contractApprovedOn?`, `listedOn?`, `targetMarket: "listed"`。

- [ ] **Step 1: Save minimal same-cycle CSV/JSON evidence**

Keep one row with every milestone, one row with future milestones blank, and one row that demonstrates the observed JSON key/value shape. Metadata records both full-response and cropped hashes. Exclude chairman, applied capital, underwriter, underwriting price and note from cropped Fixture unless a single excluded-field sentinel is necessary for a rejection test; record excluded fields in `privacyReview.excludedFields`.

- [ ] **Step 2: Write failing alignment and whitelist tests**

```js
test("11586 CSV and JSON agree by semantic field, not object key order", async () => {
  const csv = parse11586Csv(await fixture("csv-minimal.csv"));
  const json = parse11586Json(JSON.parse(await fixture("openapi-minimal.json")));
  assert.deepEqual(compare11586ResourceSchemas(csv, json), { equivalent: true, misaligned: [] });
});
test("11586 output excludes underwriting price", async () => {
  const value = normalize11586Row(parse11586Csv(await fixture("csv-minimal.csv"))[0]);
  assert.equal("underwritingPrice" in value, false);
  assert.equal("承銷價" in value, false);
});
```

- [ ] **Step 3: Run and verify red state**

Run: `node --test tests/source-verification/source-11586.test.mjs`

Expected: FAIL due to missing source module.

- [ ] **Step 4: Implement semantic alignment and date mapping**

```ts
export interface NormalizedListingApplication11586 {
  companyCode: string;
  companyName: string;
  targetMarket: "listed";
  appliedOn: string;
  reviewedOn?: string;
  boardApprovedOn?: string;
  contractApprovedOn?: string;
  listedOn?: string;
}
export function detect11586MisalignedFields(row: Record<string, unknown>): string[] {
  return milestoneKeys.filter((key) => {
    const value = row[key];
    return value !== "" && value !== undefined && !isRecognizedOfficialDate(value);
  });
}
```

Parse by exact saved key names, never by `Object.values()` order. Validate company code as non-empty official identifier, normalize only recognized ROC/Western date formats, require `appliedOn`, require milestone order `appliedOn <= reviewedOn <= boardApprovedOn <= contractApprovedOn <= listedOn` for present adjacent values, and reject unknown keys except an explicit source-only exclusion set that is discarded before normalized output.

- [ ] **Step 5: Add misalignment, missing date and price rejection tests**

```js
test("11586 rejects a date key containing a company name", () => {
  assert.deepEqual(detect11586MisalignedFields(sourceRow({ ApplyDate: "測試公司" })), ["ApplyDate"]);
  assert.throws(() => normalize11586Row(sourceRow({ ApplyDate: "測試公司" })), /misaligned/);
});
test("11586 rejects reversed milestones and ignored price leakage", () => {
  assert.throws(() => normalize11586Row(sourceRow({ appliedOn: "2026-02-01", reviewedOn: "2026-01-01" })), /milestone order/);
  assert.throws(() => parse11586Json([{ ...validRawRow(), 承銷價: "42" }]), /prohibited field/);
});
```

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/source-verification/fixture-metadata.test.mjs tests/source-verification/source-11586.test.mjs`

Expected: PASS; object key order cannot cause mapping changes, malformed milestone data is rejected, and normalized output contains no price field.

- [ ] **Step 7: Commit Task 4**

```powershell
git add lib/source-verification/source-11586.ts tests/source-verification/source-11586.test.mjs tests/fixtures/source-verification/11586 docs/source-verification/11586-evidence.md
git commit -m "test: verify dataset 11586 fixture contract"
```

---

### Task 5: 資料集 28567 查核與條件式納入

**Files:**
- Create: `lib/source-verification/source-28567.ts`
- Create: `tests/source-verification/source-28567.test.mjs`
- Create: `tests/fixtures/source-verification/28567/csv-minimal.csv`
- Create: `tests/fixtures/source-verification/28567/openapi-minimal.json`
- Create: `tests/fixtures/source-verification/28567/metadata.json`
- Create: `docs/source-verification/28567-evidence.md`

**Single responsibilities:** 查核 dataset/page/OAS/CSV/OpenAPI 對應，正規化公開發行公司白名單，並以 94025 company code 集合進行唯一 join；不產生市場身分。

**Interfaces:**
- Produces: `Source28567Row`, `NormalizedCompanyProfile28567`, `parse28567Csv(text)`, `parse28567Json(value)`, `compare28567ResourceSchemas(csvRows, jsonRows)`, `assertUnique28567CompanyCodes(rows)`, `joinProfilesTo94025Coverage(coverage, profiles)`。
- `joinProfilesTo94025Coverage()` returns `{ matched: Map<string, NormalizedCompanyProfile28567>; rejected: JoinRejection[] }`, where `JoinRejection.reason` is `MISSING_PROFILE | DUPLICATE_PROFILE | IDENTITY_CONFLICT`。

- [ ] **Step 1: Preserve evidence conditionally**

Verify the independent dataset page still states OGL 1.0 and free use, the CSV resource is linked from that page, and `/opendata/t187ap03_P` is listed in the official OAS. Save exact checked time and page/resource identifiers in metadata and evidence. If any link, license, provider, endpoint or schema relation cannot be confirmed, write `verificationOutcome: "INSUFFICIENT_EVIDENCE"` in the evidence document, do not create synthetic Fixture content, keep registry status at `APPROVED_FOR_V1_DESIGN`, and stop Task 5 before any status recommendation.

- [ ] **Step 2: Write failing schema and join tests when evidence is sufficient**

```js
test("28567 maps only the approved profile whitelist", async () => {
  const value = normalize28567Row(parse28567Csv(await fixture("csv-minimal.csv"))[0]);
  assert.deepEqual(Object.keys(value).sort(), ["address", "chairperson", "companyCode", "companyName", "establishedOn", "generalManager", "industryName", "paidInCapital", "shortName", "sourcePublishedOn", "taxId", "websiteUrl"].sort());
});
test("28567 cannot establish emerging identity", async () => {
  const source = await readFile(new URL("../../lib/source-verification/source-28567.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /market:\s*["']emerging["']|became_emerging|terminated_emerging/);
});
```

- [ ] **Step 3: Run and verify red state**

Run: `node --test tests/source-verification/source-28567.test.mjs`

Expected: FAIL because the source module is absent. If Step 1 ended with insufficient evidence, expected result is SKIP with an explicit reason read from `28567-evidence.md`, and no source module or Fixture is committed.

- [ ] **Step 4: Implement profile schema and exact join**

```ts
export interface NormalizedCompanyProfile28567 {
  companyCode: string; companyName: string; shortName?: string; industryName?: string;
  websiteUrl?: string; establishedOn?: string; paidInCapital?: string;
  chairperson?: string; generalManager?: string; taxId?: string; address?: string;
  sourcePublishedOn: string;
}
export function joinProfilesTo94025Coverage(
  coverage: readonly { companyCode: string; companyName: string }[],
  profiles: readonly NormalizedCompanyProfile28567[],
): { matched: Map<string, NormalizedCompanyProfile28567>; rejected: JoinRejection[] } {
  const byCode = groupByCompanyCode(profiles);
  const matched = new Map<string, NormalizedCompanyProfile28567>();
  const rejected: JoinRejection[] = [];
  for (const member of coverage) {
    const candidates = byCode.get(member.companyCode) ?? [];
    if (candidates.length !== 1) { rejected.push({ companyCode: member.companyCode, reason: candidates.length ? "DUPLICATE_PROFILE" : "MISSING_PROFILE" }); continue; }
    if (!namesCompatible(member.companyName, candidates[0].companyName, candidates[0].shortName)) { rejected.push({ companyCode: member.companyCode, reason: "IDENTITY_CONFLICT" }); continue; }
    matched.set(member.companyCode, candidates[0]);
  }
  return { matched, rejected };
}
```

`namesCompatible()` may only trim whitespace and normalize full-/half-width spaces; it must not fuzzy-match unrelated names. Company code must be unique in 28567. URL accepts only HTTP/HTTPS. Paid-in capital is a non-negative decimal with documented unit. Empty optional fields become `undefined`; unknown raw fields are rejected unless named in a source exclusion whitelist and discarded.

- [ ] **Step 5: Add ambiguity and no-market-inference tests**

```js
test("28567 rejects non-unique code and name conflicts", () => {
  const result = joinProfilesTo94025Coverage([{ companyCode: "1234", companyName: "甲公司" }], [profile("1234", "甲公司"), profile("1234", "甲公司")]);
  assert.equal(result.matched.size, 0);
  assert.deepEqual(result.rejected, [{ companyCode: "1234", reason: "DUPLICATE_PROFILE" }]);
});
test("28567 rows outside 94025 coverage are not returned", () => {
  const result = joinProfilesTo94025Coverage([{ companyCode: "1234", companyName: "甲公司" }], [profile("1234", "甲公司"), profile("5678", "乙公司")]);
  assert.deepEqual([...result.matched.keys()], ["1234"]);
});
```

- [ ] **Step 6: Run focused tests or confirm evidence-only endpoint**

Run: `node --test tests/source-verification/fixture-metadata.test.mjs tests/source-verification/source-28567.test.mjs`

Expected when evidence is sufficient: PASS with exact join and no market inference. Expected when evidence is insufficient: the explicit evidence test passes by confirming registry remains `APPROVED_FOR_V1_DESIGN`, while schema/join tests are absent rather than backed by fabricated data.

- [ ] **Step 7: Commit Task 5**

Evidence sufficient:

```powershell
git add lib/source-verification/source-28567.ts tests/source-verification/source-28567.test.mjs tests/fixtures/source-verification/28567 docs/source-verification/28567-evidence.md
git commit -m "test: verify dataset 28567 fixture contract"
```

Evidence insufficient:

```powershell
git add docs/source-verification/28567-evidence.md tests/source-verification/source-28567.test.mjs
git commit -m "docs: record dataset 28567 verification gap"
```

---

### Task 6: HTTP Client 與 Mock Adapter 測試基礎

**Files:**
- Create: `lib/source-verification/http-client.ts`
- Create: `tests/source-verification/http-client.test.mjs`

**Single responsibility:** 提供可注入 `fetch` 的驗證期 HTTP transport；不含任何資料集 URL、domain mapping、fallback 或 production adapter。

**Interfaces:**
- Produces: `VerificationHttpClient`, `VerificationHttpRequest`, `VerificationHttpResponse`, `VerificationHttpError`, `createVerificationHttpClient(fetchImpl, options)`。
- `get(request: { url: URL; accept: "text/csv" | "application/json"; signal?: AbortSignal }): Promise<{ status: number; contentType: string; body: Uint8Array; fetchedAt: string }>`。
- Error codes: `TIMEOUT`, `NETWORK_ERROR`, `HTTP_ERROR`, `EMPTY_BODY`, `CONTENT_TYPE_MISMATCH`, `BODY_TOO_LARGE`。

- [ ] **Step 1: Write failing mock tests**

```js
test("verification HTTP client returns bytes and metadata", async () => {
  const fetchMock = async () => new Response("a,b\n1,2\n", { status: 200, headers: { "content-type": "text/csv; charset=utf-8" } });
  const client = createVerificationHttpClient(fetchMock, { timeoutMs: 50, maxBytes: 1024, now: () => "2026-07-22T12:00:00Z" });
  const result = await client.get({ url: new URL("https://official.example/data.csv"), accept: "text/csv" });
  assert.equal(result.status, 200);
  assert.equal(new TextDecoder().decode(result.body), "a,b\n1,2\n");
});
```

- [ ] **Step 2: Run and verify red state**

Run: `node --test tests/source-verification/http-client.test.mjs`

Expected: FAIL due to missing `http-client.ts`.

- [ ] **Step 3: Implement the injectable client**

```ts
export function createVerificationHttpClient(fetchImpl: typeof fetch, options: HttpClientOptions): VerificationHttpClient {
  return { async get(request) {
    const timeout = AbortSignal.timeout(options.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    let response: Response;
    try { response = await fetchImpl(request.url, { method: "GET", headers: { Accept: request.accept }, redirect: "error", signal }); }
    catch (error) { throw classifyFetchError(error); }
    if (!response.ok) throw new VerificationHttpError("HTTP_ERROR", response.status);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes(request.accept)) throw new VerificationHttpError("CONTENT_TYPE_MISMATCH", response.status);
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.length === 0) throw new VerificationHttpError("EMPTY_BODY", response.status);
    if (body.length > options.maxBytes) throw new VerificationHttpError("BODY_TOO_LARGE", response.status);
    return { status: response.status, contentType, body, fetchedAt: options.now() };
  }};
}
```

- [ ] **Step 4: Add timeout, abort, error and no-fallback tests**

```js
for (const [name, response, code] of [["HTTP 503", new Response("down", { status: 503 }), "HTTP_ERROR"], ["empty", new Response("", { status: 200, headers: { "content-type": "application/json" } }), "EMPTY_BODY"]]) {
  test(name, async () => assert.rejects(clientFor(response).get(jsonRequest), error => error.code === code));
}
test("client calls exactly one URL and never falls back", async () => {
  const calls = [];
  const client = createVerificationHttpClient(async request => { calls.push(String(request)); return new Response("down", { status: 503 }); }, options);
  await assert.rejects(client.get(jsonRequest), /HTTP_ERROR/);
  assert.deepEqual(calls, [jsonRequest.url.href]);
});
```

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/source-verification/http-client.test.mjs`

Expected: PASS for success, timeout, caller abort, network rejection, 4xx/5xx, empty body, wrong content type, maximum bytes and exactly-one-request cases; no real network call.

- [ ] **Step 6: Commit Task 6**

```powershell
git add lib/source-verification/http-client.ts tests/source-verification/http-client.test.mjs
git commit -m "test: add mockable source verification http client"
```

---

### Task 7: Live Source Smoke Test 工具

**Files:**
- Create: `tools/source-verification/catalog.ts`
- Create: `tools/source-verification/live-smoke.mts`
- Create: `tests/source-verification/live-smoke.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

**Single responsibilities:** catalog 只列人工驗證用候選 resource；live command 只執行單一 GET、schema 摘要與隔離報告；測試以 mock transport 驗證行為；`.gitignore` 防止 live report 入庫。

**Interfaces:**
- `SmokeSourceId = "data-gov-11406" | "data-gov-94025" | "data-gov-11586" | "data-gov-28567"`。
- `runLiveSmoke({ sourceId, fetchImpl, checkedAt, outputDirectory }): Promise<LiveSmokeReport>`。
- Report fields: `sourceId`, `resourceRole`, `resourceUrl`, `checkedAt`, `httpStatus`, `contentType`, `responseSha256`, `rowCount`, `schemaValid`, `schemaErrors`, `wrotePublishedSnapshot: false`, `wroteD1: false`。

- [ ] **Step 1: Write failing isolated smoke tests**

```js
test("live smoke writes only an isolated report", async () => {
  const writes = new Map();
  const report = await runLiveSmoke({ sourceId: "data-gov-11406", fetchImpl: mock11406Fetch, checkedAt: "2026-07-22T12:00:00Z", writeReport: async (path, body) => writes.set(path, body) });
  assert.equal(report.schemaValid, true);
  assert.equal(report.wrotePublishedSnapshot, false);
  assert.equal(report.wroteD1, false);
  assert.deepEqual([...writes.keys()], ["outputs/source-smoke/data-gov-11406-20260722T120000Z.json"]);
});
```

- [ ] **Step 2: Run and verify red state**

Run: `node --test tests/source-verification/live-smoke.test.mjs`

Expected: FAIL because smoke module does not exist.

- [ ] **Step 3: Implement catalog and smoke runner without runtime imports**

```ts
export const smokeCatalog = {
  "data-gov-11406": { stage: "APPROVED_FOR_V1_DESIGN", resourceRole: "openapi_json", url: new URL("https://www.tpex.org.tw/openapi/v1/bond_ISSBD5_data"), parse: parse11406Json },
  "data-gov-94025": { stage: "APPROVED_FOR_V1_DESIGN", resourceRole: "openapi_json", url: new URL("https://www.tpex.org.tw/openapi/v1/t187ap05_R"), parse: parse94025Json },
  "data-gov-11586": { stage: "APPROVED_FOR_V1_DESIGN", resourceRole: "openapi_json", url: new URL("https://openapi.twse.com.tw/v1/company/applylistingLocal"), parse: parse11586Json },
  "data-gov-28567": { stage: "APPROVED_FOR_V1_DESIGN", resourceRole: "openapi_json", url: new URL("https://openapi.twse.com.tw/v1/opendata/t187ap03_P"), parse: parse28567Json },
} as const;
```

The CLI requires both `--source <sourceId>` and `--confirm-live-read`; without confirmation it exits 2 before calling fetch. It must also require the selected catalog entry to be `VERIFIED_FOR_IMPLEMENTATION`, so all four entries at their current `APPROVED_FOR_V1_DESIGN` stage are refused before network access. It must reject `SUSPENDED`, unknown, or non-HTTPS entries, perform one request only, parse rows without saving response body, write a report under `outputs/source-smoke`, and exit 1 on HTTP/schema failure. It must never import `app`, `worker`, `db`, a repository implementation, or published snapshot code.

- [ ] **Step 4: Add package command and ignore rule**

```json
{
  "scripts": {
    "smoke:sources": "node --experimental-strip-types tools/source-verification/live-smoke.mts"
  }
}
```

Append exactly `outputs/source-smoke/` to `.gitignore`.

- [ ] **Step 5: Add isolation and failure tests**

```js
test("smoke failure performs one request and does not select another resource", async () => {
  const calls = [];
  await assert.rejects(runLiveSmoke({ ...baseArgs, fetchImpl: async url => { calls.push(String(url)); return new Response("down", { status: 503 }); } }), /HTTP_ERROR/);
  assert.equal(calls.length, 1);
});
test("design-approved source is refused before fetch", async () => {
  let called = false;
  await assert.rejects(runLiveSmoke({ ...baseArgs, sourceStage: "APPROVED_FOR_V1_DESIGN", fetchImpl: async () => { called = true; throw new Error("unreachable"); } }), /VERIFIED_FOR_IMPLEMENTATION/);
  assert.equal(called, false);
});
test("default npm test cannot invoke live smoke", async () => {
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.doesNotMatch(pkg.scripts.test, /smoke:sources|live-smoke/);
});
```

- [ ] **Step 6: Run mock-only tests; do not execute the live command during implementation CI**

Run: `node --test tests/source-verification/http-client.test.mjs tests/source-verification/live-smoke.test.mjs`

Expected: PASS using mock responses; `outputs/source-smoke` remains absent or empty; no official request occurs.

Manual command only after Task 8 has an explicit human `VERIFIED_FOR_IMPLEMENTATION` decision: `npm run smoke:sources -- --source data-gov-11406 --confirm-live-read`

Expected before that decision: exit 2 with no request and an error naming `VERIFIED_FOR_IMPLEMENTATION`. Expected after that decision: one JSON report with HTTP status, content type, hash, row count, schema result and UTC check time; no raw response, snapshot, D1 write or fallback. This manual command is not part of `npm test` or Task 7 automated verification.

- [ ] **Step 7: Commit Task 7**

```powershell
git add tools/source-verification/catalog.ts tools/source-verification/live-smoke.mts tests/source-verification/live-smoke.test.mjs package.json .gitignore
git commit -m "test: isolate live source smoke checks"
```

---

### Task 8: Source Registry 狀態升級驗證

**Files:**
- Create: `lib/source-verification/verification-gate.ts`
- Create: `tests/source-verification/verification-gate.test.mjs`
- Modify: `docs/source-verification/review-checklist.md`
- Modify conditionally after human approval: `docs/data-source-registry.md`

**Single responsibilities:** gate 計算證據是否完整但不改狀態；review checklist 保存人工姓名／日期／決定；Source Registry 只在明確人工批准個別 dataset 後更新該筆狀態。

**Interfaces:**
- Produces: `requiredImplementationChecks`, `evaluateImplementationVerification(currentStage, evidence)`, `evaluateEvidenceForSource(sourceId, currentStage, evidence)`, `formatVerificationSummary(decision)`。
- Required check IDs: `DATASET_PAGE`, `LICENSE`, `FREE`, `OFFICIAL_PROVIDER`, `RESOURCE_MAPPING`, `MINIMAL_FIXTURE`, `FIXTURE_HASH`, `SOURCE_SCHEMA`, `FIELD_MAPPING`, `FORMAT_RULES`, `ATTRIBUTION`, `PRIVACY_MINIMIZATION`, `PRIMARY_RESOURCE`, `FIXTURE_CONTRACT_TESTS`, `MOCK_HTTP_TESTS`, `MANUAL_REVIEW`。

- [ ] **Step 1: Write failing gate tests**

```js
test("complete evidence is eligible only for manual VERIFIED_FOR_IMPLEMENTATION approval", () => {
  const decision = evaluateImplementationVerification("APPROVED_FOR_V1_DESIGN", completeEvidence());
  assert.deepEqual(decision, { eligible: true, currentStage: "APPROVED_FOR_V1_DESIGN", maximumStage: "VERIFIED_FOR_IMPLEMENTATION", failedCheckIds: [], requiresManualApproval: true });
});
test("gate never grants production and reports every missing check", () => {
  const decision = evaluateImplementationVerification("APPROVED_FOR_V1_DESIGN", evidenceMissing("FIXTURE_HASH", "ATTRIBUTION"));
  assert.equal(decision.eligible, false);
  assert.deepEqual(decision.failedCheckIds, ["FIXTURE_HASH", "ATTRIBUTION"]);
  assert.equal(JSON.stringify(decision).includes("APPROVED_FOR_PRODUCTION"), false);
});
```

- [ ] **Step 2: Run and verify red state**

Run: `node --test tests/source-verification/verification-gate.test.mjs`

Expected: FAIL due to missing gate module.

- [ ] **Step 3: Implement deterministic evidence evaluation**

```ts
export const requiredImplementationChecks = ["DATASET_PAGE", "LICENSE", "FREE", "OFFICIAL_PROVIDER", "RESOURCE_MAPPING", "MINIMAL_FIXTURE", "FIXTURE_HASH", "SOURCE_SCHEMA", "FIELD_MAPPING", "FORMAT_RULES", "ATTRIBUTION", "PRIVACY_MINIMIZATION", "PRIMARY_RESOURCE", "FIXTURE_CONTRACT_TESTS", "MOCK_HTTP_TESTS", "MANUAL_REVIEW"] as const;
export function evaluateImplementationVerification(currentStage: RegistryStage, evidence: SourceEvidence): VerificationDecision {
  if (currentStage !== "APPROVED_FOR_V1_DESIGN") throw new VerificationGateError("source must be APPROVED_FOR_V1_DESIGN");
  const byId = new Map(evidence.checks.map(check => [check.id, check]));
  const failedCheckIds = requiredImplementationChecks.filter(id => !byId.get(id)?.passed);
  return { eligible: failedCheckIds.length === 0, currentStage, maximumStage: "VERIFIED_FOR_IMPLEMENTATION", failedCheckIds, requiresManualApproval: true };
}
export function evaluateEvidenceForSource(sourceId: string, currentStage: RegistryStage, evidence: SourceEvidence): VerificationDecision {
  if (evidence.sourceId !== sourceId) throw new VerificationGateError("sourceId mismatch");
  return evaluateImplementationVerification(currentStage, evidence);
}
```

- [ ] **Step 4: Add independent pause and individual-dataset tests**

```js
test("SUSPENDED is rejected as a pause state rather than treated as a fifth stage", () => {
  assert.throws(() => evaluateImplementationVerification("SUSPENDED", completeEvidence()), /APPROVED_FOR_V1_DESIGN/);
});
test("one complete dataset cannot upgrade another", () => {
  const evidence = completeEvidence({ sourceId: "data-gov-11406" });
  assert.throws(() => evaluateEvidenceForSource("data-gov-94025", "APPROVED_FOR_V1_DESIGN", evidence), /sourceId mismatch/);
});
```

- [ ] **Step 5: Run gate and all source verification tests**

Run: `node --test tests/source-verification/*.test.mjs`

Expected: PASS; output lists each dataset independently, no code changes registry state, and no result contains production approval.

- [ ] **Step 6: Perform the human review gate**

For each dataset, the reviewer checks `docs/source-verification/<datasetId>-evidence.md`, Fixture metadata/hash, focused test output, selected primary resource and exact attribution text. The reviewer records `reviewer`, UTC `reviewedAt`, `decision: APPROVE_VERIFIED_FOR_IMPLEMENTATION | KEEP_APPROVED_FOR_V1_DESIGN | SUSPEND`, and a concrete reason in `review-checklist.md`.

Only `APPROVE_VERIFIED_FOR_IMPLEMENTATION` authorizes changing that dataset's line in `docs/data-source-registry.md` from `APPROVED_FOR_V1_DESIGN` to `VERIFIED_FOR_IMPLEMENTATION`. `KEEP_APPROVED_FOR_V1_DESIGN` leaves it unchanged. `SUSPEND` adds the independent pause state and reason while retaining all evidence. No outcome may write `APPROVED_FOR_PRODUCTION`.

- [ ] **Step 7: Commit Task 8**

```powershell
git add lib/source-verification/verification-gate.ts tests/source-verification/verification-gate.test.mjs docs/source-verification/review-checklist.md docs/data-source-registry.md
git commit -m "docs: record source implementation verification decisions"
```

If no dataset receives a human decision during this execution session, omit `docs/data-source-registry.md` from `git add` and keep every current stage unchanged.

---

### Task 9: 完整驗收與文件更新

**Files:**
- Create: `tools/source-verification/verify-fixtures.mts`
- Create: `tests/source-verification/verification-command.test.mjs`
- Modify: `docs/data-source-registry.md`
- Modify: `docs/testing-and-acceptance-plan.md`
- Modify: `docs/cb-data-field-mapping.md`
- Modify: `docs/emerging-company-data-mapping.md`
- Modify: `package.json`

**Single responsibilities:** command 只離線驗證所有 Fixture；設計文件記錄實際完成證據、未通過項目與個別狀態；package command 提供可重複的離線驗收入口。

**Interfaces:**
- Produces: CLI `npm run verify:source-fixtures`。
- `verifyAllFixtures(rootDirectory): Promise<{ datasets: DatasetVerificationSummary[]; passed: boolean }>`。
- `DatasetVerificationSummary`: `datasetId`, `metadataValid`, `hashValid`, `rowCountValid`, `schemaValid`, `mappingValid`, `errors`。

- [ ] **Step 1: Write a failing all-fixture command test**

```js
test("fixture verification is offline and reports every dataset", async () => {
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network forbidden in fixture verification"); };
  try {
    const report = await verifyAllFixtures(new URL("../fixtures/source-verification/", import.meta.url));
    assert.deepEqual(report.datasets.map(item => item.datasetId).sort(), ["11406", "11586", "28567", "94025"]);
    assert.equal(report.passed, true);
  } finally { globalThis.fetch = fetchBefore; }
});
```

If 28567 ended at insufficient evidence, expected dataset IDs are `11406`, `11586`, `94025`; a separate summary entry for 28567 must be `{ datasetId: "28567", status: "INSUFFICIENT_EVIDENCE", verified: false }`, not a fabricated Fixture pass.

- [ ] **Step 2: Run and verify red state**

Run: `node --test tests/source-verification/verification-command.test.mjs`

Expected: FAIL because `verify-fixtures.mts` does not exist.

- [ ] **Step 3: Implement the offline aggregate verifier and package command**

```ts
export async function verifyAllFixtures(rootDirectory: URL): Promise<VerificationReport> {
  const datasets = [];
  for (const datasetId of ["11406", "94025", "11586", "28567"] as const) {
    datasets.push(await verifyDatasetFixture(rootDirectory, datasetId));
  }
  return { datasets, passed: datasets.every(item => item.status === "INSUFFICIENT_EVIDENCE" || (item.metadataValid && item.hashValid && item.rowCountValid && item.schemaValid && item.mappingValid)) };
}
```

Add `"verify:source-fixtures": "node --experimental-strip-types tools/source-verification/verify-fixtures.mts"` to `package.json`. The command must not import `http-client.ts`, `live-smoke.mts`, `app`, `worker` or `db`; it reads only repository files.

- [ ] **Step 4: Update documents with actual evidence, not intended outcomes**

For each dataset registry entry, record: checked page/OAS/resource identifiers, Fixture paths, both hashes, source/fixture row counts, checked timestamp, schema module/test path, selected primary resource or `NOT_SELECTED`, exact attribution text, human decision and remaining risks. Update mapping documents only with formats proven by saved Fixture. Update testing plan with the exact offline and manual commands. Do not upgrade a status unless Task 8 contains the matching human decision.

- [ ] **Step 5: Run plan-specific verification in low-load mode**

Run:

```powershell
$currentProcess = Get-Process -Id $PID
$currentProcess.PriorityClass = 'BelowNormal'
$env:UV_THREADPOOL_SIZE = '2'
npm run verify:source-fixtures
node --test tests/source-verification/*.test.mjs
```

Expected: aggregate Fixture report contains no integrity/schema/mapping errors for evidence-backed datasets; all source-verification tests pass; no official HTTP request or output file outside the repository occurs.

- [ ] **Step 6: Run the complete repository acceptance suite**

Run:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: every command exits 0. `npm test` includes all `tests/*.test.mjs` only if the source verification test files are placed at that glob depth; if kept under `tests/source-verification`, update `test` to `node --test tests/*.test.mjs tests/source-verification/*.test.mjs` before this step. Neither test command invokes `smoke:sources` or accesses official hosts.

- [ ] **Step 7: Audit permanent restrictions and runtime isolation**

Run:

```powershell
rg -n "bond_cb_daily|Yahoo|Yahoo Finance|CBAS|query1\.finance|quote|closePrice|WebSocket" lib/source-verification tools/source-verification tests/source-verification tests/fixtures/source-verification
rg -n "source-verification|tests/fixtures" app worker db
git status --short
```

Expected: first search only finds explicit rejection tests or documented banned-field guards, never a resource catalog entry or mapped output; second search returns no runtime imports; status lists only Task 9 files before commit.

- [ ] **Step 8: Commit Task 9**

```powershell
git add tools/source-verification/verify-fixtures.mts tests/source-verification/verification-command.test.mjs docs/data-source-registry.md docs/testing-and-acceptance-plan.md docs/cb-data-field-mapping.md docs/emerging-company-data-mapping.md package.json
git commit -m "test: complete v1 source verification acceptance"
```

---

## Execution stop conditions

- Any dataset page, license, provider, resource or OAS relationship differs from the approved design: stop that dataset Task, record the exact mismatch, keep its current stage, and request manual review.
- Fixture contains fields unnecessary for the named tests, personal data not explicitly reviewed, or cannot be minimized without changing semantics: do not commit the Fixture.
- CSV and OpenAPI semantic fields differ: do not label them equivalent and do not select a primary resource until the mismatch is documented and manually decided.
- A default test attempts an official network request: fail the test and remove that dependency before continuing.
- A live smoke request fails: write the isolated failure report only; do not retry against another resource and do not alter published data.
- Evidence gate lacks any required check or human decision: dataset remains `APPROVED_FOR_V1_DESIGN`.
- No task in this plan may create a production Adapter, D1 migration/binding, deployment project, page implementation, Push, Merge or deployment.

## Plan self-review checklist

- [ ] All four currently design-approved datasets have independent tasks, files, interfaces, red/green commands, boundary tests and commit messages.
- [ ] 28567 has an evidence-insufficient branch that ends in a recorded gap without assuming implementation verification.
- [ ] Every unapproved or suspended source is listed with an explicit boundary.
- [ ] Every Fixture requires sourceId, datasetId, formal name, resource URL, UTC acquisition time, content type, source/Fixture hashes, source/Fixture row counts, license, provider, manual review, privacy review, sampling method and minimization decision.
- [ ] CSV/OpenAPI comparison is verification-only; each eventual formal source selects exactly one primary resource and has no fallback.
- [ ] 11406 covers contract fields, blank dates, multiple put dates, Chinese numeric units and an explicit `bond_cb_daily` rejection.
- [ ] 94025 records metadata/CSV/OAS/OpenAPI roles separately and covers negative, blank, dash, percent and unit handling.
- [ ] 11586 detects semantic key misalignment and excludes underwriting price.
- [ ] 28567 joins only to 94025 coverage by unique company code and never establishes emerging-market identity.
- [ ] HTTP and live smoke tests use injected mock fetch; default commands remain offline.
- [ ] Live smoke is one-request, manual, read-only, isolated, non-D1, non-published and no-fallback.
- [ ] The verification gate can recommend at most `VERIFIED_FOR_IMPLEMENTATION`, requires an individual human decision, and treats `SUSPENDED` as independent.
- [ ] Final acceptance runs test, lint, typecheck, build and diff check in low-load mode.
