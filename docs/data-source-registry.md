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

## TPEx convertible-bond redemption announcements resource-level amendment (2026-08-09)

Resource: `POST https://www.tpex.org.tw/www/zh-tw/bond/redeem`

Status: `VERIFIED_FOR_IMPLEMENTATION`

Annual form body: `{ date: "YYYY", id: "", response: "json" }`.

Verified root contract: `date`, `tables`, `stat`; the annual 2026 response root date is `20260101` and `stat` is `ok`. The response contains exactly one table titled `轉換公司債行使贖回權公告`, with exact positional fields `公司代號`, `公司名稱`, `申報日期`, `主旨`, and `內容`.

Evidence captured by the controller at `2026-08-09T07:47:30.7428457Z`: HTTP 200, `application/json;charset=UTF-8`, 34 source rows, and raw-response SHA-256 `05e19631e1c73ab3aa83ede258891c1057634cd5e04634a7d7e3d205d800b282`. The offline fixture preserves two exact rows only; it is not a live-fetch substitute.

The `內容` detail URL must be HTTPS with host `mopsov.twse.com.tw`, path `/mops/web/ajax_t120sb23`, no credentials, `co_id` equal to the source issuer code, and `date1` equal to the normalized announcement date. Its detail-fetch authorization is defined by the V5.5 amendment below; no other MOPS detail route is implied.

Allowed use is alert-only: validated redemption and delisting events can enter the CB event-review queue, but must not publish a trading decision, use a third-party source, or fall back to another resource. On HTTP, payload, schema, date, subject, URL, or duplicate-key failure, reject the response, retain failure evidence, and raise a source-drift alert; do not retry through a fallback or use stale data as a replacement.

## MOPS CB 權利事件明細正式公開核准 amendment（2026-08-30）

Resource ID: `mops-cb-redemption-detail-html`
Endpoint: `GET https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?`
Status: `APPROVED_FOR_PRODUCTION`

本次核准僅限由已驗證的 TPEx 贖回公告逐筆發現、再以嚴格合約驗證後取得的可轉債權利事件明細。每一個請求都必須使用 HTTPS、無帳密、無 fragment，且 query key 必須**剛好**為 `TYPEK=otc`、四碼 `co_id`、八碼 `date1`、正整數 `seq_no`、`pub_class=0`、`firstin=1`；`co_id`、日期、債券代號與公告主旨必須回綁到 TPEx 發現列。禁止依公司名稱猜測、禁止掃描或任意組合 URL、禁止第三方替代來源與登入來源。

允許內容類型為 `text/html`，單筆上限 500 KB，30 秒逾時，拒絕重新導向。只正規化公告日、受理期間、最後轉換日、收回基準日、終止櫃檯買賣日、贖回價格／比例及理由等公開欄位。原始 HTML、雜湊、來源識別碼、解析診斷與缺漏原因留在內部快照，絕不進入前台或公開產物。抓取或解析失敗時，只保留最後一次完整成功快照；沒有完整快照則不顯示該事件，絕不以零、推測值或「待確認」補值。

## CB issuer research monthly-revenue production approval amendment (2026-08-11)

This amendment independently promotes only the two exact official CSV resources below after strict fixture verification, attribution review, failure-isolation tests, signed-current-revenue correction, and a passing one-shot final live smoke at `2026-08-11T05:41:43.350Z`.

| Resource ID | Production status | Exact purpose |
| --- | --- | --- |
| `data-gov-18420-listed-monthly-revenue-csv` | `APPROVED_FOR_PRODUCTION` | Listed-company monthly revenue for exact-code active-CB issuer research |
| `data-gov-56510-otc-monthly-revenue-csv` | `APPROVED_FOR_PRODUCTION` | OTC-company monthly revenue for exact-code active-CB issuer research |

Exact resources and metadata:

- `GET https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv`; metadata https://data.gov.tw/dataset/18420.
- `GET https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv`; metadata https://data.gov.tw/dataset/56510.
- Provider: Financial Supervisory Commission, Securities and Futures Bureau.
- License: Taiwan Open Government Data License, version 1.0 (OGL 1.0); free with attribution obligations.

The final live evidence is recorded in `docs/source-verification/cb-issuer-research-live-smoke.md`. Both resources returned exact final URLs, HTTP 200, `text/csv`, valid bounded UTF-8 bodies, the reviewed 14-field schema, plausible newest month/date, zero duplicate identities, complete per-resource exact-code/name evidence, no warnings, and independent PASS outcomes. The earlier pre-correction failure and the official signed current-month revenue correction remain part of the audit trail.

Production boundaries:

- Use exact four-digit issuer code as identity; official names are code-bound aliases only. Name-only, fuzzy, suffix-derived, or cross-code joins are forbidden.
- Preserve official signed current-month revenue. Comparative and cumulative revenue keep their reviewed non-negative contracts.
- A failed market remains stale or unavailable independently. It must never borrow records, status, or success from the other market.
- Missing coverage and name conflicts remain explicit and must not infer listing, delisting, or any market-status event.
- A cross-market same-code record is rejected by the snapshot builder as `CROSS_MARKET_CONFLICT`. The compact 2026-08-11 final evidence did not retain code sets and therefore does not claim a zero aggregate overlap count.
- Every formal refresh must inspect runtime diagnostics; before website publication, each cross-market conflict must be excluded and surfaced explicitly.
- No retry, redirect, alternate URL, OpenAPI fallback, Yahoo, third-party data, realtime field, raw response, source note, or browser automation is approved.
- Product attribution must name the provider, dataset, OGL 1.0, source period/date, and retrieval time.

No other resource status is changed by this amendment.

## TWSA underwriting announcements resource-level amendment (2026-08-09)

Resource: `GET https://web.twsa.org.tw/edoc2/default.aspx`

Status: `VERIFIED_FOR_IMPLEMENTATION`

The current-year HTML contract has page title `115年－承銷公告`, notice `本公告系統僅供參考，相關資料以正式刊登報紙之公告內容為準。`, and one result table identified by `ctl00_cphMain_gvResult`. The verified table has exactly 11 positional headers: `序號`, `申報日期`, `主辦承銷商`, `案件名稱`, `方式`, `發行性質`, `發行種類`, `配售方式一`, `配售方式二`, `案件狀態`, and `公告檔`.

Evidence captured by the controller at `2026-08-09T08:11:09.7686345Z`: HTTP 200, `text/html; charset=utf-8`, 299346 response bytes, and raw-response SHA-256 `b17dfc15a0a1e26fb0c5190248119f2b0af1494f112102ae322e2e281f5bd647`. The offline fixture retains three structural rows and performs no live fetch.

This secondary source is limited to new-CB radar enrichment: accept only `發行性質` `公司債` with `發行種類` `有擔保轉換公司債` or `無擔保轉換公司債`. It must not infer a CB code, issue amount, conversion price, or listing date. It is not contract truth and cannot become contract truth without later exact-code confirmation from TPEx and/or MOPS. No fallback, third-party source, UI, runtime fetch, publication, or `APPROVED_FOR_PRODUCTION` status is authorized. On notice, title, table, header, or row-width drift, reject the response and raise a source-drift alert.

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
| TPEx `tpex_esb_applicant_companies` | `APPROVED_FOR_PRODUCTION` | IPO 事件的上櫃申請、審議、契約、掛牌、主辦承銷商與備註 |
| TPEx `tpex_ipo_no_limit` | `APPROVED_FOR_PRODUCTION` | IPO 事件的上櫃掛牌、承銷價與主辦承銷商核對證據 |
| TWSE `announcement/auction?response=json&yy=YYYY` | `APPROVED_FOR_PRODUCTION` | 指定西元年度 IPO 競拍時程、價格、取消狀態與主辦承銷商 |
| TWSE `announcement/publicForm?response=json&yy=YYYY` | `APPROVED_FOR_PRODUCTION` | 指定西元年度 IPO 公開申購時程、價格、取消狀態與主辦承銷商 |
| TPEx `cbDayQry` | `APPROVED_FOR_PRODUCTION` | 每檔可轉債盤後成交資料 |
| TWSE `STOCK_DAY_ALL` | `APPROVED_FOR_PRODUCTION` | 上市標的股票盤後收盤 |
| TPEx `tpex_mainboard_daily_close_quotes` | `APPROVED_FOR_PRODUCTION` | 上櫃標的股票盤後收盤 |
| TPEx `convSearch` | `APPROVED_FOR_PRODUCTION` | MOPS 發行明細精確索引 |
| MOPS `t120sg01` | `APPROVED_FOR_PRODUCTION` | 發行時與最新轉換價及生效日 |
| TPEx `tpex_esb_latest_statistics` | `APPROVED_FOR_PRODUCTION` | 當日成交均價、高低價、成交量等盤後白名單欄位 |

正式快照 smoke 結果：11406 415 列、94025 354 列、11586 697 列、興櫃盤後 359 家、可轉債 385 檔、轉換價 384 筆；市場資料日期一致為 2026-07-31。未核准 OpenAPI、`bond_cb_daily`、第三方網站、即時價、買賣價量與自動 fallback 仍維持禁止。任何 schema、授權、主機或用途變更都會撤回本核准並停止切換 generation pointer。

IPO 事件用途補充：`11586-csv` 在 IPO 事件快照中另明確核准 `underwriters` 與 `note`，以及公司識別與正式申請里程碑欄位；`underwritingPrice`、`chairmanName` 與資本額不得由此用途發布。上述五個 IPO resource 的核准 identity、精確 URL（年度端點的唯一變數僅為四位數 `yy`）、Content-Type 與可用欄位，以 `lib/pipeline/source-registry.ts` 的 `ipoEventPolicy` 為可執行政策；Phase 1 quarantine 必須由該 registry 導出，不另存一份 IPO URL 白名單。

## TPEx 三大法人日交易資訊 resource-level amendment（2026-08-09）

Resource: `POST https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade`

Form body 必須完全為 `{ date: "YYYY/MM/DD", type: "Daily", id: "", response: "json" }`；未觀察到 API key。此 resource 是每一交易日一份的可轉債三大法人交易資料，2026-08-07 經人工覆核取得 HTTP 200、`application/json;charset=UTF-8` 與 157 列回應；來源證據與最小 fixture 的 metadata 保存於 `tests/fixtures/source-verification/cb-institution/metadata.json`，完整 live response 不納入 production bundle。

已驗證欄位順序為：代號、名稱、外資及陸資買／賣／淨買張數、投信買／賣／淨買張數、自營商買／賣／淨買張數、三大法人買賣超張數。回應標題明示轉（交）換及附認股權公司債以面額新台幣十萬元為一成交單位。

Parser 邊界：僅接受上述 TPEx POST resource 的 `Daily` payload；root/table key、單一 table、欄位位置、ROC／西元交易日、五至六碼債券代號、整數 cell、列數、代號唯一性及各法人淨額／合計淨額算術都必須通過。schema drift 或算術不一致時拒絕 payload；不得使用 Yahoo、券商、第三方或任何 fallback。

Attribution: `財團法人中華民國證券櫃檯買賣中心｜三大法人日交易資訊`，附交易日與本站擷取時間。

Resource status: `VERIFIED_FOR_IMPLEMENTATION`。這不是已暫停的 `bond_cb_daily` resource；後者仍禁止 ingest 或 fallback。

## 可轉債補充來源正式核准 amendment（2026-08-09）

本 amendment 依專案擁有人指示與 controller 的 2026-08-09 read-only live captures，將下列三個已完成 strict parser、exact request、bounded response、attribution 與 failure-isolation 覆核的精確 resource 提升為 `APPROVED_FOR_PRODUCTION`。本 amendment 僅覆寫前述各 resource amendment 的「尚未核准 runtime fetch／production」限制，不擴張其 parser contract、資料語意或用途。

| 精確 resource | 最終狀態 | production 限定用途 |
| --- | --- | --- |
| `POST https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade` | `APPROVED_FOR_PRODUCTION` | 僅建立可轉債三大法人盤後歷史；交易日與五至六碼債券代號必須精確一致 |
| `POST https://www.tpex.org.tw/www/zh-tw/bond/redeem` | `APPROVED_FOR_PRODUCTION` | 僅建立已驗證的贖回／終止櫃檯買賣警示事件 |
| `GET https://web.twsa.org.tw/edoc2/default.aspx` | `APPROVED_FOR_PRODUCTION` | 僅作新可轉債承銷雷達的次要補充；永遠不是契約真相 |

兩個 TPEx POST 必須分別使用已驗證的 exact form body：`newCb3itrade` 為 `{ date: "YYYY/MM/DD", type: "Daily", id: "", response: "json" }`，`redeem` 為 `{ date: "YYYY", id: "", response: "json" }`。TWSA 僅允許上述 exact GET。每個 JSON response 上限為 500,000 bytes，HTML response 上限為 1,000,000 bytes；HTTP status、redirect、Content-Type、size、JSON 或 parser schema 失敗只拒絕該 named source。

目前來源失敗時，只能複製前一份經完整驗證且無 mutable alias 的對應區段，明確標示為 `stale` 並保留原 `dataDate`；不得冒充 fresh、改寫日期或把舊資料當作新的來源事實。這項 2026-08-09 production 核准僅就上述「完整驗證 previous snapshot 區段」明確取代前述不得以 stale replacement 的文字；未經完整驗證的舊資料、來源替換、替代 URL 與 fallback 仍一律禁止。沒有合法 current 或 previous 區段時必須標示 `unavailable`。

所有 redirect、替代 URL、自動 fallback、Yahoo／券商／第三方來源、即時資料、買賣建議與擴張用途仍禁止。`edoc2` 不得推論可轉債代號、發行金額、轉換價格或掛牌日期；這些欄位仍須由 TPEx／MOPS 的 exact-code 契約證據確認。本 amendment 不核准 UI、公開發布或將承銷公告提升為契約真相。

## 可轉債公開分析工作台發布語意 amendment（2026-08-20）

公開工作台不新增來源授權；它只消費本 registry 已核准且通過 generation 驗證的欄位。瀏覽器只下載當代靜態 snapshot，不直接呼叫市場端點。主要欄位及其唯一來源邊界如下：

| 公開欄位 | 已核准來源 | 日期／關聯限制 |
| --- | --- | --- |
| 發行條款、發行總額、目前餘額、到期與賣回條款 | TPEx 11406 CSV | 以五至六碼債券代碼為 identity；保留來源資料日 |
| CB O/H/L/C、成交單位、成交金額 | TPEx `cbDayQry` | 盤後、實際交易日、等價交易；無 OHLC 不插補 |
| 標的股收盤 | TWSE `STOCK_DAY_ALL` 或 TPEx `tpex_mainboard_daily_close_quotes` | 以四碼公司代碼精確關聯；與 CB 交易日一致才估值 |
| 發行人索引與轉換價 | TPEx `convSearch`、MOPS `t120sg01` | 債券代碼與公司代碼都須一致；轉換價生效日不得晚於估值日 |
| 三大法人 1／5／20 日 | TPEx `newCb3itrade` | 五至六碼債券代碼與交易日精確一致 |
| 贖回／終止櫃檯買賣事件 | TPEx `redeem` | 只接受已驗證事件與受限 MOPS detail URL |
| 公司月營收 | data.gov.tw 18420／56510 的官方 CSV | 只以四碼公司代碼精確關聯；上市、上櫃來源分別失敗與 stale |

TWSA `edoc2/default.aspx` 雖是已核准的次要收集來源，目前不在公開工作台或 UI 呈現；不得據此宣稱工作台顯示承銷公告，也不得推論 CB 代碼、發行額、轉換價或掛牌日。

工作台公式採十進位字串運算後按欄位規則呈現：

- `conversionValue = stockClose / effectiveConversionPrice * 100`
- `premiumRate = (cbClose / conversionValue - 1) * 100%`
- `remainingUnits = outstandingAmount / unitFaceValueTwd`
- `remainingRatio = outstandingAmount / issueAmount * 100%`
- `dailyTurnoverRate = cbTradeUnits / remainingUnits * 100%`
- 事件天數為 snapshot 資料日與事件日之日曆日差。

若 CB、股票與已生效轉換價沒有共同日期，轉換價值與溢價率維持 `null`，並標示 date mismatch 或 missing。零成交保留 active + no-trade 語意；缺少 OHLC 的日期是 chart gap，不可用 `open=high=low=close` 製造 K 棒。

`stale` 只表示該 optional source 沿用自身上一份完整驗證快照，資料日不得改寫，也不得跨市場或跨公司借用。`archived` 只適用到期、已贖回、餘額歸零或從完整官方名冊移除的債券；歷史與封存原因仍可追溯，預設 active 列表不顯示。`accumulating` 表示歷史樣本不足以產生完整均線或技術指標，不代表零值。

目前沒有核准的 TTM、PS 或 TCRI 工作台資料；不得宣稱已提供、填零、推估或仿造第三方評等。公開頁面只做教育性條件檢核，不提供綜合投資總分、買賣／放空／下單、部位、價格目標或 hedge ratio 指令。
