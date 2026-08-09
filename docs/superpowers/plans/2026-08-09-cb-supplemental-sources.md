# 可轉債補充資料來源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立三大法人日交易、提前贖回及承銷公告的嚴格來源契約、解析器、擷取器與可回退補充快照，不影響既有可轉債盤後主資料。

**Architecture:** 三個來源各自擁有精確 URL／method 政策、獨立 parser 與 fixture；任何來源失敗只會讓該補充區進入 stale／unavailable，不會讓既有 CB 行情快照消失。`CbSupplementalSnapshot` 保存法人歷史、贖回事件、新債案件與各來源狀態，供下一份市場欄位計畫消費。

**Tech Stack:** TypeScript、Node.js 22 ESM、原生 `fetch`、Node `node:test`、現有 decimal／日期工具。

## Global Constraints

- CPU 密集工作最多 2 執行緒並使用低於正常優先權；本計畫測試不得提高並行度。
- 不使用 `bond_cb_daily`、Yahoo、The Few、Goodinfo、CBAS、券商未公開接口或自動 fallback。
- 僅接受下列三個精確 resource；redirect、Content-Type、schema、日期或 URL 白名單不符即拒絕該來源。
- fixture 測試預設離線；live smoke 必須是明確的唯讀命令，不能成為 `npm test` 的必要條件。
- 新增來源尚未通過 fixture、live smoke、授權與資料登錄審查前，不得標記 `APPROVED_FOR_PRODUCTION`。
- 使用者介面不會在本計畫變更；本計畫只產生可驗證資料契約與補充快照。

---

### Task 1: 三大法人日交易契約與 parser

**Files:**
- Create: `lib/source-verification/source-cb-institution.ts`
- Create: `tests/source-verification/source-cb-institution.test.mjs`
- Create: `tests/fixtures/source-verification/cb-institution/daily-minimal.json`
- Create: `tests/fixtures/source-verification/cb-institution/metadata.json`
- Modify: `docs/data-source-registry.md`

**Interfaces:**
- Consumes: TPEx `POST https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade`，form body `{ date: "YYYY/MM/DD", type: "Daily", id: "", response: "json" }`。
- Produces: `parseCbInstitutionDaily(payload: unknown): CbInstitutionDailySnapshot`。

```ts
export type CbInstitutionTrade = {
  bondCode: string;
  bondName: string;
  tradingDate: string;
  foreignBuyUnits: string;
  foreignSellUnits: string;
  foreignNetUnits: string;
  trustBuyUnits: string;
  trustSellUnits: string;
  trustNetUnits: string;
  dealerBuyUnits: string;
  dealerSellUnits: string;
  dealerNetUnits: string;
  totalNetUnits: string;
};

export type CbInstitutionDailySnapshot = {
  tradingDate: string;
  tradingUnitFaceValueTwd: "100000";
  records: readonly CbInstitutionTrade[];
};
```

- [ ] **Step 1: Write the exact minimal fixture**

以 2026-08-07 live 回應最小化為兩列，保留原 root/table 結構與 12 個欄位：

```json
{
  "date": "20260807",
  "tables": [{
    "title": "115年08月07日 三大法人日交易資訊（含普通股、議價、鉅額）依股票代碼排序 ( 轉(交)換及附認股權公司債以面額新台幣十萬元為一成交單位)",
    "type": "Daily",
    "date": "115/08/07",
    "fields": ["代號","名稱","買張數","賣張數","淨買張數","買張數","賣張數","淨買張數","買張數","賣張數","淨買張數","三大法人買賣超張數"],
    "data": [
      ["61876","萬潤六","0","0","0","0","0","0","422","249","173","173"],
      ["54642","霖宏二","65","0","65","0","0","0","4","0","4","69"]
    ],
    "totalCount": 2,
    "notes": []
  }],
  "stat": "ok"
}
```

`metadata.json` 必須保存 resource URL、method、form keys、取得日、HTTP 200、`application/json;charset=UTF-8`、live row count 157 及完整原始回應的 SHA-256；不可把完整 live 回應提交到 production bundle。

- [ ] **Step 2: Write failing parser tests**

```js
test("parses the positional institutional columns and face-value unit", () => {
  const result = parseCbInstitutionDaily(fixture);
  assert.equal(result.tradingDate, "2026-08-07");
  assert.equal(result.tradingUnitFaceValueTwd, "100000");
  assert.deepEqual(result.records[1], {
    bondCode: "54642", bondName: "霖宏二", tradingDate: "2026-08-07",
    foreignBuyUnits: "65", foreignSellUnits: "0", foreignNetUnits: "65",
    trustBuyUnits: "0", trustSellUnits: "0", trustNetUnits: "0",
    dealerBuyUnits: "4", dealerSellUnits: "0", dealerNetUnits: "4",
    totalNetUnits: "69",
  });
});

test("rejects schema drift, date mismatch, duplicate codes and arithmetic mismatch", () => {
  assert.throws(() => parseCbInstitutionDaily(withUnknownRootKey(fixture)), /unknown root field/);
  assert.throws(() => parseCbInstitutionDaily(withTableDate(fixture, "115\/08\/06")), /date mismatch/);
  assert.throws(() => parseCbInstitutionDaily(withDuplicateFirstRow(fixture)), /duplicate bond code/);
  assert.throws(() => parseCbInstitutionDaily(withTotalNet(fixture, "70")), /total net units/);
});
```

- [ ] **Step 3: Run the tests to verify RED**

Run: `node --test tests/source-verification/source-cb-institution.test.mjs`

Expected: FAIL because `source-cb-institution.ts` does not exist.

- [ ] **Step 4: Implement the strict parser**

Implement exact root keys `date,tables,stat`; exact table keys `title,type,date,fields,data,totalCount,notes`; exact field order; one table only; signed integer cells; unique 5–6 digit bond code; ROC/Gregorian date equality. Verify for every row:

```ts
foreignNetUnits === foreignBuyUnits - foreignSellUnits;
trustNetUnits === trustBuyUnits - trustSellUnits;
dealerNetUnits === dealerBuyUnits - dealerSellUnits;
totalNetUnits === foreignNetUnits + trustNetUnits + dealerNetUnits;
```

The title must contain `以面額新台幣十萬元為一成交單位`; otherwise reject the payload instead of emitting face value.

- [ ] **Step 5: Run focused tests and update the source registry**

Run: `node --test tests/source-verification/source-cb-institution.test.mjs`

Expected: PASS.

Append a dated amendment to `docs/data-source-registry.md` with exact POST URL, form keys, verified columns, per-trading-day frequency, no-key observation, parser boundaries, attribution, and resource status `VERIFIED_FOR_IMPLEMENTATION`. Explicitly state this is not the suspended `bond_cb_daily` resource.

- [ ] **Step 6: Commit**

```bash
git add lib/source-verification/source-cb-institution.ts tests/source-verification/source-cb-institution.test.mjs tests/fixtures/source-verification/cb-institution docs/data-source-registry.md
git commit -m "feat: verify CB institutional trading source"
```

### Task 2: 提前贖回公告契約與 parser

**Files:**
- Create: `lib/source-verification/source-cb-redemption.ts`
- Create: `tests/source-verification/source-cb-redemption.test.mjs`
- Create: `tests/fixtures/source-verification/cb-redemption/year-minimal.json`
- Create: `tests/fixtures/source-verification/cb-redemption/metadata.json`
- Modify: `docs/data-source-registry.md`

**Interfaces:**
- Consumes: TPEx `POST https://www.tpex.org.tw/www/zh-tw/bond/redeem`，form body `{ date: "YYYY", id: "", response: "json" }`。
- Produces: `parseCbRedemptionAnnouncements(payload: unknown): readonly CbRedemptionEvent[]`。

```ts
export type CbRedemptionEvent = {
  issuerCode: string;
  issuerName: string;
  bondCode: string;
  bondName: string;
  announcementDate: string;
  delistingDate: string;
  subject: string;
  detailUrl: string;
};
```

- [ ] **Step 1: Add the exact minimal fixture and metadata**

Use two 2026 records with exact fields `公司代號|公司名稱|申報日期|主旨|內容`, including 弘塑二 `31312`, announcement `115/08/04`, delisting `115/09/21`, and the HTTPS MOPS detail URL. Metadata records root keys `tables,date,stat`, table keys `title,data,fields,totalCount`, live row count 34, Content-Type and SHA-256.

- [ ] **Step 2: Write failing tests**

```js
test("extracts exact CB code, name and delisting date", () => {
  assert.deepEqual(parseCbRedemptionAnnouncements(fixture)[0], {
    issuerCode: "3131", issuerName: "弘塑", bondCode: "31312", bondName: "弘塑二",
    announcementDate: "2026-08-04", delistingDate: "2026-09-21",
    subject: fixture.tables[0].data[0][3],
    detailUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3131&date1=20260804&seq_no=2&pub_class=0&firstin=1",
  });
});

test("rejects issuer, date, URL and subject conflicts", () => {
  assert.throws(() => parseCbRedemptionAnnouncements(withIssuerConflict(fixture)), /issuer/);
  assert.throws(() => parseCbRedemptionAnnouncements(withHttpUrl(fixture)), /detail URL/);
  assert.throws(() => parseCbRedemptionAnnouncements(withMissingDelistingDate(fixture)), /delisting date/);
});
```

- [ ] **Step 3: Run RED**

Run: `node --test tests/source-verification/source-cb-redemption.test.mjs`

Expected: FAIL because the parser is missing.

- [ ] **Step 4: Implement the parser**

Accept only exact fields and a single table. Extract the bond with:

```ts
const subjectPattern = /簡稱[：:]\s*([^，,)]+)[，,]\s*代碼[：:]\s*(\d{5,6})\).*?訂於(\d{3})年(\d{2})月(\d{2})日終止櫃檯買賣/;
```

Require the detail URL to be HTTPS, host `mopsov.twse.com.tw`, path `/mops/web/ajax_t120sb23`, `co_id === issuerCode`, `date1 === announcementDate without hyphens`, and no credentials. Reject duplicate `bondCode + announcementDate`.

- [ ] **Step 5: Run GREEN and document source status**

Run: `node --test tests/source-verification/source-cb-redemption.test.mjs`

Expected: PASS.

Append exact resource, fields, annual query parameter, alert-only usage and failure policy to `docs/data-source-registry.md`, status `VERIFIED_FOR_IMPLEMENTATION`.

- [ ] **Step 6: Commit**

```bash
git add lib/source-verification/source-cb-redemption.ts tests/source-verification/source-cb-redemption.test.mjs tests/fixtures/source-verification/cb-redemption docs/data-source-registry.md
git commit -m "feat: verify CB redemption announcements"
```

### Task 3: 證券商公會承銷公告契約與 parser

**Files:**
- Create: `lib/source-verification/source-cb-underwriting.ts`
- Create: `tests/source-verification/source-cb-underwriting.test.mjs`
- Create: `tests/fixtures/source-verification/cb-underwriting/current-year-minimal.html`
- Create: `tests/fixtures/source-verification/cb-underwriting/metadata.json`
- Modify: `docs/data-source-registry.md`

**Interfaces:**
- Consumes: `GET https://web.twsa.org.tw/edoc2/default.aspx`，`text/html; charset=utf-8`，result table `#ctl00_cphMain_gvResult`。
- Produces: `parseCbUnderwritingHtml(html: string): CbUnderwritingSnapshot`。

```ts
export type CbUnderwritingCase = {
  referenceNumber: string;
  filedDate: string;
  leadUnderwriter: string;
  issuerName: string;
  guaranteeType: "secured" | "unsecured";
  placementMethods: readonly string[];
  caseStatus: string;
};

export type CbUnderwritingSnapshot = {
  rocYear: number;
  notice: "本公告系統僅供參考，相關資料以正式刊登報紙之公告內容為準。";
  records: readonly CbUnderwritingCase[];
};
```

- [ ] **Step 1: Create a minimal structural fixture**

Keep the exact notice, page title, table id, 11 headers and three rows: one normal stock row, one `無擔保轉換公司債`, one `有擔保轉換公司債`. Do not retain personal data because none is required. Metadata records HTTP 200, UTF-8 HTML, live response size 357295 bytes, acquisition time and full response SHA-256.

- [ ] **Step 2: Write failing tests**

```js
test("filters only domestic convertible-bond underwriting cases", () => {
  const result = parseCbUnderwritingHtml(fixtureHtml);
  assert.equal(result.rocYear, 115);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map(x => x.guaranteeType), ["unsecured", "secured"]);
});

test("fails closed on notice, table id, header or row-width drift", () => {
  assert.throws(() => parseCbUnderwritingHtml(fixtureHtml.replace("本公告系統僅供參考", "")), /notice/);
  assert.throws(() => parseCbUnderwritingHtml(fixtureHtml.replace("ctl00_cphMain_gvResult", "changed")), /result table/);
  assert.throws(() => parseCbUnderwritingHtml(fixtureHtml.replace("主辦承銷商", "承銷券商")), /headers/);
});
```

- [ ] **Step 3: Run RED**

Run: `node --test tests/source-verification/source-cb-underwriting.test.mjs`

Expected: FAIL because the parser is missing.

- [ ] **Step 4: Implement strict table parsing**

Locate the single table by exact id, strip scripts/styles, decode the five named HTML entities used by the fixture, and require exact headers:

```ts
const HEADERS = [
  "序號","申報日期","主辦承銷商","案件名稱","方式","發行性質",
  "發行種類","配售方式一","配售方式二","案件狀態","公告檔",
] as const;
```

Only accept `發行性質 === "公司債"` and `發行種類 === "有擔保轉換公司債" | "無擔保轉換公司債"`. Preserve the notice and do not infer CB code, issue amount, conversion price or listing date.

- [ ] **Step 5: Run GREEN and document secondary-source status**

Run: `node --test tests/source-verification/source-cb-underwriting.test.mjs`

Expected: PASS.

Add registry entry as `VERIFIED_FOR_IMPLEMENTATION` for radar-only enrichment. Document that this page is secondary and cannot become contract truth without later TPEx／MOPS exact-code confirmation.

- [ ] **Step 6: Commit**

```bash
git add lib/source-verification/source-cb-underwriting.ts tests/source-verification/source-cb-underwriting.test.mjs tests/fixtures/source-verification/cb-underwriting docs/data-source-registry.md
git commit -m "feat: verify CB underwriting announcements"
```

### Task 4: 補充來源 fetch 與可回退快照

**Files:**
- Create: `lib/market-data/bond-supplemental.ts`
- Modify: `scripts/lib/official-market-fetch.mjs`
- Create: `tests/bond-supplemental-snapshot.test.mjs`
- Modify: `tests/official-market-fetch.test.mjs`

**Interfaces:**
- Consumes: Task 1–3 parsers and exact resources。
- Produces:

```ts
export type SupplementalSourceState = "fresh" | "stale" | "unavailable";
export type CbSupplementalSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  unitFaceValueTwd: "100000" | null;
  institutionHistory: Readonly<Record<string, readonly CbInstitutionTrade[]>>;
  redemptions: readonly CbRedemptionEvent[];
  underwritingCases: readonly CbUnderwritingCase[];
  sources: {
    institution: { state: SupplementalSourceState; dataDate: string | null };
    redemption: { state: SupplementalSourceState; dataDate: string | null };
    underwriting: { state: SupplementalSourceState; dataDate: string | null };
  };
};

export function buildCbSupplementalSnapshot(input: {
  generatedAt: string;
  institution?: CbInstitutionDailySnapshot;
  redemptions?: readonly CbRedemptionEvent[];
  underwriting?: CbUnderwritingSnapshot;
  previous?: CbSupplementalSnapshot;
}): CbSupplementalSnapshot;
```

- [ ] **Step 1: Write failing fetch tests**

Mock the three exact requests and assert methods, bodies, accepted Content-Type, parser invocation and per-source settlement. A 503 from underwriting must yield `{ state: "unavailable" }` without discarding successful institution/redemption records.

```js
const result = await fetchCbSupplementalSources({
  date: "2026-08-07", fetchImpl,
});
assert.equal(result.institution.status, "fulfilled");
assert.equal(result.redemption.status, "fulfilled");
assert.equal(result.underwriting.status, "rejected");
```

- [ ] **Step 2: Run fetch test RED**

Run: `node --test tests/official-market-fetch.test.mjs --test-name-pattern="supplemental"`

Expected: FAIL because `fetchCbSupplementalSources` is not exported.

- [ ] **Step 3: Implement bounded, independent fetches**

Add `fetchCbSupplementalSources({ date, fetchImpl = fetch })`. Institution POST uses Gregorian `YYYY/MM/DD`; redemption POST uses `YYYY`; underwriting uses GET. Reuse the existing retry policy, but add a 1,000,000-byte cap for HTML and 500,000-byte cap for each JSON response. Use `Promise.allSettled` and return named results; never silently call another URL.

- [ ] **Step 4: Write snapshot RED tests**

```js
test("merges one institution day, keeps 60 trading days and de-duplicates by date", () => {
  const next = buildCbSupplementalSnapshot({ generatedAt, institution, previous });
  assert.equal(next.institutionHistory["54642"].at(-1).tradingDate, "2026-08-07");
  assert.ok(next.institutionHistory["54642"].length <= 60);
});

test("reuses the previous verified section when one current source fails", () => {
  const next = buildCbSupplementalSnapshot({ generatedAt, institution, previous });
  assert.equal(next.sources.redemption.state, "stale");
  assert.deepEqual(next.redemptions, previous.redemptions);
});
```

- [ ] **Step 5: Implement immutable snapshot merge**

Fresh data replaces that source’s current section; missing current data copies only the corresponding validated previous section and marks it `stale`; no current or previous data emits an empty section marked `unavailable`. Institution history is sorted ascending, rejects conflicting duplicate dates, and retains the newest 60 trading days per exact bond code.

- [ ] **Step 6: Run focused GREEN**

Run: `node --test tests/source-verification/source-cb-institution.test.mjs tests/source-verification/source-cb-redemption.test.mjs tests/source-verification/source-cb-underwriting.test.mjs tests/official-market-fetch.test.mjs tests/bond-supplemental-snapshot.test.mjs`

Expected: PASS.

- [ ] **Step 7: Run full gates**

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm test`

Expected: all commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add lib/market-data/bond-supplemental.ts scripts/lib/official-market-fetch.mjs tests/official-market-fetch.test.mjs tests/bond-supplemental-snapshot.test.mjs
git commit -m "feat: collect CB supplemental snapshots"
```
