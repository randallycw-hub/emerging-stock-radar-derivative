# 興債觀測網 Source Registry

檢查日期：2026-07-22
本文件是工程與內部授權控制，不是法律意見。

## 四個循序核准階段與獨立暫停狀態

`CANDIDATE` → `APPROVED_FOR_V1_DESIGN` → `VERIFIED_FOR_IMPLEMENTATION` → `APPROVED_FOR_PRODUCTION`。這是唯一的四階段核准順序。`SUSPENDED` 是任何階段都可因重大變更進入的獨立暫停狀態，不是第五階段，也不代表核准升級。只有 `VERIFIED_FOR_IMPLEMENTATION` 可開始正式 adapter，只有 `APPROVED_FOR_PRODUCTION` 可在 production 啟用。

本輪核准只允許修訂本 registry 與其餘設計文件；不授權啟用來源、實作 adapter、建立或綁定遠端資源、寫入遠端資料或上線。

`APPROVED_FOR_V1_DESIGN` 必須有獨立 data.gov.tw 頁、OGL 1.0、免費、官方提供者、可對應正式 resource、無衝突條款、完整顯名計畫、無 Logo／仿官方設計、無混入禁用來源且只使用資料集明列欄位。

## 11406：轉(交)換債發行資料下載

- 狀態：`APPROVED_FOR_V1_DESIGN`。
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

- 狀態：`APPROVED_FOR_V1_DESIGN`。
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

- 狀態：`APPROVED_FOR_V1_DESIGN`。
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
| 興櫃行情 11747 | `SUSPENDED` | 即使 OGL 明確，價格、買賣與成交量違反產品永久禁令 |
| 可轉債成交行情 `bond_cb_daily` | `SUSPENDED` | 市場價格與成交資料永久禁止 |
| Yahoo、CBAS、券商、未公開接口、HTML 爬蟲 | `SUSPENDED` | 永久禁止，不得重新評估為 fallback |

## 升級與撤回證據

升級 `VERIFIED_FOR_IMPLEMENTATION` 必須保存：人工取得日期、來源 URL、HTTP metadata、最小合法原始 fixture、hash、row count、source schema、normalized mapping、錯誤案例、授權頁快照摘要與顯名驗收。升級 `APPROVED_FOR_PRODUCTION` 必須另有 live smoke test、來源頁再次覆核、正式顯名頁檢查與人工簽核。

正式廣告、付費或其他營利功能前，再逐筆覆核授權頁、endpoint、欄位、顯名與實際用途；只有矛盾、不明或第三方權利才升級專業法律審查。
