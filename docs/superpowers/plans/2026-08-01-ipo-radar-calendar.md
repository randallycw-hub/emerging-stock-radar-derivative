# IPO 進度雷達與 IPO 時程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以第一方正式資料建立共用 IPO 事件快照，發布「IPO 進度雷達」與「IPO 時程」兩個分頁，並移除興櫃頁的當日成交均價公開欄位。

**Architecture:** 新增邊緣相容的官方來源解析器與 IPO 事件聚合器，將上市／上櫃申請、上櫃 IPO 證據、競價拍賣及公開申購合併為單一 `IpoEventSnapshot`。API 在台灣時間 22:30 後刷新並以 D1 原子切換最新成功版本；靜態市場頁只讀同源 API，雷達與時程兩頁共用載入及排序邏輯。GitHub Actions 只負責每天 22:30 喚醒正式 API，不再執行已停用的 GitHub Pages 部署。

**Tech Stack:** TypeScript、Node.js 22 test runner、Cloudflare Workers 相容 Fetch/Web Crypto、D1/SQLite、原生 ES modules、靜態 HTML/CSS、Sites/vinext。

## Global Constraints

- 正式資料只採用臺灣證券交易所、證券櫃檯買賣中心及公開資訊觀測站第一方來源；第三方網站只作版面參考。
- 五類必要來源為上市申請、上櫃申請、興櫃／上櫃 IPO、競價拍賣及公開申購；任一來源失敗不得發布混合版本。
- 每天台灣時間 22:30 更新；失敗時繼續提供上一個完整成功版本。
- 日期一律以 `Asia/Taipei` 解讀；距今天數以日曆日計算。
- 尚未公布的欄位顯示「—」，不得顯示 0、推算日期或第三方補值。
- 「當日成交均價（盤後）」不得出現在公開頁面；「最後成交價（盤後）」不得稱為收盤價或即時價。
- IPO 兩頁不顯示成交價、漲跌額、漲跌幅、週漲跌幅或波動價差。
- 不顯示資料方法、擷取版本、官方快照或內部管線狀態，只顯示資料日期。
- 深色、淺色、桌面、手機、鍵盤及觸控操作都必須可用。
- CPU 密集工作最多使用 2 個執行緒；CI 設定 `UV_THREADPOOL_SIZE=2`。

---

### Task 1: 移除興櫃公開頁的當日成交均價

**Files:**
- Modify: `tests/static-showcase-emerging-ui.test.mjs`
- Modify: `static-showcase/emerging.html`
- Modify: `static-showcase/assets/emerging-page.js`

**Interfaces:**
- Consumes: 既有 `EmergingMarketView.dailyAveragePrice`，僅供資料層既有計算使用。
- Produces: 不含均價欄位、均價排序選項及行動卡片均價內容的公開頁；表格欄數為 10。

- [ ] **Step 1: 將既有 UI 測試改為要求均價不可見**

```js
assert.doesNotMatch(html, /當日成交均價（盤後）/);
assert.doesNotMatch(html, /data-market-sort="dailyAveragePrice"/);
assert.doesNotMatch(js, /<dt>當日成交均價（盤後）<\/dt>/);
assert.match(js, /emptyRow\(10/);
assert.match(html, /最後成交價（盤後）/);
```

- [ ] **Step 2: 執行測試並確認因均價仍存在而失敗**

Run: `node --test tests/static-showcase-emerging-ui.test.mjs`

Expected: FAIL，指出 `當日成交均價（盤後）` 或 `dailyAveragePrice` 排序表頭仍存在。

- [ ] **Step 3: 移除桌面欄位、行動卡片內容及排序選項**

```js
document.querySelector("#emerging-table-body").innerHTML = visible.length
  ? visible.map(marketRowHtml).join("")
  : emptyRow(10);
```

頁首說明改為「以最後成交價（盤後）整理市場變化、成交概況與公司月營收。」；資料 view 與估算成交金額公式不在本任務修改。

- [ ] **Step 4: 執行興櫃與共用頁面測試**

Run: `node --test tests/static-showcase-emerging-ui.test.mjs tests/static-showcase-pages.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交公開欄位修訂**

```bash
git add static-showcase/emerging.html static-showcase/assets/emerging-page.js tests/static-showcase-emerging-ui.test.mjs
git commit -m "fix: remove emerging average price display"
```

### Task 2: 建立五類第一方來源解析器

**Files:**
- Create: `lib/source-verification/source-ipo-events.ts`
- Create: `tests/source-verification/source-ipo-events.test.mjs`
- Create: `tests/fixtures/source-verification/ipo/tpex-applicants.json`
- Create: `tests/fixtures/source-verification/ipo/tpex-ipo-no-limit.json`
- Create: `tests/fixtures/source-verification/ipo/twse-auction.json`
- Create: `tests/fixtures/source-verification/ipo/twse-public-form.json`
- Reuse: `lib/source-verification/source-11586.ts`
- Reuse: `lib/source-verification/csv.ts`

**Interfaces:**
- Consumes: TWSE 11586 CSV、TPEx OpenAPI JSON、TWSE `response=json` 表格。
- Produces:
  - `parseTpexApplicantSource(payload: unknown): IpoApplicationSourceRow[]`
  - `parseTpexIpoListingSource(payload: unknown): IpoListingEvidenceRow[]`
  - `parseTwseAuctionSource(payload: unknown): IpoAuctionSourceRow[]`
  - `parseTwsePublicOfferingSource(payload: unknown): IpoPublicOfferingSourceRow[]`

- [ ] **Step 1: 建立最小正式形狀 fixtures**

```json
[
  {
    "SecuritiesCompanyCode": "7819",
    "CompanyName": "精誠金融",
    "Date": "20260401",
    "TPExListingScreeningCommitteeDate": "20260430",
    "TPExSanctionedDate": "20260507",
    "TPExApprovedTradingDate": "20260510",
    "ListingDate": "20260527",
    "LeadUnderwriter": "元大",
    "Note": ""
  }
]
```

TWSE fixtures 使用 `{ fields: string[], data: unknown[][] }`，競拍列保留「發行性質＝初上櫃」、投標起訖、開標、最低投標價、得標價格、實際承銷價、撥券日與取消欄；公開申購列保留暫定／實際承銷價、申購起訖、抽籤日、撥券日與取消欄。

- [ ] **Step 2: 寫入來源解析失敗測試**

```js
assert.deepEqual(parseTpexApplicantSource(applicants)[0], {
  companyCode: "7819",
  companyName: "精誠金融",
  market: "上櫃",
  applicationDate: "2026-04-01",
  reviewDate: "2026-04-30",
  boardDate: "2026-05-07",
  contractDate: "2026-05-10",
  listingDate: "2026-05-27",
  underwriter: "元大",
  note: "",
  sourceRecordId: "TPEx:7819:2026-04-01",
});
assert.equal(parseTwseAuctionSource(auction)[0].minimumBidPrice, "42.8");
assert.equal(parseTwsePublicOfferingSource(publicForm)[0].finalUnderwritingPrice, "43.91");
```

- [ ] **Step 3: 執行來源測試並確認模組尚不存在**

Run: `node --test tests/source-verification/source-ipo-events.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 4: 實作嚴格欄位、日期與價格解析**

```ts
export interface IpoApplicationSourceRow {
  companyCode: string;
  companyName: string;
  market: "上市" | "創新板" | "上櫃";
  applicationDate: string;
  reviewDate: string | null;
  boardDate: string | null;
  contractDate: string | null;
  listingDate: string | null;
  underwriter: string;
  note: string;
  sourceRecordId: string;
}

export interface IpoListingEvidenceRow {
  companyCode: string;
  companyName: string;
  market: "上櫃";
  listingDate: string;
  finalUnderwritingPrice: string | null;
  underwriter: string;
  sourceRecordId: string;
}

export interface IpoAuctionSourceRow {
  companyCode: string;
  companyName: string;
  market: "上市" | "創新板" | "上櫃";
  bidStartDate: string;
  bidEndDate: string;
  auctionOpenDate: string;
  listingDate: string | null;
  minimumBidPrice: string | null;
  finalUnderwritingPrice: string | null;
  underwriter: string;
  cancelled: boolean;
  sourceRecordId: string;
}

export interface IpoPublicOfferingSourceRow {
  companyCode: string;
  companyName: string;
  market: "上市" | "創新板" | "上櫃";
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  drawDate: string;
  listingDate: string | null;
  provisionalUnderwritingPrice: string | null;
  finalUnderwritingPrice: string | null;
  underwriter: string;
  cancelled: boolean;
  sourceRecordId: string;
}

const initialListingType = /初上市|初上櫃|創新板初上市|創新板轉列上櫃/;
```

日期只接受 `YYYYMMDD`、`YYYY/MM/DD` 或民國 `YYY/MM/DD`；價格只接受非負十進位字串。不是初次上市／上櫃的現增、公司債、公債與取消列不得進入一般 IPO 事件，但取消初次承銷列要保留 `cancelled: true`。

- [ ] **Step 5: 驗證非法日期、非 IPO 列與科學記號被拒絕**

```js
assert.throws(() => parseTwseAuctionSource(invalidDate), /auctionDate/);
assert.equal(parseTwseAuctionSource(convertibleBondOnly).length, 0);
assert.throws(() => parseTwsePublicOfferingSource(scientificPrice), /underwritingPrice/);
```

- [ ] **Step 6: 執行來源測試並確認通過**

Run: `node --test tests/source-verification/source-ipo-events.test.mjs tests/source-verification/source-11586.test.mjs`

Expected: PASS。

- [ ] **Step 7: 提交來源解析器與 fixtures**

```bash
git add lib/source-verification/source-ipo-events.ts tests/source-verification/source-ipo-events.test.mjs tests/fixtures/source-verification/ipo
git commit -m "feat: parse official IPO event sources"
```

### Task 3: 聚合共用 IPO 事件快照

**Files:**
- Create: `lib/ipo-events/snapshot.ts`
- Create: `tests/ipo-events-snapshot.test.mjs`

**Interfaces:**
- Consumes: Task 2 四類標準化來源列與既有 11586 上市申請列。
- Produces:
  - `buildIpoEventSnapshot(input: BuildIpoEventSnapshotInput): IpoEventSnapshot`
  - `deriveIpoStage(record: IpoTimelineRecord, today: string): IpoStage`
  - `taipeiCalendarDistance(today: string, eventDate: string): number`

- [ ] **Step 1: 寫入事件合併、階段與去重失敗測試**

```js
const snapshot = buildIpoEventSnapshot({
  twseApplications: [twseApplication],
  tpexApplications: [tpexApplication],
  tpexListings: [tpexListing],
  auctions: [auction],
  publicOfferings: [publicOffering],
  generatedAt: "2026-08-01T22:30:00+08:00",
  dataDate: "2026-08-01",
  sourceManifest,
});
assert.equal(snapshot.schemaVersion, 1);
assert.equal(snapshot.records.find((row) => row.companyCode === "7819").stage, "D");
assert.equal(snapshot.records.find((row) => row.companyCode === "7819").events.filter((event) => event.kind === "listing_date").length, 1);
assert.equal(taipeiCalendarDistance("2026-08-01", "2026-08-05"), 4);
```

- [ ] **Step 2: 執行測試並確認模組尚不存在**

Run: `node --test tests/ipo-events-snapshot.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 定義快照、公司歷程與事件型別**

```ts
export type IpoStage = "A" | "B" | "C" | "D" | "listed" | "withdrawn" | "delayed" | "cancelled";
export type IpoEventKind =
  | "application_submitted" | "review_completed" | "board_approved"
  | "contract_approved" | "auction_bid_start" | "auction_bid_end"
  | "auction_open" | "public_subscription_start" | "public_subscription_end"
  | "public_draw" | "listing_date" | "withdrawn" | "delayed" | "cancelled";

export interface IpoEventSnapshot {
  schemaVersion: 1;
  dataDate: string;
  generatedAt: string;
  sourceManifest: IpoSourceManifestEntry[];
  records: IpoTimelineRecord[];
}

export interface IpoSourceManifestEntry {
  sourceId: "twse-applications" | "tpex-applications" | "tpex-ipo-listings" | "twse-auctions" | "twse-public-offerings";
  sourceUrl: string;
  downloadedAt: string;
  sha256: `sha256:${string}`;
  rawBytes: number;
  rowCount: number;
}

export interface IpoEvent {
  companyCode: string;
  market: "上市" | "創新板" | "上櫃";
  kind: IpoEventKind;
  date: string;
  label: string;
  sourceRecordIds: string[];
}

export interface IpoTimelineRecord {
  companyCode: string;
  companyName: string;
  market: "上市" | "創新板" | "上櫃";
  stage: IpoStage;
  exceptionStatus: "withdrawn" | "delayed" | "cancelled" | null;
  applicationDate: string;
  reviewDate: string | null;
  boardDate: string | null;
  contractDate: string | null;
  listingDate: string | null;
  auction: IpoAuctionSourceRow | null;
  publicOffering: IpoPublicOfferingSourceRow | null;
  provisionalUnderwritingPrice: string | null;
  finalUnderwritingPrice: string | null;
  underwriter: string;
  events: IpoEvent[];
}

export interface BuildIpoEventSnapshotInput {
  twseApplications: IpoApplicationSourceRow[];
  tpexApplications: IpoApplicationSourceRow[];
  tpexListings: IpoListingEvidenceRow[];
  auctions: IpoAuctionSourceRow[];
  publicOfferings: IpoPublicOfferingSourceRow[];
  generatedAt: string;
  dataDate: string;
  sourceManifest: IpoSourceManifestEntry[];
}
```

- [ ] **Step 4: 實作公司合併、事件唯一鍵與例外狀態**

```ts
const eventKey = (event: IpoEvent) =>
  `${event.companyCode}\u0000${event.market}\u0000${event.kind}\u0000${event.date}`;

export function deriveIpoStage(record: IpoTimelineRecord, today: string): IpoStage {
  if (record.exceptionStatus) return record.exceptionStatus;
  if (record.listingDate && record.listingDate <= today) return "listed";
  if (record.auction || record.publicOffering || record.listingDate) return "D";
  if (record.contractDate) return "C";
  if (record.boardDate || record.reviewDate) return "B";
  return "A";
}
```

公司以「公司代碼＋市場」合併；不得以名稱模糊配對。相同事件以「公司代碼＋市場＋事件類型＋日期」去重。相同第一方欄位衝突時拋出 `IPO_SOURCE_CONFLICT:<field>`，不自行選較新值。

- [ ] **Step 5: 補入衝突、撤件、取消與缺值測試**

```js
assert.throws(() => buildIpoEventSnapshot(conflictingListingDates), /IPO_SOURCE_CONFLICT:listingDate/);
assert.equal(buildIpoEventSnapshot(withdrawnInput).records[0].stage, "withdrawn");
assert.equal(buildIpoEventSnapshot(cancelledAuctionInput).records[0].stage, "cancelled");
assert.equal(buildIpoEventSnapshot(missingPriceInput).records[0].finalUnderwritingPrice, null);
```

- [ ] **Step 6: 執行快照測試並確認通過**

Run: `node --test tests/ipo-events-snapshot.test.mjs`

Expected: PASS。

- [ ] **Step 7: 提交事件聚合器**

```bash
git add lib/ipo-events/snapshot.ts tests/ipo-events-snapshot.test.mjs
git commit -m "feat: build verified IPO event snapshot"
```

### Task 4: 建立 D1 原子快照儲存

**Files:**
- Create: `migrations/0005_ipo_event_snapshots.sql`
- Create: `lib/ipo-events/repository.ts`
- Create: `tests/ipo-events-repository.test.mjs`
- Modify: `tests/pipeline/d1-schema-contract.test.mjs`

**Interfaces:**
- Consumes: `D1Database` 與 `IpoEventSnapshot`。
- Produces: `createIpoSnapshotRepository(db: D1Database): IpoSnapshotRepository`，含 `readCurrent()`、`publish()`。

- [ ] **Step 1: 寫入 migration 與 repository 失敗測試**

```js
assert.match(migration, /CREATE TABLE ipo_event_snapshots/);
assert.match(migration, /CREATE TABLE ipo_event_snapshot_pointer/);
assert.match(migration, /FOREIGN KEY.*ipo_event_snapshots/is);
assert.deepEqual(await repository.readCurrent(), oldSnapshot);
await repository.publish(newSnapshot);
assert.deepEqual(await repository.readCurrent(), newSnapshot);
```

- [ ] **Step 2: 執行測試並確認 schema 與 repository 尚不存在**

Run: `node --test tests/pipeline/d1-schema-contract.test.mjs tests/ipo-events-repository.test.mjs`

Expected: FAIL。

- [ ] **Step 3: 建立加法式 migration**

```sql
CREATE TABLE ipo_event_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  data_date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_manifest_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE ipo_event_snapshot_pointer (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  snapshot_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES ipo_event_snapshots(snapshot_id)
);
CREATE INDEX idx_ipo_event_snapshots_data_date
  ON ipo_event_snapshots(data_date, generated_at);
```

- [ ] **Step 4: 實作原子發布與嚴格讀取**

```ts
export interface IpoSnapshotRepository {
  readCurrent(): Promise<IpoEventSnapshot | null>;
  publish(snapshot: IpoEventSnapshot): Promise<void>;
}

const snapshotId = `ipo:${snapshot.dataDate}:${await sha256Json(snapshot)}`;

async function sha256Json(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

await db.batch([
  db.prepare("INSERT INTO ipo_event_snapshots (snapshot_id,data_date,generated_at,payload_json,source_manifest_json,created_at) VALUES (?,?,?,?,?,?)")
    .bind(snapshotId, snapshot.dataDate, snapshot.generatedAt, JSON.stringify(snapshot), JSON.stringify(snapshot.sourceManifest), snapshot.generatedAt),
  db.prepare("INSERT INTO ipo_event_snapshot_pointer (singleton,snapshot_id,published_at) VALUES (1,?,?) ON CONFLICT(singleton) DO UPDATE SET snapshot_id=excluded.snapshot_id,published_at=excluded.published_at")
    .bind(snapshotId, snapshot.generatedAt),
]);
```

兩個 batch 結果都必須 `success === true`，否則拋出 `IPO_SNAPSHOT_PUBLISH_FAILED`；讀取時重新驗證 `schemaVersion`、`dataDate` 與 records 陣列。

- [ ] **Step 5: 驗證候選寫入失敗不切換 pointer**

```js
database.failBatchAt = 1;
await assert.rejects(repository.publish(newSnapshot), /IPO_SNAPSHOT_PUBLISH_FAILED/);
assert.deepEqual(await repository.readCurrent(), oldSnapshot);
```

- [ ] **Step 6: 執行 repository 測試並確認通過**

Run: `node --test tests/pipeline/d1-schema-contract.test.mjs tests/ipo-events-repository.test.mjs`

Expected: PASS。

- [ ] **Step 7: 提交 D1 快照儲存**

```bash
git add migrations/0005_ipo_event_snapshots.sql lib/ipo-events/repository.ts tests/ipo-events-repository.test.mjs tests/pipeline/d1-schema-contract.test.mjs
git commit -m "feat: persist atomic IPO snapshots"
```

### Task 5: 實作 22:30 刷新服務與同源 API

**Files:**
- Create: `lib/ipo-events/refresh.ts`
- Create: `app/api/ipo-events/route.ts`
- Create: `tests/ipo-events-refresh.test.mjs`
- Create: `tests/ipo-events-api.test.mjs`

**Interfaces:**
- Consumes: Task 2 解析器、Task 3 聚合器、Task 4 repository、`env.PIPELINE_DB`。
- Produces:
  - `refreshOfficialIpoSnapshot({ fetchImpl, now }): Promise<IpoEventSnapshot>`
  - `shouldRefreshIpoSnapshot({ now, current }): boolean`
  - `GET /api/ipo-events`

- [ ] **Step 1: 寫入刷新截止時間與失敗保留測試**

```js
assert.equal(shouldRefreshIpoSnapshot({ now: new Date("2026-08-01T14:29:59Z"), current }), false);
assert.equal(shouldRefreshIpoSnapshot({ now: new Date("2026-08-01T14:30:00Z"), current: previousDay }), true);
assert.equal(shouldRefreshIpoSnapshot({ now: new Date("2026-08-01T14:30:00Z"), current: sameDay }), false);
```

- [ ] **Step 2: 寫入五來源完整性與 hash 測試**

```js
assert.deepEqual(requestedUrls, [
  "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
  "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies",
  "https://www.tpex.org.tw/openapi/v1/tpex_ipo_no_limit",
  "https://www.twse.com.tw/announcement/auction?response=json&yy=2026",
  "https://www.twse.com.tw/announcement/publicForm?response=json&yy=2026",
]);
assert.equal(snapshot.sourceManifest.length, 5);
assert.match(snapshot.sourceManifest[0].sha256, /^sha256:[a-f0-9]{64}$/);
await assert.rejects(() => refreshOfficialIpoSnapshot({ fetchImpl: oneSourceFails, now }), /IPO_REQUIRED_SOURCE_FAILED/);
```

- [ ] **Step 3: 執行 refresh/API 測試並確認模組尚不存在**

Run: `node --test tests/ipo-events-refresh.test.mjs tests/ipo-events-api.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 4: 實作邊緣相容的五來源下載與 manifest**

```ts
const sourceUrls = (year: number) => ({
  twseApplications: "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
  tpexApplications: "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies",
  tpexIpoListings: "https://www.tpex.org.tw/openapi/v1/tpex_ipo_no_limit",
  twseAuctions: `https://www.twse.com.tw/announcement/auction?response=json&yy=${year}`,
  twsePublicOfferings: `https://www.twse.com.tw/announcement/publicForm?response=json&yy=${year}`,
});

const digest = await crypto.subtle.digest("SHA-256", bytes);
```

每個來源限制 8 MB、20 秒逾時、最多 3 次退避重試；HTTP 非 2xx、空回應、JSON/CSV 解析錯誤、0 筆必要來源或 schema 驗證失敗都拋出 `IPO_REQUIRED_SOURCE_FAILED:<sourceId>`。

- [ ] **Step 5: 實作 API 的刷新、回退與快取標頭**

```ts
export async function GET() {
  const repository = createIpoSnapshotRepository(env.PIPELINE_DB);
  const current = await repository.readCurrent();
  if (shouldRefreshIpoSnapshot({ now: new Date(), current })) {
    try {
      const next = await refreshOfficialIpoSnapshot({ fetchImpl: fetch, now: new Date() });
      await repository.publish(next);
      return Response.json(next, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
    } catch {
      if (current) return Response.json({ ...current, stale: true }, { headers: { "Cache-Control": "public, max-age=60" } });
      return Response.json({ status: "source_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  return Response.json(current, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
```

無既有快照時即使尚未到 22:30 也執行一次 bootstrap 刷新。不得接受 `refresh=1` 公開強制刷新參數。

- [ ] **Step 6: 驗證 API 在刷新失敗時回傳上一版本**

Run: `node --test tests/ipo-events-refresh.test.mjs tests/ipo-events-api.test.mjs`

Expected: PASS。

- [ ] **Step 7: 提交刷新服務與 API**

```bash
git add lib/ipo-events/refresh.ts app/api/ipo-events/route.ts tests/ipo-events-refresh.test.mjs tests/ipo-events-api.test.mjs
git commit -m "feat: refresh IPO snapshots after close"
```

### Task 6: 建立 IPO 進度雷達分頁

**Files:**
- Create: `static-showcase/ipo-radar.html`
- Create: `static-showcase/assets/ipo-data.js`
- Create: `static-showcase/assets/ipo-radar-page.js`
- Create: `tests/static-showcase-ipo-radar-ui.test.mjs`

**Interfaces:**
- Consumes: `GET /api/ipo-events` 的 `IpoEventSnapshot`。
- Produces:
  - `loadIpoSnapshot({ fetchImpl? }): Promise<IpoEventSnapshot | null>`
  - 雷達頁 URL 狀態：`q`、`market`、`stage`、`sort`、`direction`、`page`

- [ ] **Step 1: 寫入雷達頁骨架與互動失敗測試**

```js
for (const text of ["IPO 進度雷達", "近期重要事件", "A 送件觀察", "B 審議進程", "C 契約／時程", "D 定價／掛牌"]) {
  assert.match(html, new RegExp(text));
}
assert.match(html, /assets\/ipo-radar-page\.js/);
assert.match(js, /URLSearchParams/);
assert.match(js, /data-radar-sort/);
assert.doesNotMatch(`${html}\n${js}`, /成交價|漲跌幅|週漲跌|波動價差/);
```

- [ ] **Step 2: 執行測試並確認頁面尚不存在**

Run: `node --test tests/static-showcase-ipo-radar-ui.test.mjs`

Expected: FAIL with `ENOENT`。

- [ ] **Step 3: 建立共用資料載入與錯誤回退**

```js
export async function loadIpoSnapshot({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl(new URL("/api/ipo-events", location.origin), { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.schemaVersion === 1 && Array.isArray(payload.records) ? payload : null;
}
```

- [ ] **Step 4: 實作雷達概況、近期事件、篩選與排序**

```js
const stageLabels = {
  A: "A 送件觀察",
  B: "B 審議進程",
  C: "C 契約／時程",
  D: "D 定價／掛牌",
};
```

最近事件依未來日期由近到遠；已過事件在沒有未來事件時才作最近事件。點選概況或階段按鈕套用 `stage` 篩選。點選公司連到 `./ipo.html?q=<公司代碼>`。桌面表顯示公司／市場、目前進度、最近事件、事件日期與距今天數。

- [ ] **Step 5: 實作無資料、上一成功版本與 URL 還原測試**

```js
assert.match(js, /history\.replaceState/);
assert.match(js, /popstate/);
assert.match(html, /data-page-error/);
assert.doesNotMatch(html, /測試公司|假資料/);
```

- [ ] **Step 6: 執行雷達頁測試並確認通過**

Run: `node --test tests/static-showcase-ipo-radar-ui.test.mjs tests/static-showcase.test.mjs`

Expected: PASS。

- [ ] **Step 7: 提交雷達分頁**

```bash
git add static-showcase/ipo-radar.html static-showcase/assets/ipo-data.js static-showcase/assets/ipo-radar-page.js tests/static-showcase-ipo-radar-ui.test.mjs
git commit -m "feat: add IPO progress radar page"
```

### Task 7: 重建 IPO 時程分頁

**Files:**
- Modify: `static-showcase/ipo.html`
- Modify: `static-showcase/assets/ipo-page.js`
- Modify: `tests/static-showcase-ipo-ui.test.mjs`
- Reuse: `static-showcase/assets/ipo-data.js`
- Reuse: `static-showcase/assets/table-sort.js`

**Interfaces:**
- Consumes: Task 6 `loadIpoSnapshot()` 與 `IpoEventSnapshot.records`。
- Produces: 五階段流程、未來關鍵事件、完整時程表與 URL 狀態。

- [ ] **Step 1: 將 IPO UI 測試改為新時程規格**

```js
for (const text of ["IPO 時程", "送件待審", "審議後", "董事會後", "契約後", "競拍／買賣", "未來關鍵事件"]) {
  assert.match(html, new RegExp(text));
}
for (const key of ["eventDate", "distanceDays", "provisionalUnderwritingPrice", "finalUnderwritingPrice", "listingDate"]) {
  assert.match(html, new RegExp(`data-ipo-sort="${key}"`));
}
assert.doesNotMatch(`${html}\n${js}`, /本站擷取|資料方法|擷取版本|官方快照/);
```

- [ ] **Step 2: 執行測試並確認舊單一 11586 頁不符合**

Run: `node --test tests/static-showcase-ipo-ui.test.mjs`

Expected: FAIL。

- [ ] **Step 3: 建立五階段概況與未來事件區**

```html
<ol id="ipo-stage-flow" class="ipo-stage-flow" aria-label="IPO 五階段流程">
  <li data-stage="A"><span>01</span><strong>送件待審</strong><small>等待審議</small></li>
  <li data-stage="B"><span>02</span><strong>審議後</strong><small>等待董事會</small></li>
  <li data-stage="board"><span>03</span><strong>董事會後</strong><small>等待契約</small></li>
  <li data-stage="C"><span>04</span><strong>契約後</strong><small>等待公開時程</small></li>
  <li data-stage="D"><span>05</span><strong>競拍／買賣</strong><small>明確交易日期</small></li>
</ol>
```

- [ ] **Step 4: 實作完整欄位、篩選、排序與無值置後**

```js
const sortTypes = {
  companyCode: "text",
  stage: "text",
  eventDate: "text",
  distanceDays: "number",
  provisionalUnderwritingPrice: "number",
  finalUnderwritingPrice: "number",
  auctionOpenDate: "text",
  listingDate: "text",
};
```

桌面欄位包含公司、市場、目前階段、事件類型、主要事件日、距今天、定價狀態、暫定承銷價、實際承銷價、競拍進度及上市／上櫃買賣日。搜尋、market、stage、event、year、sort、direction、page 寫入網址；無值永遠排在有效值後。

- [ ] **Step 5: 實作行動版公司事件卡**

```js
return `<article class="ipo-card">
  <header><h3>${escapeHtml(row.companyCode)} ${escapeHtml(row.companyName)}</h3><strong>${escapeHtml(stageLabel(row))}</strong></header>
  <dl><div><dt>最近事件</dt><dd>${escapeHtml(row.primaryEventLabel || "—")}</dd></div><div><dt>事件日期</dt><dd>${formatDate(row.primaryEventDate)}</dd></div></dl>
  <details><summary>承銷與完整歷程</summary>${timelineHtml(row)}</details>
</article>`;
```

- [ ] **Step 6: 執行 IPO 時程與排序測試**

Run: `node --test tests/static-showcase-ipo-ui.test.mjs tests/static-showcase-pages.test.mjs`

Expected: PASS。

- [ ] **Step 7: 提交 IPO 時程分頁**

```bash
git add static-showcase/ipo.html static-showcase/assets/ipo-page.js tests/static-showcase-ipo-ui.test.mjs
git commit -m "feat: rebuild IPO calendar page"
```

### Task 8: 完成導覽、視覺、響應式與每日喚醒

**Files:**
- Modify: `static-showcase/index.html`
- Modify: `static-showcase/bonds.html`
- Modify: `static-showcase/emerging.html`
- Modify: `static-showcase/ipo-radar.html`
- Modify: `static-showcase/ipo.html`
- Modify: `static-showcase/methodology.html`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/static-showcase-pages.test.mjs`
- Modify: `tests/static-showcase.test.mjs`
- Delete: `.github/workflows/deploy-github-pages.yml`
- Delete: `tests/github-pages-schedule.test.mjs`
- Create: `.github/workflows/refresh-public-site.yml`
- Create: `scripts/trigger-ipo-refresh.mjs`
- Create: `tests/public-site-refresh-schedule.test.mjs`

**Interfaces:**
- Consumes: 兩個 IPO 分頁與正式 `GET /api/ipo-events`。
- Produces: 五頁主要導覽、首頁雙入口、深淺主題、手機卡片及每日 22:30 API 喚醒。

- [ ] **Step 1: 寫入五頁導覽與首頁入口失敗測試**

```js
const primaryPageFiles = [
  ["index.html", "首頁"],
  ["bonds.html", "可轉債"],
  ["emerging.html", "興櫃市場"],
  ["ipo-radar.html", "IPO 雷達"],
  ["ipo.html", "IPO 時程"],
];
assert.match(home, /href="\.\/ipo-radar\.html"/);
assert.match(home, /href="\.\/ipo\.html"/);
```

- [ ] **Step 2: 寫入視覺與響應式失敗測試**

```js
for (const selector of ["ipo-radar-summary", "ipo-upcoming-grid", "ipo-stage-flow", "ipo-timeline-table", "ipo-card-list"]) {
  assert.match(css, new RegExp(`\\.${selector}`));
}
assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*\.ipo-timeline-table-shell\s*\{\s*display:\s*none/);
assert.match(css, /\[data-theme="dark"\][\s\S]*--ipo-stage-a:/);
```

- [ ] **Step 3: 更新所有導覽與首頁 IPO 模組**

首頁 IPO 主按鈕連到 `ipo-radar.html`，同一模組內提供「查看完整 IPO 時程」連到 `ipo.html`。方法頁保留直接網址但不進主要導覽。

- [ ] **Step 4: 加入編輯式雷達／時程視覺與行動版**

```css
.ipo-stage-flow { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:1px; }
.ipo-radar-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border:1px solid var(--line); }
@media (max-width:900px) {
  .ipo-timeline-table-shell { display:none; }
  .ipo-card-list { display:grid; }
  .ipo-stage-flow { grid-template-columns:1fr; }
}
```

階段色只用既有陶土、珊瑚、琥珀、紫灰與藍紫衍生色；深淺模式文字對比至少 4.5:1，所有可點區域最小高度 44px。

- [ ] **Step 5: 以 22:30 喚醒工作取代 GitHub Pages 部署**

```yaml
name: Refresh public IPO data
on:
  workflow_dispatch:
  schedule:
    - cron: "30 14 * * *"
jobs:
  refresh:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      UV_THREADPOOL_SIZE: "2"
      IPO_REFRESH_URL: "https://emerging-stock-radar-derivative-20260720.chiayu333.chatgpt.site/api/ipo-events"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: node scripts/trigger-ipo-refresh.mjs
```

`trigger-ipo-refresh.mjs` 對 URL 發出 GET，要求 HTTP 200、`schemaVersion === 1` 及非空 records。若回傳 `stale: true` 或 `dataDate` 不是台灣當日，最多重試 3 次、每次等待 20 秒；三次後仍有上一個有效快照時輸出 warning 並成功結束，避免把官方暫時延遲誤判成工作失敗。只有無有效快照、HTTP 非 200 或 payload 非法時才失敗。不得設定 Pages permissions、上傳 Pages artifact 或部署 GitHub Pages。

- [ ] **Step 6: 執行導覽、樣式與排程測試**

Run: `node --test tests/static-showcase-pages.test.mjs tests/static-showcase.test.mjs tests/public-site-refresh-schedule.test.mjs`

Expected: PASS，且不存在舊 GitHub Pages workflow。

- [ ] **Step 7: 提交整體外觀、導覽與排程**

```bash
git add static-showcase .github/workflows/refresh-public-site.yml scripts/trigger-ipo-refresh.mjs tests/static-showcase-pages.test.mjs tests/static-showcase.test.mjs tests/public-site-refresh-schedule.test.mjs
git rm .github/workflows/deploy-github-pages.yml tests/github-pages-schedule.test.mjs
git commit -m "feat: finish IPO pages and nightly refresh"
```

### Task 9: 正式資料驗證、完整建置與 Sites 發布

**Files:**
- Modify: `dist/**`（由建置產生，不手動編輯）
- Modify: Sites 版本（由發布流程產生，不手動編輯）

**Interfaces:**
- Consumes: Tasks 1–8 的完整實作與第一方正式資料。
- Produces: 已驗證、已部署且可由公開網址操作的正式版本。

- [ ] **Step 1: 執行來源與 IPO 核心測試**

Run: `node --test tests/source-verification/source-ipo-events.test.mjs tests/ipo-events-snapshot.test.mjs tests/ipo-events-repository.test.mjs tests/ipo-events-refresh.test.mjs tests/ipo-events-api.test.mjs`

Expected: PASS。

- [ ] **Step 2: 執行全部介面與排程測試**

Run: `node --test tests/static-showcase-emerging-ui.test.mjs tests/static-showcase-ipo-radar-ui.test.mjs tests/static-showcase-ipo-ui.test.mjs tests/static-showcase-pages.test.mjs tests/public-site-refresh-schedule.test.mjs`

Expected: PASS。

- [ ] **Step 3: 執行完整低負載驗證**

Run: `$env:UV_THREADPOOL_SIZE='2'; npm run test:showcase`

Run: `$env:UV_THREADPOOL_SIZE='2'; npm run lint`

Run: `$env:UV_THREADPOOL_SIZE='2'; npm run typecheck`

Run: `$env:UV_THREADPOOL_SIZE='2'; npm run build`

Expected: 全部 exit 0。

- [ ] **Step 4: 在本機正式路由抽查三筆第一方事件**

核對一筆 TWSE 上市申請、一筆 TPEx 上櫃申請及一筆初上市／初上櫃競拍或公開申購；公司代碼、事件日期、暫定／實際承銷價及掛牌日必須與第一方來源相同。確認來源失敗 fixture 不會切換 D1 pointer。

- [ ] **Step 5: 執行瀏覽器驗收**

在桌面 1440px 與手機 390px 寬度依序開啟 `/market-site/ipo-radar.html`、`/market-site/ipo.html`、`/market-site/emerging.html`；檢查深色／淺色、鍵盤焦點、階段篩選、升降冪、跨頁公司篩選、行動卡片及均價欄位已移除。

- [ ] **Step 6: 依 Sites hosting 流程發布既有專案**

使用既有 `.openai/hosting.json` 專案，打包成功建置、儲存一個新版本、部署並輪詢至 `succeeded`。D1 migration `0005_ipo_event_snapshots.sql` 必須隨版本套用。

- [ ] **Step 7: 驗證公開 API 與網站**

開啟正式 `/api/ipo-events`，確認 HTTP 200、`schemaVersion: 1`、五筆 source manifest 及非空 records。再驗證公開兩個 IPO 分頁顯示相同資料日期，且興櫃頁不含「當日成交均價（盤後）」。

- [ ] **Step 8: 提交最後必要修正並記錄發布結果**

```bash
git add -A
git commit -m "chore: verify IPO production release"
```

若 Step 3–7 未產生檔案修改，不建立空提交；只回報已通過的驗證與正式網址。
