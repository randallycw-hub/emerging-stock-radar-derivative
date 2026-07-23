# 資料集 11406 實作前驗證證據

覆核時間：2026-07-23T05:17:00.000Z

Fixture schema：`dataset-11406-raw-v1`

Fixture version：`official-minimal-v1`

本文件只保存資料來源契約與人工覆核結論，不啟用 adapter、repository、排程、正式頁面或 production resource，也不修改 Source Registry 的核准狀態。

## 官方資料集、授權與顯名

- 正式資料集：data.gov.tw 11406「轉(交)換債發行資料下載」。
- 詮釋資料頁：https://data.gov.tw/dataset/11406
- 提供機關：金融監督管理委員會證券期貨局。
- 授權：政府資料開放授權條款－第1版。
- 更新頻率：每日。
- 正式顯名文字：`金融監督管理委員會證券期貨局｜轉(交)換債發行資料下載｜政府資料開放授權條款－第1版`。正式使用時仍須附資料集頁、官方資料日期、本站擷取時間及「資料經興債觀測網整理」。

## OAS 與 resource 對應

| 角色 | URL／operation | HTTP 證據 | 完整 response SHA-256 | 列數／資料日期 |
|---|---|---|---|---|
| TPEx Swagger | `https://www.tpex.org.tw/openapi/swagger.json` | 200；`application/json`；取得於 `2026-07-23T05:15:35.743Z` | `05af7755d0d528626c104f7a8ccd7b00c6a0cf228d30bcb4669020e514eb0c7e` | `/bond_ISSBD5_data` 的 summary 為正式資料集名稱，schema ref 為 `#/components/schemas/bond_ISSBD5_data` |
| 官方 CSV 候選 | `https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv` | 200；`application/octet-stream`；取得於 `2026-07-23T05:15:35.872Z` | `175788925cef7e7cc6e5daa53eee09aeafecf99248ec9b314c4cde7f8d3b23f6` | 416 列；`20260723` |
| OpenAPI JSON 候選 | `https://www.tpex.org.tw/openapi/v1/bond_ISSBD5_data` | 200；`application/json`；取得於 `2026-07-23T05:15:35.964Z` | `7bdeb4d0838598e3dd462b96157795cc5159a03afadb2043c94fa29a4a66401e` | 415 列；`20260722` |

Swagger、CSV 與 JSON 均為官方 TPEx HTTPS resource。CSV 與 JSON 雖於相鄰時間取得，資料日期與列數不同，顯示更新並不同步。因此本輪只驗證兩者的白名單欄位角色可以映射到同一 source schema，不宣稱同次內容逐列等價，也不把任一 resource 當作另一個失敗時的 fallback。

## 最小官方 Fixture

兩個 Fixture 都只保留官方 `IssuerCode` 00009815 與 3522：

- 00009815：空 `BondCode`／`ListingDate`、官方無擔保代碼、目前餘額小於發行總額。
- 3522：有債券代碼、官方有擔保代碼與擔保說明、單一賣回權，以及完整最近餘額異動日／原因。

原始 response 的 42 欄裁為 26 個核准欄位，並刪除其餘列；保留列的 cell 原值未改寫。排除的 16 個官方 CSV 欄位為：`計付息方式`、`計息次數`、`付息次數`、`債券評等機構`、`債券評等等級`、`發行公司評等機構`、`發行公司評等等級`、`擔保機構評等機構`、`擔保機構評等等級`、`掛牌地點`、`還本FLAG`、`還本敘述`、`發行期限年`、`發行期限月`、`上市櫃否`、`幣別`。這 16 欄都不在 Fixture header。

| Fixture | repository SHA-256 | 列數 | 內容 |
|---|---|---:|---|
| `csv-minimal.csv` | `3373ab98ef8a2247c44a45e5c61fb4c8291f63abe24c3d669a4e01e893ea34b4` | 2 | CSV 白名單 header 保留官方 `債券擔保情形 ` 尾空格；共兩列官方值 |
| `openapi-minimal.json` | `6a64f4315815ff91e116fbe7269ca8d1503ae8513e4c79a97ee67abd128292f3` | 2 | 26 個 OAS key；共兩列官方值 |

`metadata.json` 分別記錄完整 response hash 與裁切後 Fixture hash；`fixture-metadata` 測試會離線驗證 hash、列數、版本、人工覆核、最小化及 CSV 白名單欄位。

## CSV／OAS alias mapping

| 內部角色 | CSV alias | OAS key |
|---|---|---|
| `officialDataDate` | 資料日期 | `Date` |
| `issuerCode` | 機構代碼 | `IssuerCode` |
| `issuerName` | 機構名稱 | `IssuerName` |
| `bondCode` | 債券代碼 | `BondCode` |
| `sourceBondTypeCode` | 債券種類 | `BondType` |
| `seriesNumber` | 債券期 | `SeriesNumber` |
| `trancheNumber` | 債券別 | `TrancheNumber` |
| `shortName` | 債券簡稱 | `ShortName` |
| `issueDate` | 發行日期 | `IssueDate` |
| `listingDate` | 掛牌日期 | `ListingDate` |
| `maturityDate` | 到期日期 | `MaturityDate` |
| `issueAmount` | 發行總額 | `IssueAmount` |
| `outstandingAmount` | 目前餘額 | `OutstandingAmount` |
| `couponRate` | 票面利率 | `CouponRate` |
| `securedText` | 有無擔保 | `Guaranteed` |
| `securityDescription` | 債券擔保情形（官方 CSV header 尾空格） | `GuaranteeDescription` |
| `initialConversionPrice` | 發行時轉換價格 | `Conversion/ExchangePriceAtIssuance` |
| `conversionStartDate` | 轉換期間起 | `Conversion/ExchangePeriodStartDate` |
| `conversionEndDate` | 迄 | `Conversion/ExchangePeriodEndDate` |
| `putDatesText` | 賣回權日期 | `PutOptionDate` |
| `putPrice` | 賣回權價格 | `PutOptionPrice` |
| `underwriter` | 承銷機構 | `Underwriter` |
| `trustee` | 受託人 | `Trustee` |
| `outstandingChangeDate` | 最近餘額變動日 | `OutstandingChangeDate` |
| `outstandingChangeReason` | 最近餘額變動原因 | `OutstandingChangeDescription` |
| `offeringMethod` | 募集方式 | `OfferingMethod` |

Parser 對上述 alias 採封閉 schema：缺欄、額外欄、非字串 cell、空資料集或同一 snapshot 重複債券 identity 都拒絕整份輸入。

## 正規化範圍與拒絕條件

支援：

- 日期 `YYYYMMDD`、`YYYY-MM-DD`、民國 `YYY/MM/DD`，正規化為 ISO 日曆日。
- optional 空字串、空白、`-`、`—`、`－` 正規化為未提供；required 欄位遇上述值即拒絕。
- 金額為非負 plain decimal、正確千分位逗號，以及單一明列後綴 `元`／`仟元`；`仟元` 以十進位精確乘以 1000。
- 票面利率可帶單一 `%`；發行時轉換價格與賣回權價格只有正數才輸出為契約欄位。
- 官方 `Guaranteed` 只接受 `1`（有擔保）與 `2`（無擔保）；`1` 必須有擔保說明。
- 有債券代碼時使用 `bond:<normalized code>`；無碼時只以發行人代碼、官方債券種類、期、別、發行日期的確定性 SHA-256 組合識別。
- 最近餘額異動日與原因必須成對。

拒絕：

- 無效／負數金額、目前餘額大於發行總額、日期無效、生命週期日期順序錯誤、複合 identity 不完整。
- 多重賣回日期與價格數量不一致。
- 多重賣回價格正規化後不完全相同。`NormalizedBondIssue11406` 只有單一 `putPrice`，因此不同價格屬明確 unsupported，不挑選或捏造代表值。
- 一般行情、報價、成交量、收盤價、發行人市場推測，以及禁用的可轉債市場 endpoint。

目前兩個官方 response 都沒有多重 `PutOptionDate`，金額也都是純數字，沒有 `元`／`仟元` 樣本。多重賣回日、中文單位、ROC 日期與錯誤案例只存在名稱及註解明示的 test-local synthetic rows，不混入官方 Fixture。

## 離線測試與升級建議

所有 contract tests 只讀 repository Fixture；不發出 HTTP、DNS 或其他官方網站連線。

建議目前保持 `APPROVED_FOR_V1_DESIGN`，不要僅憑本證據自動升級 `VERIFIED_FOR_IMPLEMENTATION`。至少仍需人工決定唯一主要 resource、處理 CSV／JSON 更新不同步的發布政策，並確認官方多重賣回日期及中文金額單位的真實樣本或明確官方規格；債券種類代碼語意也仍須人工覆核。若人工決策完成，可另案更新 Registry，本 Task 不修改 Registry。
