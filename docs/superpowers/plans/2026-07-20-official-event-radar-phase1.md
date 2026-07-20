# Official Non-Price Event Radar Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立「興債觀測網」第一階段官方非價格資料事件雷達，提供興櫃公司目錄、公司基本資料、上市櫃申請進度、IPO／承銷／競拍／抽籤事件、官方重大公告索引、公司事件時間軸，以及可追溯的來源與更新狀態。

**Architecture:** 頁面與 React 元件只呼叫本站 API；API route 只依賴 application service；service 只依賴 repository interface；開發與測試先使用 memory/fixture repository，再由獨立 D1 adapter 實作相同介面。任何外部資料必須先通過 Source Registry 授權閘門、驗證及正規化，UI 永遠不接收來源原始 payload。

**Tech Stack:** Node.js 22.13+、TypeScript 5.9、React 19、Next.js 16 App Router、Vinext/Vite、Cloudflare Worker、Cloudflare D1、Node test runner、ESLint。

## Global Constraints

- 基線分支為 `chore/remove-yahoo-and-rebrand`，基線 commit 為 `f60caa3`。
- 實作時建立 `feat/official-event-radar-phase1`，不得改寫或刪除既有 Git 歷史。
- 正式品牌固定為「興債觀測網」；副標題固定為「興櫃公司、可轉債與上市櫃進度資訊」。
- 禁止即時或延遲價格、漲跌幅、成交量、K 線、技術分析及投資訊號。
- 禁止 Yahoo、Yahoo Finance、券商接口、未公開接口及未核准外部來源。
- 第一階段不含追蹤清單、會員、付款、廣告、推播或正式部署。
- 領域模型、API DTO、D1 schema、fixture 與正式 UI 均不得包含市場價格型欄位。
- 承銷價、競拍底價、得標價及價差也不納入第一階段。
- 每筆可發布資料必須具備來源 ID、原始 URL、來源發布時間、擷取時間、同步批次及 payload hash。
- 授權未經人工確認的 SourceDefinition 一律為 `pending_review`，不得發出外部請求。
- 每個任務依序執行 `node --test <target>`、`npm run typecheck`、`npm run lint`；涉及頁面或建置設定時另執行 `npm run build`。
- 不新增套件；先使用現有 Node、TypeScript、React、Next/Vinext 與 Cloudflare 工具。
- 所有 CPU 密集工作最多使用 2 個執行緒並採低負載模式。

---

## Product Scope

### Included

- 興櫃公司目錄與搜尋。
- 公司基本資料。
- 上市櫃申請進度。
- IPO、承銷、競拍及抽籤的非價格事件與日期。
- 官方重大公告索引。
- 公司事件時間軸。
- 資料來源、授權狀態、更新時間與健康狀態。
- 單一來源失敗、部分成功、全部失敗、延遲及過期顯示。

### Excluded

- 即時或延遲價格、任何 OHLC、買賣價、承銷價或得標價。
- 漲跌幅、成交量、成交值、排行、K 線、技術分析、投資訊號。
- Yahoo 或其他未授權行情 API。
- 追蹤清單、會員、付款、廣告與推播。
- 未取得明確授權的正式資料介接。

## Layer and Dependency Rules

```text
app pages / React components
  -> app/api routes
    -> lib/services
      -> lib/repositories/contracts.ts
        -> lib/repositories/memory/*
        -> lib/repositories/d1/*

worker scheduled handler
  -> lib/ingestion/ingestion-service.ts
    -> lib/sources/source-registry.ts
    -> lib/sources/adapters/*
    -> lib/repositories/contracts.ts
```

- `app/**` 不得 import `lib/repositories/d1/**` 或 SQL。
- `app/api/**` 不得 import D1 binding 或來源 adapter。
- `lib/domain/**` 不得 import React、Next、Cloudflare 或 repository。
- `lib/sources/adapters/**` 只輸出正規化 write model，不輸出原始 JSON/CSV。
- `lib/repositories/d1/**` 只處理儲存，不 fetch 外部來源。

## Canonical Domain Types

建立於 `lib/domain/types.ts`，後續任務不得另造同義型別。

```ts
export type IsoDate = `${number}-${number}-${number}`;
export type IsoDateTime = string;
export type SourceReviewStatus = "pending_review" | "approved" | "rejected";
export type SourceOperationalStatus = "healthy" | "delayed" | "stale" | "stopped";
export type SourceHealthLevel =
  | "healthy"
  | "delayed"
  | "partial"
  | "stale"
  | "authorization_pending"
  | "stopped"
  | "failed"
  | "empty";

export interface SourceTrace {
  sourceId: string;
  sourceRecordKey: string;
  sourceUrl: string;
  sourcePublishedAt: IsoDateTime;
  retrievedAt: IsoDateTime;
  ingestionRunId: string;
  sourcePayloadHash: string;
}

export interface CompanyIdentifier {
  id: string;
  companyId: string;
  scheme: "tw_business_id" | "security_code";
  value: string;
  market: "emerging" | "listed" | "otc" | "unknown";
  validFrom: IsoDate | null;
  validTo: IsoDate | null;
  trace: SourceTrace;
}

export interface Company {
  id: string;
  currentName: string;
  shortName: string | null;
  industryCode: string | null;
  industryName: string | null;
  chairman: string | null;
  generalManager: string | null;
  establishedOn: IsoDate | null;
  paidInCapital: number | null;
  websiteUrl: string | null;
  identifiers: CompanyIdentifier[];
  previousNames: Array<{ name: string; validFrom: IsoDate | null; validTo: IsoDate | null }>;
  trace: SourceTrace;
}

export interface SourceAttribution {
  agencyName: string;
  datasetName: string;
  licenseName: string;
  licenseVersion: string;
  statement: string;
  licenseUrl: string;
}

export interface SourceDefinition {
  id: string;
  metadataUrl: string;
  resourceUrl: string | null;
  allowedHosts: string[];
  acquisitionMethod: "csv" | "json_api" | "manual_file";
  expectedFrequency: "daily" | "irregular";
  staleAfterSeconds: number;
  reviewStatus: SourceReviewStatus;
  commercialUseStatus: SourceReviewStatus;
  reproductionStatus: SourceReviewStatus;
  modificationStatus: SourceReviewStatus;
  cacheStatus: SourceReviewStatus;
  historyRetentionStatus: SourceReviewStatus;
  attribution: SourceAttribution | null;
  reviewedBy: string | null;
  reviewedAt: IsoDateTime | null;
  reviewEvidenceUrl: string | null;
}

export type CompanyEventType =
  | "listing_application"
  | "review"
  | "board_approval"
  | "contract_filing"
  | "auction"
  | "public_subscription"
  | "lottery"
  | "listing"
  | "material_announcement";

export interface CompanyEvent {
  id: string;
  companyId: string;
  eventType: CompanyEventType;
  title: string;
  summary: string | null;
  occurredAt: IsoDateTime | null;
  announcedAt: IsoDateTime | null;
  startsAt: IsoDateTime | null;
  endsAt: IsoDateTime | null;
  status: "scheduled" | "open" | "completed" | "cancelled" | "unknown";
  officialReference: string | null;
  trace: SourceTrace;
}

export interface ListingApplication {
  id: string;
  companyId: string;
  targetMarket: "listed" | "otc";
  applicationCycleKey: string;
  currentStage:
    | "submitted"
    | "reviewing"
    | "review_passed"
    | "board_approved"
    | "contract_filed"
    | "scheduled"
    | "completed"
    | "withdrawn"
    | "rejected"
    | "unknown";
  appliedOn: IsoDate | null;
  reviewedOn: IsoDate | null;
  boardApprovedOn: IsoDate | null;
  contractFiledOn: IsoDate | null;
  scheduledListingOn: IsoDate | null;
  completedOn: IsoDate | null;
  leadUnderwriter: string | null;
  officialStatusText: string | null;
  trace: SourceTrace;
}

export interface IpoEvent {
  id: string;
  companyId: string;
  kind: "underwriting" | "auction" | "public_subscription" | "lottery";
  announcedAt: IsoDateTime | null;
  startsAt: IsoDateTime | null;
  endsAt: IsoDateTime | null;
  resultAnnouncedAt: IsoDateTime | null;
  status: "scheduled" | "open" | "completed" | "cancelled" | "unknown";
  leadUnderwriter: string | null;
  trace: SourceTrace;
}

export interface IngestionRun {
  id: string;
  sourceId: string;
  startedAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  status: "running" | "success" | "partial" | "failed" | "blocked" | "stopped";
  resourceUrl: string;
  schemaVersion: string;
  recordsReceived: number;
  recordsAccepted: number;
  recordsRejected: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  errorCode: string | null;
  errorSummary: string | null;
  payloadHash: string | null;
  previousSuccessfulRunId: string | null;
}

export interface DataFreshness {
  sourceId: string;
  level: "fresh" | "delayed" | "stale" | "unknown";
  sourcePublishedAt: IsoDateTime | null;
  retrievedAt: IsoDateTime | null;
  expectedNextAt: IsoDateTime | null;
  staleAt: IsoDateTime | null;
}

export interface SourceHealth {
  sourceId: string;
  level: SourceHealthLevel;
  lastRunStatus: IngestionRun["status"] | null;
  lastSuccessfulAt: IsoDateTime | null;
  message: string;
  freshness: DataFreshness;
}
```

### Identity, Relations, Dates, and Deduplication

- 所有日期以 ISO 8601 儲存；純日期使用 `YYYY-MM-DD`，時間使用 UTC ISO datetime，UI 才轉 `Asia/Taipei`。
- Company 主鍵為站內 UUID；`CompanyIdentifier` 主鍵為 UUID。
- 有效識別碼唯一鍵為 `(scheme, value, market, validTo IS NULL)`；公司代號不可作永久公司主鍵。
- Company 名稱變更追加 `previousNames`，不得破壞 Company `id`。
- CompanyEvent 唯一鍵優先為 `(sourceId, sourceRecordKey, eventType)`。
- 官方沒有穩定事件鍵時使用 `(sourceId, companyId, eventType, occurredAt, sourcePayloadHash)`。
- 相同事件不同來源各自保留 source record，再由 service 以 `companyId + eventType + officialReference + occurredAt` 建立展示群組；不得刪除來源追溯。
- ListingApplication 唯一鍵為 `(companyId, targetMarket, applicationCycleKey)`。
- IpoEvent 唯一鍵為 `(sourceId, sourceRecordKey, kind)`。
- 所有可發布 Company、CompanyEvent、ListingApplication、IpoEvent 必須有完整 `SourceTrace`。
- 禁止模型欄位：`price`、`quote`、`open`、`high`、`low`、`close`、`bid`、`ask`、`volume`、`turnover`、`change`、`changePercent`、`candlestick`、`kline`、`ohlc`。

---

### Task 1: Create the Development Branch and Strengthen Phase-One Safety Guards

**Goal:** 從 `f60caa3` 建立隔離分支，先讓測試證明任何 Yahoo、行情 route、adapter 或價格欄位都會失敗。

**Dependencies:** 人工批准本計畫；工作樹乾淨且 HEAD 可追溯至 `f60caa3`。

**Files:**
- Create: `tests/phase1-boundaries.test.mjs` — 掃描正式檔案、路由、adapter 與禁止欄位。
- Modify: `tests/no-market-quotes.test.mjs` — 擴大正式目錄與禁止 provider 規則。
- Modify: `app/Dashboard.tsx` — 移除殘留 `provisionalPrice`、`actualPrice`、`pricingStatus` 型別與 UI。
- Modify: `lib/tracker.mjs` — 移除第一階段不允許的價格輸出欄位。
- Modify: `tests/tracker-pricing.test.mjs` — 改為斷言 IPO payload 無任何價格欄位。

**Interfaces:**
- Produces: `assertNoProhibitedMarketFeatures(files: string[]): Promise<void>`，僅供測試 helper 使用。

- [ ] **Step 1: Create and verify the branch**

Run:

```powershell
git status --short
git switch -c feat/official-event-radar-phase1 f60caa3
git branch --show-current
```

Expected: 第一個命令沒有輸出；最後輸出 `feat/official-event-radar-phase1`。

- [ ] **Step 2: Write the failing guard test**

`tests/phase1-boundaries.test.mjs` 必須掃描 `app`, `lib`, `worker`, `db`, `scripts`，並以 token 組合避免測試檔本身觸發：

```js
const prohibitedFields = [
  ["pri", "ce"].join(""),
  ["qu", "ote"].join(""),
  ["vol", "ume"].join(""),
  ["change", "Percent"].join(""),
  ["candle", "stick"].join(""),
];
```

只對 `.ts`, `.tsx`, `.js`, `.mjs`, `.sql`, `.json` 正式檔案檢查物件鍵、介面欄位與 route/adapter 路徑，並明確允許 `paidInCapital`。

- [ ] **Step 3: Run the test to verify failure**

Run: `node --test tests/phase1-boundaries.test.mjs`

Expected: FAIL，至少列出 `app/Dashboard.tsx` 或 `lib/tracker.mjs` 的既有價格欄位。

- [ ] **Step 4: Apply the minimum removal**

刪除 `RadarRow`、`StageItem` 及 tracker payload 中的價格欄位、`pricingClass()`、`pricingDetail()` 和相關表格欄；不改變公司搜尋、階段或日期功能。

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --test tests/phase1-boundaries.test.mjs tests/no-market-quotes.test.mjs tests/tracker-pricing.test.mjs
npm run typecheck
npm run lint
git add app/Dashboard.tsx lib/tracker.mjs tests/phase1-boundaries.test.mjs tests/no-market-quotes.test.mjs tests/tracker-pricing.test.mjs
git commit -m "test: enforce phase one non-market boundaries"
```

Expected: 全部通過；commit 只含列出的檔案。

**Acceptance:** 正式程式無禁止欄位、行情 route、行情 adapter 或 Yahoo provider。

**Rollback:** `git revert <task-1-commit>`。

**Authorization dependency:** No。

---

### Task 2: Add Canonical Domain Types and Runtime Publication Validation

**Goal:** 建立唯一的領域型別及正式發布前的來源追溯驗證。

**Dependencies:** Task 1。

**Files:**
- Create: `lib/domain/types.ts` — 本計畫 Canonical Domain Types。
- Create: `lib/domain/publication.ts` — 驗證 trace 與禁止欄位。
- Create: `tests/domain-models.test.mjs` — 型別來源掃描與 runtime validation。

**Interfaces:**

```ts
export type PublishableRecord = Company | CompanyEvent | ListingApplication | IpoEvent;
export function assertPublishable<T extends PublishableRecord>(record: T): T;
export function eventDedupKey(event: CompanyEvent): string;
export function ipoEventDedupKey(event: IpoEvent): string;
```

- [ ] **Step 1: Write failing tests**

測試完整 trace 可通過；缺 `sourceUrl`、`retrievedAt` 或 hash 時丟出 `UNPUBLISHABLE_SOURCE_TRACE`；禁止欄位深層出現時丟出 `PROHIBITED_MARKET_FIELD`；相同事件產生相同 dedup key。

- [ ] **Step 2: Verify failure**

Run: `node --test tests/domain-models.test.mjs`

Expected: FAIL，因 `lib/domain/types.ts` 尚不存在。

- [ ] **Step 3: Implement the canonical types and validator**

`publication.ts` 使用遞迴 key 檢查，但忽略一般文字內容；禁止的是 schema key，不掃描公告自然語言。`assertPublishable()` 回傳原 record，方便 service 在寫入與回傳 DTO 前呼叫。

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --test tests/domain-models.test.mjs tests/phase1-boundaries.test.mjs
npm run typecheck
npm run lint
git add lib/domain/types.ts lib/domain/publication.ts tests/domain-models.test.mjs
git commit -m "feat: define non-market domain models"
```

**Acceptance:** 所有必要模型只有一份定義；日期、唯一鍵、關聯及禁止欄位符合本計畫。

**Rollback:** revert Task 2 commit；Task 3 之後不得單獨回復 Task 2。

**Authorization dependency:** No。

---

### Task 3: Implement the Source Registry and Authorization Gate

**Goal:** 只有人工核准且 resource URL/host 完全匹配的來源能進入 ingestion。

**Dependencies:** Task 2。

**Files:**
- Create: `lib/sources/source-registry.ts` — 註冊與查詢 SourceDefinition。
- Create: `lib/sources/source-policy.ts` — 授權與 URL 判定。
- Create: `lib/sources/definitions.ts` — 候選來源全部預設 `pending_review`。
- Create: `tests/source-registry.test.mjs` — 授權、host、redirect 與 attribution 測試。

**Interfaces:**

```ts
export function listSourceDefinitions(): readonly SourceDefinition[];
export function getSourceDefinition(id: string): SourceDefinition | null;
export function requireApprovedSource(id: string): SourceDefinition;
export function assertApprovedResource(source: SourceDefinition, requestedUrl: string): URL;
export function assertApprovedRedirect(source: SourceDefinition, responseUrl: string): URL;
```

- [ ] **Step 1: Write failing tests**

測試 `pending_review` 回傳 `SOURCE_AUTHORIZATION_PENDING`；缺 attribution 的 approved source 回傳 `SOURCE_ATTRIBUTION_REQUIRED`；不同 resource URL、host 或 redirect 回傳 `SOURCE_RESOURCE_NOT_APPROVED`。

- [ ] **Step 2: Verify failure**

Run: `node --test tests/source-registry.test.mjs`

Expected: FAIL，因 source registry 尚不存在。

- [ ] **Step 3: Implement the minimum registry**

`definitions.ts` 只建立設計草案中的候選 ID，`resourceUrl: null`、所有權利狀態為 `pending_review`；不得放可執行正式 endpoint。測試中的 approved source 由測試檔局部建立。

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --test tests/source-registry.test.mjs tests/domain-models.test.mjs
npm run typecheck
npm run lint
git add lib/sources/source-registry.ts lib/sources/source-policy.ts lib/sources/definitions.ts tests/source-registry.test.mjs
git commit -m "feat: add source authorization registry"
```

**Acceptance:** 未核准來源無法取得 resource URL，也不能被 ingestion 呼叫。

**Rollback:** revert Task 3 commit。

**Authorization dependency:** No；正式定義維持 blocked。

---

### Task 4: Define Replaceable Repository Contracts

**Goal:** 頁面、API 與 service 不依賴 D1 或 SQL。

**Dependencies:** Task 2。

**Files:**
- Create: `lib/repositories/contracts.ts` — repository interfaces、query 與 result 型別。
- Create: `tests/repository-contract-shape.test.mjs` — 禁止 D1/SQL 泄漏及介面形狀測試。

**Interfaces:**

```ts
export interface CompanyRepository {
  search(query: { keyword: string; industry: string | null; limit: number; cursor: string | null }): Promise<{ items: Company[]; nextCursor: string | null }>;
  findById(id: string): Promise<Company | null>;
  findBySecurityCode(code: string): Promise<Company | null>;
  upsertMany(records: Company[], runId: string): Promise<WriteSummary>;
}
export interface EventRepository {
  listByCompany(companyId: string): Promise<CompanyEvent[]>;
  listIpoEvents(): Promise<IpoEvent[]>;
  upsertEvents(records: CompanyEvent[], runId: string): Promise<WriteSummary>;
  upsertIpoEvents(records: IpoEvent[], runId: string): Promise<WriteSummary>;
}
export interface ListingApplicationRepository {
  list(): Promise<ListingApplication[]>;
  listByCompany(companyId: string): Promise<ListingApplication[]>;
  upsertMany(records: ListingApplication[], runId: string): Promise<WriteSummary>;
}
export interface SourceRepository {
  list(): Promise<SourceDefinition[]>;
  get(id: string): Promise<SourceDefinition | null>;
  listHealth(): Promise<SourceHealth[]>;
}
export interface IngestionRunRepository {
  start(run: IngestionRun): Promise<void>;
  finish(run: IngestionRun): Promise<void>;
  latestForSource(sourceId: string): Promise<IngestionRun | null>;
}
export interface Repositories {
  companies: CompanyRepository;
  events: EventRepository;
  applications: ListingApplicationRepository;
  sources: SourceRepository;
  ingestionRuns: IngestionRunRepository;
}
export interface WriteSummary { created: number; updated: number; unchanged: number; rejected: number; }
```

- [ ] **Step 1:** 寫入 failing test，確認 contract 存在且檔案不含 `D1Database`, `prepare(` 或 SQL 關鍵字。
- [ ] **Step 2:** 執行 `node --test tests/repository-contract-shape.test.mjs`，預期 module-not-found FAIL。
- [ ] **Step 3:** 以以上介面建立最小 contract 檔，不加入通用 ORM abstraction。
- [ ] **Step 4:** 執行 typecheck、lint 與目標測試並提交。

Commit:

```powershell
git add lib/repositories/contracts.ts tests/repository-contract-shape.test.mjs
git commit -m "feat: define repository boundaries"
```

**Acceptance:** API/service 可只依賴 `Repositories`；contract 不含 D1 型別。

**Rollback:** revert Task 4 commit。

**Authorization dependency:** No。

---

### Task 5: Add Deterministic Fixture and Memory Repositories

**Goal:** 在不接外部來源、不建立資料庫的情況下支援開發及完整測試。

**Dependencies:** Task 2、4。

**Files:**
- Create: `lib/fixtures/phase1-fixture.ts` — 明確標示 fixture 的最小公司、事件與狀態。
- Create: `lib/repositories/memory/create-memory-repositories.ts` — 所有 repository 的記憶體實作。
- Create: `tests/memory-repositories.test.mjs` — contract、公司名稱變更、去重及冪等測試。

**Interfaces:**

```ts
export interface FixtureSeed {
  companies: Company[];
  events: CompanyEvent[];
  ipoEvents: IpoEvent[];
  applications: ListingApplication[];
  sources: SourceDefinition[];
  health: SourceHealth[];
}
export function createMemoryRepositories(seed: FixtureSeed): Repositories;
export const PHASE1_FIXTURE: FixtureSeed;
```

- [ ] **Step 1:** 寫 failing tests：相同 upsert 重跑為 unchanged；名稱變更保留同 Company id；相同事件去重；不同來源記錄不互相刪除。
- [ ] **Step 2:** 執行 `node --test tests/memory-repositories.test.mjs`，預期 module-not-found FAIL。
- [ ] **Step 3:** 使用 `Map` 建立最小實作；所有輸入先呼叫 `assertPublishable()`；fixture 的 title 顯示「fixture」。
- [ ] **Step 4:** 執行目標測試、typecheck、lint 並提交。

Commit: `feat: add deterministic fixture repositories`

**Acceptance:** 測試可完全離線；production module 不自動 import `PHASE1_FIXTURE`。

**Rollback:** revert Task 5 commit。

**Authorization dependency:** No。

---

### Task 6: Add the D1 Adapter Behind the Repository Contracts

**Goal:** 建立可替換的 D1 儲存實作，但不接入正式資料或建立遠端資料庫。

**Dependencies:** Task 4、5。

**Files:**
- Create: `db/migrations/0001_phase1_non_market_schema.sql` — Company、identifier、source、event、application、IPO event、ingestion run。
- Create: `lib/repositories/d1/d1-types.ts` — 最小 D1 binding 介面。
- Create: `lib/repositories/d1/create-d1-repositories.ts` — `Repositories` adapter。
- Create: `tests/d1-schema.test.mjs` — table、constraint、禁止行情欄位與 layer 邊界掃描。

**Interfaces:**

```ts
export interface D1Binding {
  prepare(sql: string): { bind(...values: unknown[]): unknown };
  batch(statements: unknown[]): Promise<unknown[]>;
  exec(sql: string): Promise<unknown>;
}
export function createD1Repositories(db: D1Binding): Repositories;
```

- [ ] **Step 1:** 寫 failing schema test，要求表格唯一鍵、foreign key 與 trace 欄位，並拒絕所有禁止欄位。
- [ ] **Step 2:** 執行 `node --test tests/d1-schema.test.mjs`，預期找不到 migration。
- [ ] **Step 3:** 建立 SQL 與 adapter；SQL 只存在 `lib/repositories/d1` 和 migration；不設定實際 binding、不執行 migration。
- [ ] **Step 4:** 執行目標測試、typecheck、lint 並提交。

Commit: `feat: add replaceable d1 repository adapter`

**Acceptance:** D1 adapter 實作相同 contract；頁面/API 無 SQL；沒有建立任何本機或遠端資料庫。

**Rollback:** revert Task 6 commit；沒有外部資料需清理。

**Authorization dependency:** No。

---

### Task 7: Implement Company Directory Application Service and API

**Goal:** 使用 repository 提供公司搜尋 DTO，不暴露 fixture 或來源原始欄位。

**Dependencies:** Task 4、5。

**Files:**
- Create: `lib/services/company-service.ts` — 搜尋與詳情 use cases。
- Create: `lib/api/contracts.ts` — 公開 DTO。
- Create: `app/api/companies/route.ts` — 公司搜尋 API。
- Create: `tests/company-service.test.mjs` — 搜尋、名稱與 trace。
- Create: `tests/companies-api.test.mjs` — query 與 response schema。
- Modify: `app/api/company/route.ts` — 改成 compatibility wrapper，呼叫 service，不直接 fetch。

**Interfaces:**

```ts
export interface CompanyListItemDto {
  id: string;
  securityCode: string;
  name: string;
  industryName: string | null;
  sourceId: string;
  sourceUrl: string;
  sourcePublishedAt: string;
  retrievedAt: string;
}
export function createCompanyService(repositories: Repositories): {
  search(input: { keyword: string; industry: string | null; limit: number; cursor: string | null }): Promise<{ items: CompanyListItemDto[]; nextCursor: string | null }>;
  getByCode(code: string): Promise<CompanyDetailDto | null>;
};
```

- [ ] **Step 1:** 寫 failing tests：代號／名稱搜尋、名稱變更仍解析同公司、缺 trace 拒絕、limit 最大 100。
- [ ] **Step 2:** 執行 `node --test tests/company-service.test.mjs tests/companies-api.test.mjs`，預期 module-not-found。
- [ ] **Step 3:** 建立 service/DTO/API；API 透過 server composition root 取得 repositories，不 import D1。
- [ ] **Step 4:** 驗證目標測試、typecheck、lint、build 並提交。

Commit: `feat: add company directory service and api`

**Acceptance:** API schema 穩定、只有正規化 DTO、來源追溯完整。

**Rollback:** revert Task 7 commit；舊 `/api/company` 回復需同一 revert 完成。

**Authorization dependency:** No；只使用 fixture repository。

---

### Task 8: Build the Company Directory and Search Page

**Goal:** 完成可離線驗收的興櫃公司目錄與搜尋 UI。

**Dependencies:** Task 7。

**Files:**
- Create: `app/companies/page.tsx` — 公司目錄頁。
- Create: `app/components/company/CompanyDirectory.tsx` — client 搜尋與結果。
- Create: `app/components/company/CompanyCard.tsx` — 公司摘要與來源。
- Create: `tests/company-directory-render.test.mjs` — HTML 與禁行情字樣。
- Modify: `app/Dashboard.tsx` — 導覽加入公司目錄並移除 market tab。
- Modify: `app/page.tsx` — 首頁導向 `/companies` 或事件雷達。
- Modify: `app/globals.css` — 公司目錄樣式。

**Interfaces:** consumes `CompanyListItemDto`; no new domain types。

- [ ] **Step 1:** 寫 failing render test，要求搜尋欄、公司代號、名稱、產業、來源與更新時間，並拒絕價格／行情排序。
- [ ] **Step 2:** 執行 `node --test tests/company-directory-render.test.mjs`，預期缺頁面 FAIL。
- [ ] **Step 3:** 建立最小頁面與元件；保留現有響應式 CSS 模式，不進行全站重構。
- [ ] **Step 4:** 執行測試、typecheck、lint、build 並提交。

Commit: `feat: add emerging company directory`

**Acceptance:** 桌面與行動版可搜尋；無資料顯示中性空狀態；不顯示任何行情。

**Rollback:** revert Task 8 commit。

**Authorization dependency:** No；正式環境仍只顯示「來源待核准」或 fixture 明示畫面。

---

### Task 9: Add Company Details and Unified Event Timeline

**Goal:** 公司頁整合基本資料、申請進度及事件，且來源逐筆可追溯。

**Dependencies:** Task 5、7、8。

**Files:**
- Create: `lib/services/event-service.ts` — 合併、群組、排序與部分來源結果。
- Create: `app/api/companies/[code]/events/route.ts` — 公司事件 API。
- Create: `app/companies/[code]/page.tsx` — 公司詳情。
- Create: `app/components/events/EventTimeline.tsx` — 時間軸。
- Create: `app/components/sources/SourceCitation.tsx` — 來源顯名。
- Create: `tests/event-service.test.mjs` — 去重與不同來源。
- Create: `tests/company-detail-render.test.mjs` — trace、空狀態。
- Modify: `app/globals.css` — 時間軸樣式。

**Interfaces:**

```ts
export interface TimelineItemDto {
  id: string;
  companyId: string;
  type: CompanyEventType;
  title: string;
  occurredAt: string | null;
  status: CompanyEvent["status"];
  sources: Array<{ sourceId: string; sourceUrl: string; sourcePublishedAt: string; retrievedAt: string }>;
}
export function createEventService(repositories: Repositories): {
  listCompanyTimeline(companyId: string): Promise<TimelineItemDto[]>;
};
```

- [ ] **Step 1:** failing tests：同來源重複去除；相同事件不同來源群組但保留兩筆引用；缺 trace 拒絕；日期倒序且 null 最後。
- [ ] **Step 2:** 執行兩個目標測試，預期 module/page missing。
- [ ] **Step 3:** 實作最小 service、API、頁面與元件。
- [ ] **Step 4:** 執行測試、typecheck、lint、build 並提交。

Commit: `feat: add traceable company event timeline`

**Acceptance:** 每個 timeline item 至少一個來源；來源失敗不刪除其他來源事件。

**Rollback:** revert Task 9 commit。

**Authorization dependency:** No；fixture only。

---

### Task 10: Add Listing Application and IPO Event Pages

**Goal:** 提供非價格型上市櫃申請進度與 IPO 事件清單。

**Dependencies:** Task 4、5、9。

**Files:**
- Create: `lib/services/application-service.ts` — 申請階段與 IPO DTO。
- Create: `app/api/applications/route.ts` — 申請進度 API。
- Create: `app/api/events/ipo/route.ts` — IPO 事件 API。
- Create: `app/applications/page.tsx` — 上市櫃進度。
- Modify: `app/ipo/page.tsx` — 改用 IpoEvent DTO。
- Create: `app/components/applications/ApplicationProgress.tsx`.
- Create: `app/components/events/IpoEventList.tsx`.
- Create: `tests/application-service.test.mjs`.
- Create: `tests/ipo-events-render.test.mjs`.
- Modify: `app/globals.css`.

**Interfaces:**

```ts
export interface ListingApplicationDto {
  id: string;
  companyId: string;
  companyName: string;
  targetMarket: "listed" | "otc";
  currentStage: ListingApplication["currentStage"];
  milestoneDates: Array<{ stage: string; date: string }>;
  source: TimelineItemDto["sources"][number];
}
export interface IpoEventDto {
  id: string;
  companyId: string;
  companyName: string;
  kind: IpoEvent["kind"];
  startsAt: string | null;
  endsAt: string | null;
  resultAnnouncedAt: string | null;
  status: IpoEvent["status"];
  source: TimelineItemDto["sources"][number];
}
```

- [ ] **Step 1:** failing tests：狀態 mapping、日期、無價格鍵、無資料、取消事件。
- [ ] **Step 2:** 執行目標測試，預期 service/component missing。
- [ ] **Step 3:** 建立最小 service/API/UI；不顯示承銷價、競拍底價、得標價。
- [ ] **Step 4:** 執行測試、typecheck、lint、build 並提交。

Commit: `feat: add non-price application and ipo events`

**Acceptance:** 兩頁只有階段、日期、狀態、公司及來源。

**Rollback:** revert Task 10 commit。

**Authorization dependency:** No；fixture only。

---

### Task 11: Add Source Health and Freshness Services

**Goal:** 對每個來源計算正常、延遲、過期、授權待確認、停止或失敗。

**Dependencies:** Task 3、4、5。

**Files:**
- Create: `lib/services/source-health-service.ts`.
- Create: `app/api/sources/status/route.ts`.
- Create: `tests/source-health-service.test.mjs`.
- Create: `tests/source-status-api.test.mjs`.

**Interfaces:**

```ts
export function calculateDataFreshness(
  source: SourceDefinition,
  lastRun: IngestionRun | null,
  now: string,
): DataFreshness;
export function createSourceHealthService(repositories: Repositories, clock: () => string): {
  list(): Promise<SourceHealth[]>;
  aggregate(): Promise<{ level: SourceHealthLevel; sources: SourceHealth[] }>;
};
```

- [ ] **Step 1:** 使用固定 clock 寫 failing tests，涵蓋 fresh、delayed、stale、pending、stopped、failed、empty。
- [ ] **Step 2:** 執行目標測試，預期 missing export。
- [ ] **Step 3:** 用來源頻率與 `staleAfterSeconds` 實作；不定期來源只依人工停止或明確 stale 設定。
- [ ] **Step 4:** 執行測試、typecheck、lint 並提交。

Commit: `feat: calculate source freshness and health`

**Acceptance:** 相同輸入與 clock 得到確定結果；pending source 永遠不呈現 healthy。

**Rollback:** revert Task 11 commit。

**Authorization dependency:** No。

---

### Task 12: Render Normal, Partial, Failed, Stale, and Empty States

**Goal:** 單一來源失敗不拖垮網站，並清楚區分空資料與錯誤。

**Dependencies:** Task 8–11。

**Files:**
- Create: `app/components/sources/SourceStatusBanner.tsx`.
- Create: `app/components/sources/SourceStatusList.tsx`.
- Create: `app/sources/page.tsx`.
- Create: `tests/source-state-render.test.mjs`.
- Modify: `app/companies/page.tsx`.
- Modify: `app/companies/[code]/page.tsx`.
- Modify: `app/applications/page.tsx`.
- Modify: `app/ipo/page.tsx`.
- Modify: `app/globals.css`.

**Interfaces:** consumes `{ level: SourceHealthLevel; sources: SourceHealth[] }`。

- [ ] **Step 1:** failing render tests：單一來源失敗、部分成功、全部失敗、無資料、過期、授權待確認、停止服務。
- [ ] **Step 2:** 執行 `node --test tests/source-state-render.test.mjs`，預期 component missing。
- [ ] **Step 3:** 實作共用 banner/list；partial 回應仍顯示成功資料；all-failed 顯示錯誤但頁殼可用。
- [ ] **Step 4:** 執行測試、typecheck、lint、build 並提交。

Commit: `feat: render source availability states`

**Acceptance:** 沒有把 error 當 empty；stale 資料必帶警告；來源清單逐一顯示狀態。

**Rollback:** revert Task 12 commit。

**Authorization dependency:** No。

---

### Task 13: Add SEO, Manifest, Structured Data, and Brand OG

**Goal:** 為非行情產品建立正確 metadata、canonical、manifest、sitemap、JSON-LD 與 OG。

**Dependencies:** Task 8–12。

**Files:**
- Create: `app/opengraph-image.tsx` — 使用 `ImageResponse` 產生品牌 OG，不含行情元素。
- Create: `lib/seo/structured-data.ts` — WebSite、CollectionPage、Organization JSON-LD。
- Create: `tests/seo-phase1.test.mjs`.
- Modify: `app/layout.tsx`.
- Modify: `app/manifest.ts`.
- Modify: `app/sitemap.ts`.
- Modify: `app/robots.ts`.
- Modify: `app/companies/page.tsx`.
- Modify: `app/companies/[code]/page.tsx`.

**Interfaces:**

```ts
export function websiteJsonLd(baseUrl: string): Record<string, unknown>;
export function companyJsonLd(company: CompanyDetailDto, canonicalUrl: string): Record<string, unknown>;
export function collectionJsonLd(name: string, canonicalUrl: string): Record<string, unknown>;
```

- [ ] **Step 1:** failing tests：品牌、副標題、canonical、OG 1200×630、JSON-LD 無行情資料、API 不進 sitemap。
- [ ] **Step 2:** 執行目標測試，預期 OG/structured-data missing。
- [ ] **Step 3:** 實作最小 metadata；只對資料完整且非 fixture 的公司頁輸出 Organization JSON-LD。
- [ ] **Step 4:** 執行測試、typecheck、lint、build 並提交。

Commit: `feat: add phase one metadata and social preview`

**Acceptance:** SEO 不暗示報價、投資建議或即時資料；manifest 品牌一致。

**Rollback:** revert Task 13 commit。

**Authorization dependency:** No；正式資料頁是否可索引由 Source status 控制。

---

### Task 14: Add Ingestion Contracts Without Connecting External Sources

**Goal:** 建立可測試的同步流程、部分成功與全部失敗語意，但只接受測試 fixture adapter。

**Dependencies:** Task 2–6、11。

**Files:**
- Create: `lib/ingestion/contracts.ts`.
- Create: `lib/ingestion/ingestion-service.ts`.
- Create: `lib/ingestion/adapters/fixture-adapter.ts`.
- Create: `tests/ingestion-service.test.mjs`.
- Modify: `worker/index.ts` — 只加入可注入的 scheduled handler 邊界，不註冊正式來源。

**Interfaces:**

```ts
export interface SourceAdapter<T> {
  sourceId: string;
  schemaVersion: string;
  fetchAndNormalize(source: SourceDefinition, signal: AbortSignal): Promise<T[]>;
}
export function createIngestionService(deps: {
  repositories: Repositories;
  adapters: ReadonlyMap<string, SourceAdapter<unknown>>;
  clock: () => string;
}): {
  run(sourceId: string): Promise<IngestionRun>;
  runMany(sourceIds: string[]): Promise<{ status: "success" | "partial" | "failed"; runs: IngestionRun[] }>;
};
```

- [ ] **Step 1:** failing tests：pending source 在 adapter 前被 blocked；單一失敗；部分成功；全部失敗；transaction 失敗不更新成功時間。
- [ ] **Step 2:** 執行 `node --test tests/ingestion-service.test.mjs`，預期 missing module。
- [ ] **Step 3:** 實作 orchestration；只有 fixture adapter；worker 不含正式 URL。
- [ ] **Step 4:** 執行測試、typecheck、lint、build 並提交。

Commit: `feat: add authorization-gated ingestion workflow`

**Acceptance:** 可完整測試 ingestion 狀態，但專案仍沒有正式外部資料 request。

**Rollback:** revert Task 14 commit。

**Authorization dependency:** No。

---

### Task 15: Complete Verification, Documentation, and the Manual Authorization Gate

**Goal:** 完成第一階段 fixture 版驗收，建立正式來源啟用前不可繞過的人工關卡。

**Dependencies:** Task 1–14。

**Files:**
- Create: `docs/data-source-approval-process.md` — 審核欄位、核准人、證據與撤銷流程。
- Create: `docs/phase1-acceptance.md` — 所有驗收結果與 fixture 限制。
- Create: `tests/no-unapproved-production-sources.test.mjs`.
- Modify: `README.md` — 第一階段非價格範圍、fixture 模式與未介接正式資料說明。
- Modify: `app/methodology/page.tsx` — 來源、更新、過期與授權狀態說明。
- Modify: `app/disclaimer/page.tsx` — 無行情、無投資建議。

**Interfaces:** 不新增 runtime interface；驗證 `listSourceDefinitions()` 中沒有未具完整人工欄位的 approved source。

- [ ] **Step 1: Write the final failing gate test**

測試 production definitions，並先要求尚未建立的核准流程文件存在：

```js
const approvalProcess = await readFile(
  new URL("../docs/data-source-approval-process.md", import.meta.url),
  "utf8",
);
assert.match(approvalProcess, /reviewEvidenceUrl/);
assert.match(approvalProcess, /historyRetentionStatus/);

for (const source of listSourceDefinitions()) {
  if (source.reviewStatus !== "approved") {
    assert.equal(source.resourceUrl, null);
    continue;
  }
  assert.ok(source.reviewedBy);
  assert.ok(source.reviewedAt);
  assert.ok(source.reviewEvidenceUrl);
  assert.ok(source.attribution);
  assert.equal(source.commercialUseStatus, "approved");
  assert.equal(source.reproductionStatus, "approved");
  assert.equal(source.cacheStatus, "approved");
  assert.equal(source.historyRetentionStatus, "approved");
}
```

- [ ] **Step 2: Run full verification before documentation**

Run:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
git status --short
```

Expected before the documentation update: gate test 因 `docs/data-source-approval-process.md` 尚不存在而 FAIL；若任何來源被意外啟用，也必須列出缺少的人工核准欄位。其他命令不得出現 Yahoo、行情欄位或未授權 request。

- [ ] **Step 3: Add the exact approval process and acceptance record**

`data-source-approval-process.md` 必須要求：dataset metadata URL、實際 resource URL、條款版本、商業利用判定、重製／修改／快取／歷史保存、顯名文字、人工審核人與日期。任何一欄缺少都不能將 SourceDefinition 改為 approved。

- [ ] **Step 4: Run final verification**

Run:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
```

Expected: 全部成功；工作樹只含 Task 15 文件與測試變更。

- [ ] **Step 5: Commit**

```powershell
git add README.md app/methodology/page.tsx app/disclaimer/page.tsx docs/data-source-approval-process.md docs/phase1-acceptance.md tests/no-unapproved-production-sources.test.mjs
git commit -m "docs: establish phase one authorization gate"
```

**Acceptance:** fixture 版第一階段完整通過；沒有正式來源介接；每個未核准來源保持 blocked。

**Rollback:** revert Task 15 commit。

**Authorization dependency:** No；本任務建立關卡，不核准來源。

---

## Separate Post-Approval Source Activation

正式來源啟用不是 Task 15 的一部分。每一個來源必須另開一個獨立任務與獨立 commit，且同時滿足：

1. 人工提供已核准的實際 resource URL。
2. 人工記錄授權條款版本及商業使用判定。
3. 人工記錄重製、修改、快取與歷史保存判定。
4. 人工核准顯名文字。
5. adapter 只輸出本計畫領域型別，不保留價格欄位。
6. 先以保存的最小合法 fixture 寫 failing contract test。
7. 正式 URL 只出現在對應 SourceDefinition，不出現在頁面、API 或 service。
8. 每個來源各自執行全套測試與獨立 commit，例如：
   - `feat: activate approved emerging company source`
   - `feat: activate approved listing application source`
   - `feat: activate approved otc application source`
   - `feat: activate approved ipo event source`
   - `feat: activate approved announcement source`

在人工批准個別來源之前，不得建立該來源的正式 adapter，也不得以目前 `lib/tracker.mjs` 或 `app/api/company/route.ts` 的既有 endpoint 當作默認合法來源。

## Execution Modes

### A. One task per review gate — Recommended

- 一次只執行 Task 1–15 中的一個任務。
- 完成該任務的目標測試、typecheck、lint，以及需要的 production build。
- 只提交該任務列出的檔案。
- 停止並等待人工審查，通過後才執行下一任務。

推薦 A，因為本計畫同時涉及永久禁止行情護欄、領域契約、儲存邊界與授權閘門。逐任務審查能在錯誤型別或依賴方向擴散前攔截，也能以單一 revert 安全回復。

### B. Two or Three Related Tasks per Batch

允許的批次只有：

- Tasks 2–3：領域型別與 Source Registry。
- Tasks 4–6：repository contract、memory fixture、D1 adapter。
- Tasks 7–9：公司 service、目錄、公司時間軸。
- Tasks 10–12：申請／IPO、health、狀態 UI。
- Tasks 13–15：SEO、ingestion 邊界、完整驗收。

每個 Task 仍需獨立 commit；整批完成後執行 `npm test`, lint, typecheck, build，再停止人工審查。不得把 Task 1 與其他任務併批，也不得把任何正式來源啟用放進批次。

## Final Self-Review Checklist

- [ ] 全文沒有未定義的 placeholder。
- [ ] 每個產品需求至少對應一個 Task。
- [ ] `Company`, `CompanyIdentifier`, `SourceDefinition`, `SourceAttribution`, `CompanyEvent`, `ListingApplication`, `IpoEvent`, `IngestionRun`, `SourceHealth`, `DataFreshness` 均有唯一 TypeScript 定義。
- [ ] Repository、service、DTO 與頁面使用的名稱一致。
- [ ] 每個 Task 都有 failing test、失敗預期、最小實作、通過命令、驗收、commit 與 rollback。
- [ ] 沒有價格、行情、會員、廣告、推播或追蹤清單。
- [ ] 沒有正式接入授權未確認的來源。
- [ ] 頁面與 API 不依賴 D1 SQL。
- [ ] 外部 payload 必須正規化後才進 repository/UI。
- [ ] 單一失敗、部分成功、全部失敗、空資料與過期均有測試。
- [ ] 未進行與第一階段無關的大型重構。
