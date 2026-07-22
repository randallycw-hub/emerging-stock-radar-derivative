# 興債觀測網 V1 產品與技術設計

狀態：待正式實作計畫核准
設計覆核日：2026-07-22

本文件與本次九份 V1 文件是現行規格；若 `docs/end-of-day-market-data.md`、舊實作計畫或歷史稽核文件仍描述興櫃價格、日高低或成交量，該內容視為已被本規格取代，不得進入 V1 實作。

## 品牌與範圍

- 正式名稱：興債觀測網
- 固定副標題：興櫃公司、可轉債與上市櫃進度資訊
- V1 聚焦：興櫃月營收資料涵蓋公司、國內轉換／交換公司債、興櫃或公開發行公司申請上市櫃進度。
- 一般上市櫃公司只有在發行相關債券時建立最小發行人資料，不擴張為完整台股網站。

永久禁止 Yahoo、CBAS、券商接口、未公開 API、未授權第三方金融 API、HTML 大量爬蟲、股票或可轉債即時／延遲／盤後市場價格、買賣價、成交量、成交明細、轉換價值、折溢價、理論價格、套利、投資建議、目標價及報酬預測。`initialConversionPrice` 與 `putPrice` 是發行契約條款，不是行情，不得用於價值計算。

V1 不做會員、登入、付款、通知、原生 App、廣告、投資組合、交易紀錄或 AI 買賣分析。可在後期加入只存於瀏覽器、不上傳的 localStorage 收藏。

## 資料涵蓋邊界

完整興櫃公司名錄尚未核准，因此 `/emerging` 只能稱「興櫃月營收資料涵蓋公司」或「依最新官方興櫃月營收資料整理」。不得發布目前興櫃總數、最新登錄、終止興櫃、完整名錄或確定市場身分。

公司詳細頁可顯示已發布的公司基本資料、月營收、十二個月營收趨勢、上市申請及相關債券，但必須標示涵蓋資料月份。公開發行公司基本資料只能在公司代號已存在於最新興櫃月營收涵蓋集合時補充欄位；不能單獨證明興櫃身分。代號不唯一或不一致時拒絕合併並記錄異常。

## Source Registry 狀態

```text
CANDIDATE
  → APPROVED_FOR_V1_DESIGN
  → VERIFIED_FOR_IMPLEMENTATION
  → APPROVED_FOR_PRODUCTION
```

- `CANDIDATE`：找到候選，但授權或端點證據未完整。
- `APPROVED_FOR_V1_DESIGN`：可進模型與計畫，不能撰寫正式 adapter。
- `VERIFIED_FOR_IMPLEMENTATION`：完成資料集頁、端點、最小合法樣本、schema、mapping、授權與顯名確認，才可撰寫 adapter。
- `APPROVED_FOR_PRODUCTION`：正式 smoke test、來源再次覆核、顯名驗證與人工上線確認完成。
- `SUSPENDED`：授權、端點、欄位或來源重大改變時停止同步及發布，保留稽核紀錄。

目前 11406、94025、11586、28567 最高只到 `APPROVED_FOR_V1_DESIGN`。

## 架構與資料流

```text
Source Registry authorization gate
→ one approved Source Adapter
→ IngestionRun + raw metadata/hash/row count
→ strict source schema
→ normalized domain records + attribution
→ completeness checks
→ immutable staging snapshot
→ diff + derived events
→ published snapshot pointer switch
→ application service DTO
→ Next.js page/API
```

前端、API 與 service 不得依賴官方原始欄位。每個資料集只選一個正式 resource；CSV/OpenAPI 可在驗證期比較，但正式來源失敗時不得自動切換另一個 resource。

## 完整同步才發布

1. 建立 ingestion run。
2. 下載原始資料。
3. 保存來源 metadata、hash、row count、擷取時間。
4. 嚴格 schema 驗證。
5. 正規化。
6. 完整性檢查。
7. 寫入 staging snapshot。
8. 計算差異及衍生事件。
9. 全部成功後切換 published snapshot pointer。
10. pointer 更新後前端才讀到新資料。

中途失敗不得移動 pointer、刪除上一成功資料、產生來源消失／餘額歸零事件或發布部分 snapshot。`PARTIAL` 只描述 ingestion 健康狀態。

官方日期保存為 `YYYY-MM-DD` 的 `Asia/Taipei` 日曆日期，不轉 UTC。擷取、開始、完成時間使用 UTC ISO datetime。

## 資料模型邊界

- `OfficialSource`：證據、狀態、主要 resource、顯名與覆核時間。
- `SourceAttribution`：每筆資料的資料集、官方網址、資料日期、擷取時間、snapshot ID。
- `Company`／`CompanyIdentifier`：穩定公司識別；名稱不是主鍵。
- `EmergingCoverageMembership`：公司出現在某月份 94025 的事實，不等於永久市場身分。
- `CompanyProfile`：28567 補充的公開發行公司資料。
- `MonthlyRevenue`：官方月營收與比率；十二月趨勢是本站排序呈現，不改寫官方值。
- `BondIssue`／`BondBalanceSnapshot`：發行條款與餘額，不含行情。
- `ListingApplication`：上市或上櫃申請里程碑；來源分開保存。
- `CompanyEvent`／`BondEvent`／`DerivedEvent`／`AlertWindow`：歷史事件、衍生事件與日期窗口分離。
- `IngestionRun`／`StagingSnapshot`／`PublishedSnapshotPointer`：發布原子性。

## D1 推薦設計

推薦低成本雲端資料庫方案，以 D1 作目前目標並保留 repository abstraction。本輪不建立、綁定、遷移或寫入 D1，不修改 hosting project。

- 測試使用 in-memory repository。
- migration 只在後續獨立階段建立並本機驗證。
- 索引至少涵蓋 `companyCode`、`bondId`、`eventDate`、`eventKind`、`sourceId`、`publishedSnapshotId`。
- 列表使用索引、游標分頁及預先計算摘要，禁止每次全表掃描。
- staging 與 pointer 切換不假設跨 request 長交易。
- 監控 D1 rows read、rows written、storage、同步筆數與查詢延遲；接近免費額度前告警。

## 保存方案比較

| 方案 | 成本 | 優點 | 缺點 | SEO | 改動 |
|---|---|---|---|---|---|
| 建置時靜態 JSON | 近零 | 簡單 | build 綁官方可用性；歷史與原子發布弱 | 良好 | 小 |
| 本機 SQLite | 本機近零 | SQL 與測試容易 | serverless 磁碟不持久、部署不一致 | 中 | 中 |
| 排程＋低成本雲端 DB | 免費額度內近零 | 快照、差異、事件、SEO 與健康狀態完整 | 需監控額度與 migration | 最佳 | 中 |

推薦第三案。其資料量適合 V1，且能可靠保留最後成功快照。

## 錯誤、快取與 SEO

- 官方故障：保留 published snapshot，顯示最後成功時間與更新異常。
- 無 published snapshot：顯示清楚無資料狀態，不顯示 fixture。
- API cache key 必須包含 published snapshot ID；切換 pointer 後自然失效。
- 只有具有正式 published data 的公司／債券生成可索引詳細頁。
- 未核准、無資料或占位頁不生成或設 `noindex`；不得批量建立 SEO 空頁。
- 每頁顯示提供機關、正式資料集、授權、官方連結、資料更新時間與本站擷取時間，不使用官方 Logo 或仿官方視覺。
