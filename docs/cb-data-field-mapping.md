# 可轉換／交換債欄位對映

來源：櫃買中心 `bond_ISSBD5_data`；政府資料集 11406。2026-07-20 已依 Swagger、資料集、OGL 1.0 與實際欄位改列 `APPROVED`。批准只表示可在 Phase 5 依本白名單建立 adapter，本次文件審查不介接資料。

| 外部欄位 | 內部欄位 | 型別／轉換 | 必填 | 語意 |
|---|---|---|---|---|
| `BondCode` | `bondCode` | trim 後非空字串；空值轉為 `undefined` | 否 | 官方債券代碼；官方私募債紀錄可能未提供 |
| `IssuerCode` | `issuerIdentifier.value` | 字串 | 是 | 發行人公司代號 |
| `IssuerName` | `issuerName` | trim 後字串 | 是 | 僅供識別對映，不作公司唯一鍵 |
| `BondType` | `sourceBondTypeCode` | trim 後字串 | 是 | 先保存官方種類代碼；Phase 5 取得官方代碼表後才能映射 `bondKind` |
| `SeriesNumber` | `seriesNumber` | trim 後字串 | 是 | 債券期別，也是空代碼紀錄的複合識別欄位 |
| `TrancheNumber` | `trancheNumber` | trim 後字串 | 否 | 債券別，也是空代碼紀錄的複合識別欄位 |
| `ShortName` | `shortName` | 字串 | 是 | 債券簡稱 |
| `IssueDate` | `issueDate` | 正規化為 `YYYY-MM-DD` | 是 | 發行日 |
| `MaturityDate` | `maturityDate` | `YYYY-MM-DD` | 是 | 到期日 |
| `IssueAmount` | `issueAmount` | 十進位數值及明確單位 | 否 | 發行總額 |
| `OutstandingAmount` | `outstandingAmount` | 十進位數值及明確單位 | 否 | 流通餘額，不是成交量 |
| `CouponRate` | `couponRate` | decimal 字串或原始條款字串 | 否 | 票面利率 |
| `Guaranteed` | `guaranteed` | 明確映射為 boolean | 否 | 有無擔保 |
| `GuaranteeDescription` | `guaranteeDescription` | 字串 | 否 | 擔保情形 |
| `Conversion/ExchangePriceAtIssuance` | `initialConversionPrice` | 正數 decimal | 否 | 發行時契約轉換／交換價格，不是行情 |
| `PutOptionDate` | `putOptionDate` | `YYYY-MM-DD` | 否 | 賣回權日期 |
| `PutOptionPrice` | `putPrice` | 正數 decimal | 否 | 契約賣回價格，不是行情 |
| `Conversion/ExchangePeriodStartDate` | `conversionPeriodStartDate` | `YYYY-MM-DD` | 否 | 轉換／交換期間起日 |
| `Conversion/ExchangePeriodEndDate` | `conversionPeriodEndDate` | `YYYY-MM-DD` | 否 | 轉換／交換期間迄日 |
| `ListingDate` | `listingDate` | `YYYY-MM-DD` | 否 | 掛牌日期 |
| `Underwriter` | `underwriter` | 字串 | 否 | 承銷機構 |
| `Trustee` | `trustee` | 字串 | 否 | 受託人 |
| `OutstandingChangeDate` | `outstandingChangeDate` | `YYYY-MM-DD` | 否 | 最近餘額變動日期 |
| `OutstandingChangeDescription` | `outstandingChangeReason` | 字串 | 否 | 最近餘額變動原因 |
| `OfferingMethod` | `offeringMethod` | 字串 | 否 | 募集方式 |
| `Date` | `sourcePublishedOn` | `YYYY-MM-DD` | 是 | 來源資料日期 |

每筆資料另加 `SourceAttribution`：`sourceId`、`sourceRecordId`（優先用債券代碼；空值時用複合識別）、`originalUrl`、`publishedAt`、`retrievedAt`、`licenseName`、`attributionText`。

## 識別與去重

- 有債券代碼時：`Bond.id = "bond:" + bondCode`。
- `BondCode` 空白時，使用 `IssuerCode + BondType + SeriesNumber + TrancheNumber + IssueDate` 形成穩定來源識別；UI 顯示「官方資料未提供債券代碼」，不得虛構代碼。
- 發行人以公司正式代碼對映，不以名稱連結。
- 同一債券代碼多筆時，依來源發布日保留最新快照；差異保留於匯入稽核紀錄。
- 缺少發行人代碼、種類、發行日或到期日即拒絕正式發布；債券代碼空白時必須有完整複合識別欄位。
- `BondType` 的數值代碼對應尚未由本輪資料集頁說明；Phase 5 必須取得官方代碼定義，否則只可保存 raw snapshot，不得正式發布 `bondKind`。
- 來源消失不等於債券失效；只有正式狀態資料、到期日或連續完整快照規則可改變狀態。

## 禁止欄位與語意

不得在此模型加入一般化的 `price`、`quote`、`closePrice`、`change`、`changePercent`、`volume`、`candlestick`、`technicalIndicator`。`initialConversionPrice` 與 `putPrice` 必須完整命名，不得縮寫為一般 `price`。所有金額、利率及契約價格以 decimal 字串正規化，不能用 JavaScript 浮點數進行財務運算。

個別可轉債日終行情需另有已 `APPROVED` 的官方資料源及獨立模型；目前無合格來源，因此不實作。

## 白名單邊界

只允許本表及 Source Registry 列出的發行、餘額、擔保、契約價格、轉換期間、承銷、受託、募集方式與餘額異動欄位。評等、幣別、還本說明、計付息細節及其他 Swagger 欄位不在第一版核准範圍。此來源不可用來產生市場成交價格。
