# 興債觀測網 Source Registry

檢查日期：2026-08-01
本文件是工程與內部授權控制，不是法律意見。

## 四個循序核准階段與獨立暫停狀態

`CANDIDATE` → `APPROVED_FOR_V1_DESIGN` → `VERIFIED_FOR_IMPLEMENTATION` → `APPROVED_FOR_PRODUCTION`。這是唯一的四階段核准順序。`SUSPENDED` 是任何階段都可因重大變更進入的獨立暫停狀態，不是第五階段，也不代表核准升級。只有 `VERIFIED_FOR_IMPLEMENTATION` 可開始正式 adapter，只有 `APPROVED_FOR_PRODUCTION` 可在 production 啟用。

2026-07-22 初始核准只允許修訂 registry 與設計文件；其後狀態升級以本文件最末的 dated amendment 為準。

`APPROVED_FOR_V1_DESIGN` 必須有獨立 data.gov.tw 頁、OGL 1.0、免費、官方提供者、可對應正式 resource、無衝突條款、完整顯名計畫、無 Logo／仿官方設計、無混入禁用來源且只使用資料集明列欄位。

## 11406：轉(交)換債發行資料下載

- 狀態：`APPROVED_FOR_PRODUCTION`（限定本文件最末 amendment 的 CSV 用途）。
- 正式名稱／ID：轉(交)換債發行資料下載／11406。
- 詮釋資料頁：https://data.gov.tw/dataset/11406
- 提供機關：金融監督管理委員會證券期貨局；資料描述為櫃買中心資料。
- 授權／費用：政府資料開放授權條款－第1版／免費。
- 更新頻率：每 1 日。
- 格式／金鑰／限制：CSV 與 JSON 候選；官方文件未要求 API key；資料集頁未公布明確 request quota，實作採每日一次、條件式重試最多 2 次並記錄 429/5xx。
- OAS：https://www.tpex.org.tw/openapi/swagger.json
- 官方 CSV：https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv
- 候選 OpenAPI：https://www.tpex.org.tw/openapi/v1/bond_ISSBD5_data
- 對應證據：資料集頁直接連結 `ISSBD5_data.csv` 並列 TPEx OAS；Swagger 的 `bond_ISSBD5_data` 摘要與正式名稱一致。實作前仍須保存 CSV 與 OpenAPI 最小樣本並確認 schema 等價，之後只選一個主要 resource。
- 欄位：資料日期、機構代碼／名稱、債券代碼／種類／期／別、發行／到期／掛牌日期、發行總額、目前餘額、票面利率、擔保、賣回權、承銷、餘額異動、募集方式、發行時轉換價格、轉換期間、受託人。完整 mapping 見 `cb-data-field-mapping.md`。
- 商業利用判定：OGL 1.0 允許開發產品／服務並要求顯名；本輪只核准設計，正式營利前再次覆核。
- 顯名：`金融監督管理委員會證券期貨局｜轉(交)換債發行資料下載｜政府資料開放授權條款－第1版`，附資料集頁、資料日期、本站擷取時間及「資料經興債觀測網整理」。
- 風險：OpenAPI/CSV schema 等價與債券種類代碼仍需 fixture 驗證；禁止使用 `bond_cb_daily`。
- 故障處理：不切換 CSV/OpenAPI 或其他來源；保留最後 published snapshot 並標示異常。

## 94025：興櫃公司每月營業收入彙總表

- 狀態：`APPROVED_FOR_PRODUCTION`（限定本文件最末 amendment 的 CSV 用途）。
- 正式名稱／ID：興櫃公司每月營業收入彙總表／94025。
- 詮釋資料與授權證據：https://data.gov.tw/dataset/94025；頁面標示證交所資料、提供機關為金融監督管理委員會證券期貨局、OGL 1.0、免費、每 1 月更新。
- 正式 CSV 主機／resource：`mopsfin.twse.com.tw`／https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv
- OAS 主機／文件：資料集頁列 `openapi.twse.com.tw` Swagger；TPEx 官方 Swagger 亦列出同名興櫃資料集。
- 候選 OpenAPI 主機／endpoint：`www.tpex.org.tw`／https://www.tpex.org.tw/openapi/v1/t187ap05_R
- 格式／金鑰／限制：CSV 與 JSON 候選；未要求 API key；未公布明確 quota，僅依每月頻率同步並在申報期有限補抓。
- 對應證據：資料集頁直接連結 `t187ap05_R.csv`；TPEx Swagger 的 `/t187ap05_R` 摘要為「興櫃公司每月營業收入彙總表」。三個角色分開記錄，不將主機等同提供機關。
- 欄位：出表日期、資料年月、公司代號／名稱、產業別、當月／上月／去年同月營收、月增率、年增率、當月／去年累計營收、累計年增率；排除備註。
- 商業利用判定：OGL 1.0 允許產品／服務及編輯改作並要求顯名；本輪只核准設計。
- 顯名：`金融監督管理委員會證券期貨局｜興櫃公司每月營業收入彙總表｜政府資料開放授權條款－第1版`，附資料集頁、資料年月、擷取時間及本站整理聲明。
- 風險：正式 adapter 只能選 CSV 或 OpenAPI 之一；另一個只供實作前比較，不能自動 fallback。此資料集建立「月營收涵蓋集合」，不是完整興櫃名錄。
- 故障處理：不切換第二 resource；保留最後 published 月份並顯示更新異常。

## 11586：向本公司申請上市之本國公司

- 狀態：`APPROVED_FOR_PRODUCTION`（限定本文件最末 amendment 的 CSV 用途）。
- 正式名稱／ID：向本公司申請上市之本國公司／11586。
- 詮釋資料頁：https://data.gov.tw/dataset/11586
- 提供機關：金融監督管理委員會證券期貨局；資料描述為臺灣證券交易所資料。
- 授權／費用／頻率：OGL 1.0／免費／不定期。
- OAS：https://openapi.twse.com.tw/v1/swagger.json
- 官方 CSV：https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data
- 候選 OpenAPI：https://openapi.twse.com.tw/v1/company/applylistingLocal
- 格式／金鑰／限制：CSV 與 JSON 候選；未要求 API key；未公布明確 quota，依不定期更新採每日低頻檢查。
- 對應證據：資料集頁直接連結 TWSE CSV 並列 TWSE OAS；Swagger 摘要為申請上市之本國公司。
- V1 欄位：公司代號、公司簡稱、申請日、上市審議日、董事會通過日、契約備查／核准日、上市買賣日。排除董事長、申請股本、承銷商、承銷價與備註。
- 商業利用判定：符合 OGL 1.0 設計使用條件。
- 顯名：`金融監督管理委員會證券期貨局｜向本公司申請上市之本國公司｜政府資料開放授權條款－第1版`，附資料集頁、更新／擷取時間。
- 風險：既有樣本曾出現 JSON 鍵值錯位疑慮；未完成 fixture schema 與 mapping 驗證前不得升級。
- 故障處理：保留最後 published snapshot；不抓一般申請查詢頁或改用未核准上櫃來源。

## 28567：公開發行公司基本資料

- 狀態：`APPROVED_FOR_V1_DESIGN`。
- 正式名稱／ID：公開發行公司基本資料／28567。
- 詮釋資料頁：https://data.gov.tw/dataset/28567
- 提供機關：金融監督管理委員會證券期貨局；資料描述為證交所資料。
- 授權／費用／頻率：OGL 1.0／免費／每 1 日。
- OAS：https://openapi.twse.com.tw/v1/swagger.json
- 官方 CSV：https://mopsfin.twse.com.tw/opendata/t187ap03_P.csv
- 候選 OpenAPI：https://openapi.twse.com.tw/v1/opendata/t187ap03_P
- 格式／金鑰／限制：CSV 與 JSON 候選；未要求 API key；未公布明確 quota，依每日頻率最多同步一次並有限重試。
- 對應證據：資料集頁直接連結 `t187ap03_P.csv` 並列 TWSE OAS；Swagger 列 `/opendata/t187ap03_P`「公開發行公司基本資料」。
- V1 白名單：出表日期、公司代號、公司名稱／簡稱、產業別、住址、統一編號、董事長、總經理、成立日期、實收資本額、網址。
- 商業利用判定：符合 OGL 1.0 設計使用條件。
- 顯名：`金融監督管理委員會證券期貨局｜公開發行公司基本資料｜政府資料開放授權條款－第1版`，附資料集頁、資料日期與擷取時間。
- 風險與限制：公開發行不等於興櫃。只可用公司代號補充 94025 涵蓋公司的 profile；不能判定新增、終止或當前興櫃身分。代號非唯一時拒絕合併。
- 故障處理：保留最後 published profile；不得擴大到整個公開發行公司資料庫，也不切換 28568。

## 未核准來源

| 候選 | 狀態 | 原因／V1 行為 |
|---|---|---|
| 興櫃公司基本資料 28568 | `CANDIDATE` | 依使用者決策需重新完成確切 endpoint 與資料集驗證；不作完整名錄 |
| 申請上櫃公司 11394 | `CANDIDATE` | 需重新確認正式 resource、schema 與欄位 mapping |
| 興櫃新增／終止／重大訊息 | `CANDIDATE` | 未找到符合本輪標準的確切資料集與 resource 證據 |
| TDCC 可轉換公司債月分析 11462 | `CANDIDATE` | 可作後續餘額／保管統計研究，未完成 endpoint 與用途核准 |
| 金管會預計生效案件／新聞附件 | `CANDIDATE` | 一般新聞與附件不是已核准 API；V1 不自動更新 |
| 興櫃行情 11747／TPEx `GET /openapi/v1/tpex_esb_latest_statistics` | `VERIFIED_FOR_IMPLEMENTATION` | 僅限興櫃股票當日盤後行情的白名單欄位；買賣、最新價與即時欄位永久禁止 |
| 可轉債金融機構買賣彙總 `bond_cb_daily` | `SUSPENDED` | 實際欄位依金融機構彙總買賣面額與金額，不是每檔可轉債行情；不得 ingest 或 fallback |
| Yahoo、CBAS、券商、未公開接口、HTML 爬蟲 | `SUSPENDED` | 永久禁止，不得重新評估為 fallback |

## 升級與撤回證據

升級 `VERIFIED_FOR_IMPLEMENTATION` 必須保存：人工取得日期、來源 URL、HTTP metadata、最小合法原始 fixture、hash、row count、source schema、normalized mapping、錯誤案例、授權頁快照摘要與顯名驗收。升級 `APPROVED_FOR_PRODUCTION` 必須另有 live smoke test、來源頁再次覆核、正式顯名頁檢查與人工簽核。

## 11586 resource-level manual amendment (2026-07-26)

Dataset 11586 status: `APPROVED_FOR_V1_DESIGN`.

CSV resource status: `VERIFIED_FOR_IMPLEMENTATION`.
The CSV resource is the primary implementation resource and the only resource eligible for a future 11586 adapter.

OpenAPI resource status: `SUSPENDED`. The OpenAPI payload is not approved for data ingestion; fallback is forbidden. It may be used only for schema-drift comparison and endpoint evidence.

Swagger/OAS role: endpoint existence and schema evidence only; the Swagger/OAS description does not establish payload semantic reliability.

The CSV evidence and decision records are preserved in:

- `docs/source-verification/11586-evidence.md`
- `docs/source-verification/11586-resource-decision.md`

The CSV and OpenAPI resources must remain separately evaluated. The dataset remains at the design-approval stage; no production approval is granted by this amendment. The approved CSV scope must not be described as a complete listing-application universe.

正式廣告、付費或其他營利功能前，再逐筆覆核授權頁、endpoint、欄位、顯名與實際用途；只有矛盾、不明或第三方權利才升級專業法律審查。

## 可轉債官方盤後市場資源 amendment（2026-07-30）

本 amendment 只解除先前對「任何市場價格功能」的概括禁止，改為允許下列五個經實際回應驗證的官方資源進入實作階段。即時行情、第三方行情、名稱模糊關聯與自動 fallback 仍然禁止。

| 資源 | resource-level 狀態 | 限定用途 |
| --- | --- | --- |
| TPEx `POST /www/zh-tw/bond/cbDayQry` | `VERIFIED_FOR_IMPLEMENTATION` | 每檔可轉債等價／議價盤後行情與實際交易日 |
| TWSE `GET /v1/exchangeReport/STOCK_DAY_ALL` | `VERIFIED_FOR_IMPLEMENTATION` | 上市標的股票盤後收盤 |
| TPEx `GET /openapi/v1/tpex_mainboard_daily_close_quotes` | `VERIFIED_FOR_IMPLEMENTATION` | 上櫃標的股票盤後收盤 |
| TPEx `POST /www/zh-tw/bond/convSearch` | `VERIFIED_FOR_IMPLEMENTATION` | 可轉債發行機構與 MOPS 明細連結索引 |
| MOPS `GET /mops/web/t120sg01` | `VERIFIED_FOR_IMPLEMENTATION` | 發行時／最新轉換價與最近生效日 |
| TPEx `GET /openapi/v1/bond_cb_daily` | `SUSPENDED` | 金融機構買賣彙總，非每檔行情；禁止 ingest 與 fallback |

實作限制：

- 僅盤後資料；不得宣稱即時。
- CB、股票與轉換價必須按債券代碼／公司代碼精確關聯。
- 每個值保存官方日期；沒有共同估值日就不計算一般溢價。
- 轉換價只適用於不早於其生效日的估值日。
- 任何必要來源失敗時保留上一個已發布版本，不使用 The Few、Yahoo、Goodinfo、CBAS、券商或其他第三方替代。
- 詳細證據與隔離原因見 `docs/source-verification/cb-market-evidence.md` 及 `docs/source-verification/cb-market-resource-decision.md`。

本 amendment 只核准 adapter 與發布前驗證，不授予 `APPROVED_FOR_PRODUCTION`。正式公開仍需 live smoke、顯名、頁面、深淺模式、手機版與發布回復測試全部通過。

## 28567 resource-level manual amendment (2026-07-26)

Dataset 28567 status: `APPROVED_FOR_V1_DESIGN`.

Primary implementation resource: the official CSV at `https://mopsfin.twse.com.tw/opendata/t187ap03_P.csv`.

CSV resource-level status: `VERIFIED_FOR_IMPLEMENTATION`.
The CSV is the sole approved primary resource candidate for a future 28567 adapter. It is enrichment-only and may be joined only to the exact company-code coverage set produced by dataset 94025.

OpenAPI `/opendata/t187ap03_P` resource-level status: `SUSPENDED` and `NOT_APPROVED_FOR_DATA_INGESTION`. The observed HTTP 200 response fails strict JSON parsing. It must not be used for ingestion, fallback, failover, or published snapshots; it is comparison-only for schema and operation drift.

Swagger/OAS is limited to endpoint-existence, operation, schema, and schema-drift evidence. It does not establish payload reliability or authorize ingestion, fallback, or production publication.

28567 usage restrictions:

- Build the 94025 coverage set first, then exact-join 28567 profiles by `companyCode`.
- Exclude unmatched and ambiguous company codes from enrichment output; never auto-merge them.
- Do not infer `isEmerging`, `currentlyEmerging`, `emergingStatus`, `marketStatus`, or `listingStatus` from 28567.
- Do not describe 28567 as a complete current emerging-company roster.

Evidence references:

- `docs/source-verification/28567-evidence.md`
- `docs/source-verification/28567-resource-decision.md`
- `tests/fixtures/source-verification/28567/metadata.json`

This amendment does not grant production approval and does not authorize an adapter, scheduler, runtime fetch, API, page, or remote resource.

## 興櫃盤後行情 resource-level manual amendment（2026-07-30）

Resource: GET https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics
Status: VERIFIED_FOR_IMPLEMENTATION
Purpose: 興櫃股票當日盤後行情
Published source fields: Average, PreviousAveragePrice, Highest, Lowest, TransactionVolume
Allowed derived fields: 均價漲跌額、均價漲跌幅、上漲/下跌/平盤分類、估算成交金額（盤後）、同日排行
Forbidden fields: BuyingPrice, BuyingQuantity, SellingPrice, SellingQuantity, LatestPrice, Buy/Sell, SuspendTime

`估算成交金額（盤後）` 是以 `當日成交均價（盤後）×成交量` 計算的估算值，源自四捨五入的來源值，不能用於精確對帳。

此狀態只核准嚴格 parser、快照建立與發布前驗證；不得發布即時、買賣價量或 `LatestPrice`，也不授予 `APPROVED_FOR_PRODUCTION`。

## 正式公開核准 amendment（2026-08-01）

本 amendment 取代前述各 dated amendment 中「尚未核准 production」的限制，但只限下表的精確 resource、白名單欄位與盤後用途。專案擁有人已確認正式版公開上線；2026-08-01 live smoke 取得 2026-07-31 完整交易日，並通過原始回應、嚴格 parser、來源日期、雜湊、筆數、深淺模式、手機版、缺值顯示與原子發布測試。

| 精確 resource | 最終狀態 | production 限定用途 |
| --- | --- | --- |
| `11406-csv` | `APPROVED_FOR_PRODUCTION` | 可轉債發行條款主檔；只用核准欄位 |
| `94025-csv` | `APPROVED_FOR_PRODUCTION` | 興櫃公司月營收與產業別補充 |
| `11586-csv` | `APPROVED_FOR_PRODUCTION` | 申請上市公開時程；排除價格與個資欄位 |
| TPEx `cbDayQry` | `APPROVED_FOR_PRODUCTION` | 每檔可轉債盤後成交資料 |
| TWSE `STOCK_DAY_ALL` | `APPROVED_FOR_PRODUCTION` | 上市標的股票盤後收盤 |
| TPEx `tpex_mainboard_daily_close_quotes` | `APPROVED_FOR_PRODUCTION` | 上櫃標的股票盤後收盤 |
| TPEx `convSearch` | `APPROVED_FOR_PRODUCTION` | MOPS 發行明細精確索引 |
| MOPS `t120sg01` | `APPROVED_FOR_PRODUCTION` | 發行時與最新轉換價及生效日 |
| TPEx `tpex_esb_latest_statistics` | `APPROVED_FOR_PRODUCTION` | 當日成交均價、高低價、成交量等盤後白名單欄位 |

正式快照 smoke 結果：11406 415 列、94025 354 列、11586 697 列、興櫃盤後 359 家、可轉債 385 檔、轉換價 384 筆；市場資料日期一致為 2026-07-31。未核准 OpenAPI、`bond_cb_daily`、第三方網站、即時價、買賣價量與自動 fallback 仍維持禁止。任何 schema、授權、主機或用途變更都會撤回本核准並停止切換 generation pointer。
