# 正式資料來源登錄表

人工審查日期：2026-07-20

狀態定義：

- `APPROVED`：端點、官方資料集、OGL 1.0、欄位白名單、提供機關與顯名要求均已交叉核對；只允許在白名單範圍內建立正式 adapter。
- `PENDING`：至少一項證據或欄位語意仍不完整，不得建立正式 adapter。
- `REJECTED`：用途錯誤、來源被永久禁止或不符合本產品規則。

端點成功回傳不是批准依據。所有批准都同時核對官方 Swagger、政府資料開放平臺資料集頁、實際回應欄位及[政府資料開放授權條款－第1版](https://data.gov.tw/license)。

## APPROVED

### `tpex-bond-issue`

- 官方機關：金融監督管理委員會證券期貨局；技術端點由證券櫃檯買賣中心提供。
- 官方資料集名稱：轉(交)換債發行資料下載。
- Endpoint：`https://www.tpex.org.tw/openapi/v1/bond_ISSBD5_data`。
- 政府資料集編號：[11406](https://data.gov.tw/dataset/11406)。
- 使用欄位白名單：`Date`、`IssuerCode`、`IssuerName`、`BondCode`、`BondType`、`SeriesNumber`、`TrancheNumber`、`IssueDate`、`MaturityDate`、`IssueAmount`、`OutstandingAmount`、`CouponRate`、`ShortName`、`ListingDate`、`Guaranteed`、`GuaranteeDescription`、`PutOptionDate`、`PutOptionPrice`、`Underwriter`、`OutstandingChangeDate`、`OutstandingChangeDescription`、`OfferingMethod`、`Conversion/ExchangePriceAtIssuance`、`Conversion/ExchangePeriodStartDate`、`Conversion/ExchangePeriodEndDate`、`Trustee`。
- 明確排除欄位：評等、計付息／付息次數、掛牌國別、還本說明、幣別及其他未列入白名單的欄位。此來源不得作為市場成交價格來源。
- 更新頻率：每 1 日。
- 資料日期欄位：`Date`。
- 授權條款：政府資料開放授權條款－第1版。
- 顯名方式：`金融監督管理委員會證券期貨局 2026 轉(交)換債發行資料下載`，並附資料集頁、OGL 1.0 連結及「資料經興債觀測網整理」；不使用任何官方 Logo。
- 官方來源連結：[資料集](https://data.gov.tw/dataset/11406)、[Swagger](https://www.tpex.org.tw/openapi/swagger.json)、[Endpoint](https://www.tpex.org.tw/openapi/v1/bond_ISSBD5_data)。
- 快照保存規則：OGL 1.0 明確允許重製與編輯；在履行顯名義務下，可保存原始快照。營運規則為保留最後成功快照及最近 90 日每日快照，雜湊與 ingestion metadata 可長期保存。
- 商業利用判定依據：OGL 1.0 第 2 條允許不限目的、免授權金利用，包含開發產品或服務；第 3 條要求顯名。本判定不涵蓋商標權。
- 審查證據：資料集 11406 顯示正式名稱、完整欄位、每日更新、免費及 OGL 1.0；TPEx Swagger 含 `/bond_ISSBD5_data` 且摘要一致；2026-07-20 實際回應鍵與白名單一致。
- 實作狀態：尚未建立 adapter。
- 狀態：`APPROVED`。

### `tpex-emerging-eod`

- 官方機關：金融監督管理委員會證券期貨局；技術端點由證券櫃檯買賣中心提供。
- 官方資料集名稱：興櫃股票當日行情表。
- Endpoint：`https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics`。
- 政府資料集編號：[11747](https://data.gov.tw/dataset/11747)。
- 使用欄位白名單：`Date`、`Time`、`SecuritiesCompanyCode`、`CompanyName`、`PreviousAveragePrice`、`Highest`、`Lowest`、`Average`、`TransactionVolume`、`ApplyingDate`、`ApplyingStatus`。
- 明確排除欄位：`BuyingPrice`、`BuyingQuantity`、`SellingPrice`、`SellingQuantity`、`LatestPrice`、`Buy/Sell`、`SuspendTime`。第一版不顯示報買／報賣欄位，也不把 `Average` 命名為 `closePrice` 或收盤價。
- 更新頻率：每 1 日。
- 資料日期欄位：`Date`；官方資料時間欄位：`Time`。
- 授權條款：政府資料開放授權條款－第1版。
- 顯名方式：`金融監督管理委員會證券期貨局 2026 興櫃股票當日行情表`，附資料集、OGL 1.0 連結及「盤後資料，非即時行情」；不使用官方 Logo。
- 官方來源連結：[資料集](https://data.gov.tw/dataset/11747)、[Swagger](https://www.tpex.org.tw/openapi/swagger.json)、[Endpoint](https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics)。
- 快照保存規則：在 OGL 1.0 顯名義務下保存最後成功快照及最近 90 日每日快照；不得把快照冒充即時資料。
- 商業利用判定依據：OGL 1.0 第 2、3 條；產品只能使用本節白名單，不取得商標權。
- 審查證據：資料集 11747 的名稱、欄位、每日頻率與 OGL 1.0 均一致；Swagger 含相同摘要；實際回應含全部白名單及被排除欄位。
- 實作狀態：尚未建立 adapter。
- 狀態：`APPROVED`。

### `tpex-company-revenue`

- 官方機關：金融監督管理委員會證券期貨局；資料集標示為證交所資料，指定技術端點存在於 TPEx 官方 Swagger。
- 官方資料集名稱：興櫃公司每月營業收入彙總表。
- Endpoint：`https://www.tpex.org.tw/openapi/v1/t187ap05_R`。
- 政府資料集編號：[94025](https://data.gov.tw/dataset/94025)。
- 使用欄位白名單：`出表日期`、`資料年月`、`公司代號`、`公司名稱`、`產業別`、`營業收入-當月營收`、`營業收入-上月營收`、`營業收入-去年當月營收`、`營業收入-上月比較增減(%)`、`營業收入-去年同月增減(%)`、`累計營業收入-當月累計營收`、`累計營業收入-去年累計營收`、`累計營業收入-前期比較增減(%)`。
- 明確排除欄位：`備註` 及所有未列入白名單的欄位。
- 更新頻率：每 1 月。
- 資料日期欄位：`出表日期`；資料期間欄位：`資料年月`。
- 授權條款：政府資料開放授權條款－第1版。
- 顯名方式：`金融監督管理委員會證券期貨局 2026 興櫃公司每月營業收入彙總表`，附資料集、OGL 1.0 連結；十二月趨勢另標「本站依官方月資料整理」；不使用 Logo。
- 官方來源連結：[資料集](https://data.gov.tw/dataset/94025)、[Swagger](https://www.tpex.org.tw/openapi/swagger.json)、[Endpoint](https://www.tpex.org.tw/openapi/v1/t187ap05_R)。
- 快照保存規則：在 OGL 1.0 顯名義務下保存最後成功快照及最近 13 個月月快照；衍生趨勢保存計算時間與規則版本。
- 商業利用判定依據：OGL 1.0 第 2 條允許產品／服務與編輯改作，第 3 條要求顯名。
- 審查證據：資料集 94025 的正式名稱、14 個官方欄位、每月頻率與 OGL 1.0 已核對；Swagger 含 `/t187ap05_R` 且摘要一致；實際回應欄位一致。
- 實作狀態：尚未建立 adapter。
- 狀態：`APPROVED`。

### `tpex-company-basic`

- 官方機關：金融監督管理委員會證券期貨局；技術端點由證券櫃檯買賣中心提供。
- 官方資料集名稱：興櫃公司基本資料。
- Endpoint：`https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R`。
- 政府資料集編號：[28568](https://data.gov.tw/dataset/28568)。
- 使用欄位白名單：`Date`、`SecuritiesCompanyCode`、`CompanyName`、`CompanyAbbreviation`、`Registration`、`SecuritiesIndustryCode`、`Address`、`UnifiedBusinessNo.`、`Telephone`、`DateOfIncorporation`、`DateOfListing`、`WebAddress`、`IssueShares`。
- 明確排除欄位：董事長、總經理、發言人、代理發言人、私人 Email、會計師、股務代理、傳真、股本細項及其他未列入白名單的欄位。
- 更新頻率：每 1 日。
- 資料日期欄位：`Date`。
- 授權條款：政府資料開放授權條款－第1版。
- 顯名方式：`金融監督管理委員會證券期貨局 2026 興櫃公司基本資料`，附資料集、OGL 1.0 連結；不使用 Logo。
- 官方來源連結：[資料集](https://data.gov.tw/dataset/28568)、[Swagger](https://www.tpex.org.tw/openapi/swagger.json)、[Endpoint](https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R)。
- 快照保存規則：在 OGL 1.0 顯名義務下保存最後成功快照及最近 90 日每日快照；公司名稱變更保留正規化歷史。
- 商業利用判定依據：OGL 1.0 第 2、3 條；不使用官方商標或 Logo。
- 審查證據：資料集 28568 顯示正式名稱、完整欄位、每日頻率及 OGL 1.0；Swagger 端點摘要一致；實際 JSON 欄位可對應資料集中文欄位。
- 實作狀態：尚未建立 adapter。
- 狀態：`APPROVED`。

### `tpex-listing-applications`

- 官方機關：金融監督管理委員會證券期貨局；技術端點由證券櫃檯買賣中心提供。
- 官方資料集名稱：申請上櫃公司。
- Endpoint：`https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies`。
- 政府資料集編號：[11394](https://data.gov.tw/dataset/11394)。
- 使用欄位白名單：`Date`、`SecuritiesCompanyCode`、`CompanyName`、`CapitalWhileApplying`、`TPExListingScreeningCommitteeDate`、`TPExSanctionedDate`、`TPExApprovedTradingDate`、`ListingDate`、`LeadUnderwriter`、`Note`。
- 明確排除欄位：`Chairman`、`OfferingPrice` 及所有未列入白名單的欄位。
- 更新頻率：政府資料集標示每 1 年；同步不得假裝為每日完整更新，應依來源資料日期與官方更新事實判斷。
- 資料日期欄位：`Date`。
- 授權條款：政府資料開放授權條款－第1版。
- 顯名方式：`金融監督管理委員會證券期貨局 2026 申請上櫃公司`，附資料集、OGL 1.0 連結；不使用 Logo。
- 官方來源連結：[資料集](https://data.gov.tw/dataset/11394)、[Swagger](https://www.tpex.org.tw/openapi/swagger.json)、[Endpoint](https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies)。
- 快照保存規則：在 OGL 1.0 顯名義務下保存最後成功快照及狀態變更所需歷史；只有完整成功快照可進行消失比對。
- 商業利用判定依據：OGL 1.0 第 2、3 條。
- 審查證據：資料集 11394 的正式名稱、欄位、頻率與 OGL 1.0 已核對；Swagger 含同名端點；實際回應欄位可完整對應，承銷價明確排除。
- 實作狀態：尚未建立 adapter。
- 狀態：`APPROVED`。

## PENDING

### `twse-listing-applications`

- 官方機關：金融監督管理委員會證券期貨局；技術端點由臺灣證券交易所提供。
- 官方資料集名稱：向本公司申請上市之本國公司。
- Endpoint：`https://openapi.twse.com.tw/v1/company/applylistingLocal`。
- 政府資料集編號：[11586](https://data.gov.tw/dataset/11586)。
- 已確認：官方 Swagger 存在此端點；資料集為 OGL 1.0、不定期更新，列出索引、公司代號、公司簡稱、申請日期、董事長、股本、審議／核准／上市日期、承銷商、承銷價及備註。
- 未通過原因：2026-07-20 實際 JSON 鍵和值語意錯位；第一筆 `Code` 為索引、`Company` 為公司代號、`ApplicationDate` 為公司簡稱、`Chairman` 為申請日期，後續欄位亦順移。未有官方對映說明前，不得以猜測方式正規化。
- 暫定白名單：無；欄位核定前不得介接。
- 明確排除欄位：承銷價，以及所有尚未完成官方對映的欄位。
- 顯名、快照與商業利用：OGL 1.0 證據已存在，但欄位契約未通過，因此不啟用正式保存或顯示。
- 審查證據：[資料集 11586](https://data.gov.tw/dataset/11586)、[TWSE Swagger](https://openapi.twse.com.tw/v1/swagger.json)、[Endpoint](https://openapi.twse.com.tw/v1/company/applylistingLocal)。
- 實作狀態：阻擋。
- 狀態：`PENDING`。

### 其他 PENDING

| sourceId | 對象 | 未通過原因 |
|---|---|---|
| `manual-planned-bonds` | `data/manual/planned-bond-issues.json` | 每筆官方依據、授權與人工審核尚未建立；無來源連結不得發布 |
| `official-announcements` | 重大公告、IPO、承銷、競拍及抽籤 | 尚未核定精確官方端點、資料集編號、欄位與授權 |
| `tdcc-monthly` | 集保結算所月資料 | 尚未指定精確資料集；不得假裝成每日資料 |
| `bond-eod-market` | 個別可轉債盤後成交價格 | 沒有合格且已批准的正式來源；`Phase CB-EOD-PRICE` 必須跳過 |

## REJECTED

| sourceId | 對象 | 拒絕原因 |
|---|---|---|
| `wrong-company-basic` | `/mopsfin_t187ap35_O` 作為興櫃基本資料 | Swagger 正式摘要為「上櫃公司股東行使提案權情形彙總表」，用途錯誤 |
| `bond-cb-daily-price` | `bond_cb_daily` 作個別可轉債價格 | 券商買賣日報表，不是個別可轉債盤後成交價來源 |
| `yahoo-market-data` | Yahoo Finance、Yahoo 股市、query1/query2 | 永久禁止 |
| `broker-data` | 統一證券 CBAS 及其他券商接口 | 永久禁止 |
| `html-or-private-api` | 一般網頁 HTML、下載按鈕、未公開或逆向 API | 未授權且不屬正式 OpenAPI |
| `proxy-fallback` | 代理轉抓或 API 失敗後切換未批准來源 | 永久禁止 |
| `unverified-source` | 任何未確認授權來源 | 未通過本 Registry 關卡即不得介接 |

## 共同限制

- APPROVED 只適用於列出的端點、資料集及白名單欄位；增加欄位須重新人工審查。
- 不使用櫃買中心、證交所、金管會、集保結算所或其他機關 Logo。
- 顯名年份採本站實際利用年份；資料頁同時顯示資料日期、擷取時間與原始連結。
- 個別資料集未標示版本號時，不自行創造版本號；以正式名稱顯名，並記錄查核日期與 OGL 1.0 版本。
- OGL 1.0 不授與專利權或商標權。
- 來源條款、端點、schema 或提供機關變更時，自動降回 `PENDING` 並停止新資料發布。
