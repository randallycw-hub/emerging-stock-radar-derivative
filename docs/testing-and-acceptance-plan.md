# V1 測試與驗收計畫

> 本輪只核准測試與驗收設計文件。四個循序來源核准階段之外另有獨立暫停狀態 `SUSPENDED`；文件核准不代表來源、功能、遠端資源或 production 已獲核准。

## 預設離線測試

`npm test`、typecheck 與 build 不得連線官方 API。

### Fixture contract tests

- 每個 fixture 保存 `sourceId`、resource URL、人工取得日期、HTTP metadata、SHA-256、row count、格式與資料集頁版本。
- 最小合法樣本涵蓋正常、可空、日期、decimal、Unicode、重複鍵及被禁止欄位。
- 驗證 source schema、白名單 mapping、未知欄位策略、日期／單位與 attribution。
- fixture 必須明確位於 tests 且 production import guard 會拒絕載入。

### Adapter unit tests

以 mock HTTP response 驗證成功、逾時、中止、非 2xx、空 body、空陣列、無效 JSON/CSV、schema drift、row count 異常、重複與 retry 上限。不得用 mock 驗證 source 真實欄位；真實欄位由保存 fixture 驗證。

### Live source smoke tests

- 手動或受保護排程命令，獨立於 `npm test`。
- 只做 GET、schema 摘要、hash、row count 與少量 mapping 檢查。
- 不寫 published pointer 或正式 snapshot；輸出隔離報告。
- 執行需人工確認 source 狀態至少為 `VERIFIED_FOR_IMPLEMENTATION`。

## Repository 與發布原子性

同一 conformance suite 套用 in-memory 與未來 D1 repository。必要案例：

1. staging records 寫到一半失敗，published pointer 不變。
2. schema／完整性／事件計算任一步失敗，舊 published data 保留。
3. `PARTIAL` run 不可成為 pointer 目標。
4. 成功 pointer 切換後讀者只看到完整新 snapshot。
5. 重跑相同 source hash 冪等，不產生重複事件。
6. 來源消失與餘額歸零只可由兩個完整成功 snapshot 比較，且需符合個別規則。
7. 多請求／重試不依賴長交易；租約及 pointer compare-and-set 防止舊 run 覆蓋新 run。

## Domain 驗收

- 日期：官方日曆日不轉 UTC；無效日期與順序矛盾拒絕。
- 數字：金額、比率、契約價格使用 decimal 字串，不用浮點財務計算。
- 公司：94025 coverage 先建立，28567 再以唯一 code join；歧義拒絕。
- 債券：空 bond code 複合鍵、種類代碼、賣回多日期、餘額異動與 attribution。
- 事件：穩定鍵、revision、30/60/90 窗口、固定衍生聲明、無重複。
- 永久禁令：Yahoo、CBAS、券商、HTML scraping、即時／延遲／盤後市場價格、成交量及投資計算掃描。

## API、UI、SEO 與顯名

- API 只回 normalized DTO，無 source raw key；只讀方法與合理 cache header。
- 每頁顯示五項顯名與兩種時間；來源故障顯示最後成功時間。
- `/emerging` 文案不得宣稱完整名錄或目前市場身分。
- 不存在 published entity 時 404 或 noindex；sitemap 不含 fixture／空頁。
- 無資料、STALE、UNAVAILABLE、SUSPENDED 與正常狀態均有 render test。
- 無官方 Logo、仿官方設計、建議、價格或報酬語意。
- keyboard、landmark、heading、focus、對比與 mobile layout 納入驗收。

## 效能與 D1 驗收

- EXPLAIN／query plan 證明列表依 companyCode、bondId、eventDate/eventKind、sourceId、published snapshot 索引查詢。
- 列表使用游標與上限，不做全表讀取或 N+1。
- 記錄每次同步 rows read/written、storage 估算、snapshot records 與 query p95。
- 免費額度達 70% 告警、85% 停止非必要歷史寫入並人工評估；不得因此切換未授權來源。

## 每階段完成命令

```powershell
npm ci
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

全部 exit 0、無未解釋 warning、無正式網路依賴、Git diff 僅含該階段範圍，才能提交。production 核准另需 live smoke、來源頁再覆核、顯名頁人工檢查及明確批准。
