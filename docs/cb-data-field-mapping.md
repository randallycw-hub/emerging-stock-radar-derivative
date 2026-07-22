# 可轉換／交換公司債欄位對映

> 本文件目前僅為設計 mapping。四個循序核准階段不包含獨立暫停狀態 `SUSPENDED`；本輪文件核准不等於來源啟用、adapter 實作、遠端資源建立或 production 核准。

資料集 11406「轉(交)換債發行資料下載」目前為 `APPROVED_FOR_V1_DESIGN`，不是 implementation 或 production 核准。候選資源為官方 CSV `ISSBD5_data.csv` 與 TPEx OpenAPI `/bond_ISSBD5_data`；正式 adapter 前須保存同日最小合法樣本、驗證兩者 schema，再只選一個主要 resource。

## V1 欄位

| 官方欄位 | 內部欄位 | 規則 | 可得性 |
|---|---|---|---|
| 資料日期 | `officialDataDate` | `YYYY-MM-DD`，Asia/Taipei 日曆日 | 明列 |
| 機構代碼 | `issuerCode` | trim；必要 | 明列 |
| 機構名稱 | `issuerName` | trim；不作唯一鍵 | 明列 |
| 債券代碼 | `bondCode` | trim；可空 | 明列 |
| 債券種類 | `sourceBondTypeCode` | 保留官方值；需官方代碼表才映射 | 明列、語意待驗證 |
| 債券期／債券別 | `seriesNumber`／`trancheNumber` | 空代碼時參與複合鍵 | 明列 |
| 債券簡稱 | `shortName` | 必要 | 明列 |
| 發行日期 | `issueDate` | 日期 | 明列 |
| 掛牌日期 | `listingDate` | 可空日期 | 明列 |
| 到期日期 | `maturityDate` | 日期且不得早於發行日 | 明列 |
| 發行總額 | `issueAmount` | 非負 decimal＋單位 | 明列 |
| 目前餘額 | `outstandingAmount` | 非負 decimal＋單位；不是成交量 | 明列 |
| 票面利率 | `couponRate` | decimal 或經核准的條款字串 | 明列 |
| 有無擔保／擔保情形 | `secured`／`securityDescription` | 官方值明確 mapping | 明列 |
| 發行時轉換價格 | `initialConversionPrice` | 正 decimal；契約欄位 | 明列 |
| 轉換期間起／迄 | `conversionStartDate`／`conversionEndDate` | 可空日期，順序驗證 | 明列 |
| 賣回權日期 | `putDates` | 官方格式可能含多日，fixture 決定解析規則 | 明列、格式待驗證 |
| 賣回權價格 | `putPrice` | 正 decimal；契約欄位 | 明列 |
| 承銷機構 | `underwriter` | trim | 明列 |
| 受託人 | `trustee` | trim | 明列 |
| 最近餘額變動日 | `outstandingChangeDate` | 可空日期 | 明列 |
| 最近餘額變動原因 | `outstandingChangeReason` | trim | 明列 |
| 募集方式 | `offeringMethod` | 保留官方文字 | 明列 |
| 發行公司市場別 | `issuerMarket` | 不由 11406 單獨推測；需已核准公司來源 | 非可靠直接欄位 |
| 本站擷取日期 | `fetchedAt` | UTC ISO datetime | 本站 metadata |

使用者提出的 24 個候選欄位中，債券代碼、名稱、發行人、日期、金額、餘額、利率、擔保、契約價格、轉換期間、賣回權、承銷、受託、異動、募集方式與來源時間均有對應；「發行公司市場別」必須跨來源判定，不得假設。

## 識別、去重與拒絕條件

- 有代碼：`bondId = "bond:" + normalizedBondCode`。
- 無代碼：使用 `issuerCode + sourceBondTypeCode + seriesNumber + trancheNumber + issueDate` 的 hash；UI 明示官方未提供代碼。
- 同 snapshot 重複鍵、發行人代碼缺失、發行／到期日無效或複合鍵不足時，整個 run 不得發布。
- 同債券跨 snapshot 以 published snapshot ID 留存版本；不覆寫歷史。
- source 消失不等於到期、下櫃或餘額歸零。
- 禁止一般 `price`、`quote`、`closePrice`、`volume`、`change`、行情、轉換價值及套利欄位。

## 升級 `VERIFIED_FOR_IMPLEMENTATION`

需完成：資料集頁與 resource 再核對、帶取得日期與 hash 的最小 CSV/OpenAPI fixture、source schema、所有白名單 mapping、債券種類代碼、賣回日格式、decimal 單位、錯誤樣本、顯名文字與授權證據。預設測試不得連線官方網站。
