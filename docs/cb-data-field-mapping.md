# 可轉換／交換債欄位對映

候選來源：櫃買中心 `bond_ISSBD5_data`。來源目前為 `PENDING`，本文件只定義正規化規格，不授權正式介接。

| 外部欄位 | 內部欄位 | 型別／轉換 | 必填 | 語意 |
|---|---|---|---|---|
| `BondCode` | `bondCode` | trim 後字串 | 是 | 官方債券代碼 |
| `IssuerCode` | `issuerIdentifier.value` | 字串 | 是 | 發行人公司代號 |
| `IssuerName` | `issuerName` | trim 後字串 | 是 | 僅供識別對映，不作公司唯一鍵 |
| `BondType` | `bondKind` | 明確映射至 `CONVERTIBLE` 或 `EXCHANGEABLE` | 是 | 無法映射則拒絕該筆 |
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
| `ListingStatus` | `listingStatus` | 枚舉或原始狀態字串 | 否 | 掛牌狀態 |
| `Underwriter` | `underwriter` | 字串 | 否 | 承銷機構 |
| `Trustee` | `trustee` | 字串 | 否 | 受託人 |
| `OutstandingChangeDate` | `outstandingChangeDate` | `YYYY-MM-DD` | 否 | 最近餘額變動日期 |
| `OutstandingChangeDescription` | `outstandingChangeReason` | 字串 | 否 | 最近餘額變動原因 |
| `OfferingMethod` | `offeringMethod` | 字串 | 否 | 募集方式 |
| `Date` | `sourcePublishedOn` | `YYYY-MM-DD` | 是 | 來源資料日期 |

每筆資料另加 `SourceAttribution`：`sourceId`、`sourceRecordId`（優先為債券代碼加來源日期）、`originalUrl`、`publishedAt`、`retrievedAt`、`licenseName`、`attributionText`。

## 識別與去重

- `Bond.id = "bond:" + bondCode`。
- 發行人以公司正式代碼對映，不以名稱連結。
- 同一債券代碼多筆時，依來源發布日保留最新快照；差異保留於匯入稽核紀錄。
- 缺少債券代碼、發行人代碼、種類、發行日或到期日即拒絕正式發布。
- 來源消失不等於債券失效；需依 `ListingStatus`、到期日或連續多次缺漏規則判斷。

## 禁止欄位與語意

不得在此模型加入一般化的 `price`、`quote`、`closePrice`、`change`、`changePercent`、`volume`、`candlestick`、`technicalIndicator`。`initialConversionPrice` 與 `putPrice` 必須完整命名，不得縮寫為一般 `price`。所有金額、利率及契約價格以 decimal 字串正規化，不能用 JavaScript 浮點數進行財務運算。

個別可轉債日終行情需另有已 `APPROVED` 的官方資料源及獨立模型；目前無合格來源，因此不實作。
