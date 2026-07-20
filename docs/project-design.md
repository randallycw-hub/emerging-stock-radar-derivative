# 興債觀測網第一版產品與系統設計

狀態：待人工審查
日期：2026-07-20

## 品牌與定位

- 正式名稱：興債觀測網
- 固定副標題：興櫃公司、可轉債與上市櫃進度資訊
- 產品定位：台灣興櫃與可轉債事件雷達
- 產品定位不得取代正式名稱；不得以「興櫃雷達」作為網站品牌。

品牌必須一致出現在 layout metadata、SEO title template、description、manifest、Open Graph、首頁、導覽、頁尾、關於本站、README、package description、法律頁及測試。資料夾、repository 名稱及部署 project ID 保持不變。

## 第一版範圍

第一版只涵蓋：

1. 全部興櫃公司及其基本資料、產業、月營收與最近十二個月趨勢。
2. 全部國內轉換公司債與交換公司債的官方發行條件。
3. 可轉債發行公司；非興櫃發行人只保留最小資料。
4. 興櫃公司上市或上櫃申請進度。
5. 公司與可轉債的穩定識別關聯。
6. 依官方欄位整理的事件、狀態與提醒區間。
7. 官方來源、更新時間、健康狀態與資料新鮮度。
8. 經人工核准後的興櫃盤後日均價、日高、日低及成交量。
9. 版本控管、逐筆有官方來源的人工預定發債案件。
10. 只存於 localStorage 的公司及債券收藏。

不得擴張成涵蓋所有上市櫃公司的大型台股網站。禁止會員、登入、付款、訂閱、通知、原生 App、正式廣告、投資組合、交易紀錄、即時行情、五檔、成交明細、券商進出、技術分析、折溢價、轉換價值、理論價格、套利、目標價及預測報酬。

## 頁面與首頁

| 路由 | 責任 |
|---|---|
| `/` | 興櫃雷達、可轉債雷達、整合事件時間軸與來源狀態 |
| `/emerging` | 興櫃摘要、公司列表、搜尋與產業篩選 |
| `/emerging/[companyId]` | 基本資料、月營收、申請進度、相關債券、事件與可選盤後資料 |
| `/bonds` | 可轉債摘要、列表與搜尋 |
| `/bonds/[bondId]` | 發行條件、發行人、事件、狀態與提醒區間 |
| `/events` | 興櫃及可轉債事件總覽 |
| `/calendar` | 依日期排列的事件行事曆 |
| `/listing-applications` | 上市與上櫃申請進度 |
| `/planned-issues` | 人工審核的預計發行案件 |
| `/sources` | 來源、授權、資料日期、同步及健康狀態 |
| `/about` | 產品範圍、資料整理方式與品牌 |
| `/disclaimer` | 非投資建議及資料時效免責聲明 |
| `/privacy` | localStorage 與隱私政策 |
| `/terms` | 使用條款 |

首頁興櫃雷達呈現最近新增公司、月營收成長、連續年增、最近申請、最近事件及最新盤後資料日期；可轉債雷達呈現新掛牌、即將開始轉換、即將到期、即將進入賣回權日、最近餘額異動、預計發行及最新資料日期。未取得正式資料時只顯示可理解的無資料或待確認狀態。

## 資料流與分層

```text
已 APPROVED 的官方 OpenAPI
→ Source Adapter
→ RawSnapshot
→ Schema 驗證
→ 正規化
→ Repository
→ 新舊資料比對
→ 衍生事件、狀態與提醒區間
→ 網站資料庫
→ 應用服務
→ API
→ 頁面與 React 元件
```

- 頁面不得呼叫官方 OpenAPI 或直接寫 SQL。
- API route 不得依賴 D1 或特定資料庫。
- 外部資料結構不得直接傳到 UI。
- Repository 必須可替換；先以記憶體實作測試，正式部署前再確認 D1。
- 正式模式不得載入 mock 或 fixture。
- 現有 Vinext、Vite、Worker 結構保留；Worker 只負責組裝與同步入口。
- 金額及價格在資料層使用 decimal 字串或最小單位整數，不用 JavaScript 浮點數做財務運算。

## 領域模型

所有日期使用 ISO 8601；排程與顯示時區為 `Asia/Taipei`。

```ts
type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
type SourceHealth = "HEALTHY" | "DELAYED" | "PARTIAL" | "STALE" | "UNAVAILABLE";
type DataFreshness = "CURRENT" | "DELAYED" | "STALE" | "UNKNOWN";

interface OfficialSource {
  id: string;
  agency: string;
  datasetName: string;
  endpoint: string;
  licenseName: string;
  schemaVersion: string;
  approvalStatus: ApprovalStatus;
}

interface SourceAttribution {
  sourceId: string;
  sourceDatasetName: string;
  sourceUrl: string;
  sourceDataDate: string;
  sourcePublishedAt?: string;
  fetchedAt: string;
  normalizedAt: string;
  licenseName: string;
  schemaVersion: string;
}

interface CompanyIdentifier {
  kind: "TPExCompanyCode" | "TWSECompanyCode" | "UnifiedBusinessNumber";
  value: string;
  validFrom?: string;
  validTo?: string;
}

interface Company {
  id: string;
  identifiers: CompanyIdentifier[];
  name: string;
  shortName?: string;
  market: "EMERGING" | "TWSE" | "TPEX" | "PUBLIC" | "UNKNOWN";
  attribution: SourceAttribution;
}

interface EmergingCompanyProfile {
  companyId: string;
  industry?: string;
  registeredOn?: string;
  address?: string;
  phone?: string;
  websiteUrl?: string;
  issueShares?: string;
  attribution: SourceAttribution;
}

interface BondIssuerProfile {
  companyId: string;
  issuerCode: string;
  market: "TWSE" | "TPEX" | "EMERGING" | "PUBLIC" | "UNKNOWN";
  attribution: SourceAttribution;
}

interface MonthlyRevenue {
  companyId: string;
  yearMonth: string;
  currentMonthRevenue: string;
  previousMonthRevenue?: string;
  priorYearMonthRevenue?: string;
  monthOverMonthPercent?: string;
  yearOverYearPercent?: string;
  cumulativeRevenue?: string;
  cumulativeYearOverYearPercent?: string;
  attribution: SourceAttribution;
}

interface EndOfDayMarketData {
  companyId: string;
  marketDate: string;
  dailyAveragePrice: string;
  dailyHighPrice?: string;
  dailyLowPrice?: string;
  lastTradePrice?: string;
  transactionVolume?: string;
  attribution: SourceAttribution;
}

interface BondIssue {
  id: string;
  bondCode: string;
  issuerCompanyId: string;
  bondKind: "CONVERTIBLE" | "EXCHANGEABLE";
  shortName: string;
  issueDate: string;
  listingDate?: string;
  maturityDate: string;
  issueAmount?: string;
  outstandingAmount?: string;
  couponRate?: string;
  guaranteed?: boolean;
  guaranteeDescription?: string;
  initialConversionPrice?: string;
  conversionPeriodStartDate?: string;
  conversionPeriodEndDate?: string;
  putOptionDate?: string;
  putPrice?: string;
  underwriter?: string;
  trustee?: string;
  offeringMethod?: string;
  attribution: SourceAttribution;
}

interface BondBalanceSnapshot {
  bondId: string;
  balanceDate: string;
  outstandingAmount: string;
  changeReason?: string;
  attribution: SourceAttribution;
}

interface ListingApplication {
  id: string;
  companyId: string;
  targetMarket: "TWSE" | "TPEX";
  appliedOn: string;
  status: string;
  statusUpdatedOn?: string;
  attribution: SourceAttribution;
}

interface CompanyEvent {
  id: string;
  companyId: string;
  kind: "MARKET_IDENTITY_CHANGED" | "LISTING_APPLICATION" | "LISTING_REVIEW_CHANGED";
  occurredOn: string;
  title: string;
  attributions: SourceAttribution[];
}

interface BondEvent {
  id: string;
  bondId: string;
  kind: "LISTED" | "CONVERSION_STARTED" | "CONVERSION_ENDED" | "MATURED" | "PUT_DATE_REACHED" | "BALANCE_CHANGED";
  occurredOn: string;
  title: string;
  attributions: SourceAttribution[];
}

type BondStatus =
  | "CONVERSION_NOT_STARTED"
  | "CONVERSION_ACTIVE"
  | "CONVERSION_ENDED"
  | "MATURING_SOON"
  | "MATURED"
  | "APPLICATION_ACTIVE"
  | "AWAITING_OFFICIAL_CONFIRMATION";

interface BondAlertWindow {
  bondId: string;
  kind: "CONVERSION_START_30D" | "CONVERSION_END_30D" | "MATURITY_30D" | "MATURITY_60D" | "MATURITY_90D" | "PUT_DATE_30D";
  startsOn: string;
  endsOn: string;
}

interface DerivedEvent {
  id: string;
  entityId: string;
  derivedAt: string;
  ruleVersion: string;
  notice: "本事件由興債觀測網依官方日期欄位自動整理。";
}

interface ManualPlannedIssue {
  id: string;
  issuerName: string;
  issuerCode: string;
  status: "filed" | "supplement_required" | "suspended" | "withdrawn" | "revoked" | "issued";
  expectedEffectiveDate?: string;
  effectiveRegistrationSuspended: boolean;
  supplementRequired: boolean;
  withdrawn: boolean;
  revoked: boolean;
  officialAgency: string;
  officialUrl: string;
  officialPublishedOn: string;
  createdOn: string;
  lastReviewedOn: string;
  reviewerNote?: string;
}
```

另有 `IngestionRun`（來源、時間、結果及筆數）及 `RawSnapshot`（來源、取得時間、HTTP 狀態、資料日期、回應雜湊、筆數、schema 版本、是否完整成功）。穩定 ID 以官方代碼組合，不以名稱作唯一鍵。來源、目前狀態、歷史事件及提醒區間分開保存。

## 價格與衍生資料語意

- `initialConversionPrice` 與 `putPrice` 是契約欄位，不是行情。
- 興櫃沒有正式收盤價；`dailyAveragePrice` 只能顯示為「當日加權平均成交價」或「日均價」。
- 所有盤後欄位顯示資料日期、官方時間、擷取時間、來源及「盤後資料，非即時行情」。
- 不是最新交易日的資料不得稱為今日價格。
- 十二個月趨勢、連續年增及所有自動事件均標示本站整理／計算依據與時間。
- 個別可轉債盤後行情沒有 APPROVED 來源，第一版顯示：「盤後價格資料來源確認中，目前僅提供官方發行條件與事件資訊。」

## 資料異常

正常顯示來源與時間；延遲顯示最後成功時間；部分成功保留可用區塊；過期保留最後成功資料並警示；授權待確認不發布正式資料；來源停止不切換未授權來源。API 失敗不得刪除最後成功資料或顯示 mock。

## 本機收藏

只收藏興櫃公司與債券，資料存 localStorage、不登入、不跨裝置、不上傳。UI 明示清除瀏覽器資料後可能消失，並對 JSON 損壞、版本不符及 storage 不可用提供容錯。
