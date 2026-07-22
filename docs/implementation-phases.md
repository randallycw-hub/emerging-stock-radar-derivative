# 興債觀測網 V1 實作階段

> 本輪只核准設計文件修訂，不代表核准執行本計畫。來源採四個循序核准階段，`SUSPENDED` 為獨立暫停狀態；目前不得啟用來源、實作功能、建立遠端資源或上線。

本文件只定義未來順序；本輪不開始實作。每階段採 TDD、獨立 commit、低負載最多 2 執行緒，並執行目標測試、`npm test`、lint、typecheck、build、`git diff --check`。

| 階段 | 成果 | 進入條件 |
|---|---|---|
| 0 | 核准本設計與正式實作計畫 | 本文件 commit 經人工核准 |
| 1 | 修正 domain model：移除日終市場價格／成交量；加入 coverage、snapshot、pointer 與來源狀態 | 無外部來源 |
| 2 | Repository contracts、in-memory repository、D1 migration 設計與索引測試 | 不建立／綁定遠端 D1 |
| 3A | 11406 fixture、source schema、mapping、CSV/OpenAPI 比較與顯名驗收 | 升級 `VERIFIED_FOR_IMPLEMENTATION` 後才寫 adapter |
| 3B | 94025 fixture、三主機證據、schema、mapping 與主 resource 選定 | 同上；不得 fallback |
| 3C | 11586 fixture、錯位檢查、白名單 mapping | 同上；排除承銷價 |
| 3D | 28567 fixture、profile mapping、94025 coverage join | 同上；不可判定興櫃身分 |
| 4 | Ingestion orchestration、staging、完整性檢查、pointer 切換、health | fixture/mock HTTP only |
| 5 | 債券、營收、profile、上市申請 adapters | 各資料集需個別 `VERIFIED_FOR_IMPLEMENTATION` |
| 6 | 債券／上市申請事件與 30/60/90 日窗口 | published staging 測試通過 |
| 7 | Application services、DTO、索引分頁與 cache | 頁面不依 source schema |
| 8 | `/bonds`、債券詳細頁、事件與 calendar | 只有正式 published records 建頁 |
| 9 | `/emerging` 與公司詳細頁 | 使用 94025 涵蓋定位；不宣稱完整名錄 |
| 10 | `/listing-applications`、`/sources` 與法律頁 | 上櫃來源未核准則不顯示上櫃資料 |
| 11 | SEO、noindex、sitemap、localStorage 收藏與可及性 | 無 SEO 空頁、無 fixture production path |
| 12 | production smoke、來源／顯名覆核 | 個別升級 `APPROVED_FOR_PRODUCTION`；需人工確認 |

## D1 階段限制

- 先定義 repository 與 in-memory conformance suite。
- migration 設計 tables：sources、ingestion_runs、snapshots、snapshot_records、published_pointers、companies、coverage_memberships、monthly_revenues、bond_issues、bond_balances、listing_applications、events。
- 索引：company code；bond ID；event date＋kind；source ID；published snapshot；列表排序／游標欄位。
- 不假設跨 request 長交易。大量 records 寫 staging，完整成功後以短操作更新 pointer。
- migration 先本機測試；建立、綁定、遠端 migration 與 deployment 需另行批准。
- 建立 rows read/written、storage、同步 row count、查詢 p95 與錯誤率監控門檻。

## 暫緩階段

興櫃完整名錄、新增／終止興櫃、申請上櫃、重大訊息、TDCC 月資料與預計發債自動更新，各自等精確資料集升級。股票／可轉債市場價格、成交量與所有投資計算永久不進實作計畫。
