# 資料集 94025 實作前驗證證據

覆核時間：2026-07-23T06:12:00.000Z

Fixture schema：`dataset-94025-raw-v1`

Fixture version：`official-minimal-v1`

本文件只保存資料來源契約、最小 fixture 與人工覆核結論，不啟用 adapter、repository、排程、正式頁面或 production resource，也不修改 Source Registry 的核准狀態。

## 官方資料集、授權與顯名

- 正式資料集：data.gov.tw 94025「興櫃公司每月營業收入彙總表」。
- 詮釋資料頁：https://data.gov.tw/dataset/94025
- 提供機關：金融監督管理委員會證券期貨局。
- 授權／費用：政府資料開放授權條款－第1版／免費。
- 更新頻率：每 1 月。
- 正式顯名文字：`金融監督管理委員會證券期貨局｜興櫃公司每月營業收入彙總表｜政府資料開放授權條款－第1版`。正式使用時仍須附資料集頁、資料年月、本站擷取時間及本站整理聲明。

## Metadata、OAS 與 resource 角色

| 角色 | URL／operation | HTTP 證據 | 完整 response SHA-256 | 結論 |
|---|---|---|---|---|
| data.gov metadata | `https://data.gov.tw/dataset/94025` | 本輪由人工只讀覆核 | 不適用 | 證明正式名稱、提供機關、OGL 第1版、免費、每 1 月及直接 CSV 連結 |
| TWSE OAS | `https://openapi.twse.com.tw/v1/swagger.json` | 200；`application/json`；取得於 `2026-07-23T06:10:08.987Z` | `2c2cecccb7a220ac9e263228a7659aa49b1ada5aea397650e601ad3dfcc48043` | TWSE OAS 目前沒有 `t187ap05_R` operation，不能單獨證明 JSON schema |
| TPEx Swagger | `https://www.tpex.org.tw/openapi/swagger.json` | 200；`application/json`；取得於 `2026-07-23T06:10:09.114Z` | `05af7755d0d528626c104f7a8ccd7b00c6a0cf228d30bcb4669020e514eb0c7e` | 有 `/t187ap05_R`；summary 為正式名稱；schema ref 為 `#/components/schemas/t187ap05_R`，共 14 properties |
| 官方 CSV | `https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv` | 200；`text/csv`；66,187 bytes；取得於 `2026-07-23T06:10:42.382Z` | `f9bc7d149bb5a602fc798f0f1f5f007d0f8eff1aa6cd2a68f80084636249ac44` | 354 列 |
| OpenAPI JSON | `https://www.tpex.org.tw/openapi/v1/t187ap05_R` | 200；`application/json`；196,825 bytes；取得於 `2026-07-23T06:10:42.739Z` | `7a4b973dabad31d3073cf73ad5218b35d33652ce738b346938fb3b2bc8cbc73d` | 354 列 |

詮釋資料、OAS 文件及兩個資料 resource 是不同角色，主機也不等同提供機關。TWSE OAS 缺 operation，而 TPEx Swagger 才能提供相符的 operation 與 schema 證據；若要將 TPEx Swagger 接受為 `t187ap05_R` 的 schema 證據，仍須人工明確接受這個跨官方主機的文件風險。

正式選擇固定為 primaryResourceRole: `csv`。data.gov 頁直接連結此 CSV，故它是建議的唯一主要 resource。OpenAPI 只供本次 schema 與三列 cell 的離線比較，不是備援；正式執行若 CSV 失敗，不得自動 fallback 到 OpenAPI 或任何其他來源。

## 官方欄位、Fixture 最小化與 parser 邊界

TPEx Swagger 的 14 個 properties 與本次完整官方資料欄位為：

1. 出表日期
2. 資料年月
3. 公司代號
4. 公司名稱
5. 產業別
6. 營業收入-當月營收
7. 營業收入-上月營收
8. 營業收入-去年當月營收
9. 營業收入-上月比較增減(%)
10. 營業收入-去年同月增減(%)
11. 累計營業收入-當月累計營收
12. 累計營業收入-去年累計營收
13. 累計營業收入-前期比較增減(%)
14. 備註

Registry mapping 排除的是 normalized／published model 的 `備註`，不是 transport audit 欄位。CSV 與 JSON fixture 都由完整 354 列 response 保留公司代號 1260、2245、4172 三列及完整 14 欄，僅刪除其餘 351 列；所有 cell 原值未改寫。三筆備註依序為 `-`、`-`、`主係普癌汰與顯影劑銷售消長所致。`。raw fixture 與 strict parser 以 `noteText` 保存備註供來源稽核，但 `normalize94025Row` 明確不輸出 `noteText`，既有 published model 也不接收它。本 Task 不建立 adapter。

| Fixture | repository SHA-256 | 列數 | 內容 |
|---|---|---:|---|
| `csv-minimal.csv` | `f4937f9f2a6832087521cbe58aa820ecb9cf32a3733279e92884146f039cd45b` | 3 | 完整 14 個中文官方 header；三列官方 cell 原值 |
| `openapi-minimal.json` | `5e120121939459710a5ff222f71c74dd86a72c56c58bb053c42bceb346e7f46e` | 3 | 與 CSV 完全相同的 14 個中文 key 與三列官方 cell 原值 |

`metadata.json` 以 `{metadataPageUrl, oasUrl, csv, openapi}` 容器分開保存角色；`csv` 與 `openapi` 各自符合嚴格 `FixtureMetadata`。兩者都記錄完整 response hash、最小 fixture hash、354／3 列數、人工覆核、最小化理由及抽樣方法。因既有 metadata contract 要求 `excludedFields` 非空，這裡明列未保存的個資類別 `個人姓名`、`電話`、`電子郵件`；三列備註已人工確認只含公司層級營收說明，不含聯絡人個資。

## 14 欄共同 alias mapping

官方 CSV header 與 OpenAPI JSON key 在本次資料完全相同，兩種 parser 都只接受以下精確 alias：

| 官方 alias | Source 欄位 | Normalized 欄位 |
|---|---|---|
| 出表日期 | `sourcePublishedOn` | `sourcePublishedOn` |
| 資料年月 | `yearMonth` | `yearMonth` |
| 公司代號 | `companyCode` | `companyCode` |
| 公司名稱 | `companyName` | `companyName` |
| 產業別 | `industryName` | `industryName` |
| 營業收入-當月營收 | `currentMonthRevenue` | `currentMonthRevenue` |
| 營業收入-上月營收 | `previousMonthRevenue` | `previousMonthRevenue` |
| 營業收入-去年當月營收 | `priorYearMonthRevenue` | `priorYearMonthRevenue` |
| 營業收入-上月比較增減(%) | `monthOverMonthPercent` | `monthOverMonthPercent` |
| 營業收入-去年同月增減(%) | `yearOverYearPercent` | `yearOverYearPercent` |
| 累計營業收入-當月累計營收 | `cumulativeRevenue` | `cumulativeRevenue` |
| 累計營業收入-去年累計營收 | `priorYearCumulativeRevenue` | `priorYearCumulativeRevenue` |
| 累計營業收入-前期比較增減(%) | `cumulativeYearOverYearPercent` | `cumulativeYearOverYearPercent` |
| 備註 | `noteText` | 不輸出；只供 raw audit |

Contract test 使用 14 個唯一 sentinel 證明 alias 沒有語意對調；改名 alias 與未知 own alias 都拒絕，`constructor`、`toString`、`__proto__` 不能藉 prototype 通過，繼承而非 own 的必要 alias 也視為缺欄。CSV 與 OpenAPI fixture 解析後逐欄等價；comparison 對兩邊各自以完整 14 欄白名單計算缺欄，再以 `yearMonth + companyCode` 配對逐欄比較，因此共同缺欄、synthetic 語意交換與 row-set 不同都回報不等價。缺欄、額外欄、非字串 cell、空資料集及相同 identity 重複 key 都拒絕整份 parser 輸入。

## 正規化與拒絕條件

支援：

- `出表日期`：民國 `YYYMMDD`、西元 `YYYYMMDD`、ISO `YYYY-MM-DD`，輸出有效 ISO 日期。
- `資料年月`：民國 `YYYMM`、西元 `YYYYMM`、ISO `YYYY-MM`，月份只允許 01–12。
- 正規化後 `yearMonth` 不得晚於 `sourcePublishedOn` 所在月份；歷史月份允許。
- 必要欄位：公司代號、公司名稱、產業別、兩個資料日期及當月營收。
- optional 數值的純空白、`-`、`--`、`－` 轉為未提供。
- 營收接受非負 plain decimal 與正確千分位；百分比接受正負號、全形負號及單一末尾 `%`；輸出 canonical decimal。
- 百分比只保存官方值，不由營收重算。
- `revenueUnit` 固定明列為官方資料契約的 `仟元`。

拒絕：

- 無效逗號分組、embedded unit、括號負數、尾端負號、多重 `%`、無效日期、必填公司 identity 的 em dash，以及全形／半形非白名單破折號。
- 負營收。
- `cumulativeRevenue < currentMonthRevenue`。
- 1 月在兩值皆提供時 `cumulativeRevenue !== currentMonthRevenue`。

本次官方三列沒有千分位、`%` 符號、西元年月、破折號營收或 embedded unit；這些格式只存在名稱及註解明示的 test-local synthetic rows，沒有新增 synthetic fixture。

累計限制 concern：上述兩條只攔截顯然算術矛盾；官方若有更正、特殊申報或單位語意導致 1 月累計不等於當月，仍須人工覆核真實樣本後調整契約，不能擴張成自行重算任何官方累計或百分比。

## Domain-shaped 中間契約

`NormalizedMonthlyRevenue94025` 是來源層的 domain-shaped 中間契約，不是既有 published `MonthlyRevenue`，本 Task 不修改 `lib/domain/types.ts` 或 `lib/domain/schema.ts`：

- `companyCode` 尚未解析成 `companyId`。
- `industryName`、`sourcePublishedOn`、`revenueUnit`、`priorYearCumulativeRevenue` 在來源契約內完整保留；既有 `MonthlyRevenue` published type 目前沒有這些欄位，不能捏造或提前遺失。
- raw `noteText` 只保留 transport 稽核；normalized／published 契約精確不含此欄位。
- 正式 `SourceAttribution` 與 `fetchedAt` 將由 metadata 與未來人工核准的 adapter 建立；本 Task 不建立 adapter。
- normalized contract 不含行情、報價、成交量、價格或市場身分欄位。

## 離線驗證與升級建議

所有 contract tests 只讀 repository fixture 與 evidence；不發出 HTTP、DNS 或其他官方網站連線。source module 沒有網路函式、fixture loader、resource URL 或 fallback；production runtime 不會由本 module 載入 fixture。

現有證據已具備「建議升級 `VERIFIED_FOR_IMPLEMENTATION`」的技術條件，但仍需人工批准，而且本 Task 不修改 Registry。人工批准前至少必須：

1. 明確接受 TPEx Swagger 作為 JSON schema 證據，因 data.gov 所列 TWSE OAS 目前缺少該 operation。
2. 確認 CSV 是唯一主要 resource，OpenAPI 永遠只作本次比較、不作 runtime fallback。
3. 接受完整 14 欄 raw audit、備註不進 normalized／published，以及累計矛盾規則的官方語意風險。

升級不等於 production 核准；正式 adapter、live smoke test、顯名頁與 `APPROVED_FOR_PRODUCTION` 仍須另案人工簽核。
