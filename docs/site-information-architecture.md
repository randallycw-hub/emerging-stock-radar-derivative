# 興債觀測網 V1 資訊架構

## 路由

| 路由 | 責任 | 索引條件 |
|---|---|---|
| `/` | 三領域摘要、近期事件、來源健康 | 有正式 published data 才列資料摘要 |
| `/emerging` | 「興櫃月營收資料涵蓋公司」列表 | 可索引；清楚標示資料月份與非完整名錄 |
| `/emerging/[companyId]` | profile、月營收、趨勢、上市申請、相關債券 | 只有 published membership 才生成／索引 |
| `/bonds` | 國內轉換／交換債列表 | 有 production-approved published snapshot 才列資料 |
| `/bonds/[bondId]` | 發行條款、餘額、事件、日期 | 只有正式已發布債券才生成／索引 |
| `/listing-applications` | 上市／上櫃申請進度 | 各來源分區；未核准上櫃來源不顯示資料 |
| `/events` | 公司與債券事件總覽 | 只讀 published events |
| `/calendar` | 日期式事件瀏覽 | server-side 分頁，不產生無限空日期頁 |
| `/sources` | Registry 狀態、來源、授權、健康與時間 | 永久公開 |
| `/about` | 品牌、範圍與資料方法 | 永久公開 |
| `/disclaimer` | 非投資建議與時效限制 | 永久公開 |
| `/privacy` | localStorage 與無帳號資料政策 | 永久公開 |
| `/terms` | 使用條款 | 永久公開 |

## 頁面共同元素

每個資料區塊顯示提供機關、資料集正式名稱、官方資料集連結、OGL 1.0、官方資料日期／月份、本站擷取時間、資料經本站整理聲明及健康狀態。不得使用官方 Logo、商標或仿官方版面。

## 興櫃頁限制

- H1 或導言固定使用「興櫃月營收資料涵蓋公司」或「依最新官方興櫃月營收資料整理」。
- 顯示最新 published `yearMonth`，不得稱目前完整名單。
- 不發布目前興櫃總數、最新登錄、終止興櫃或確定市場身分。
- 公司頁可顯示 28567 profile，但需說明 profile 是公開發行公司資料，興櫃涵蓋由 94025 當期公司代號集合建立。

## SEO 與空頁

- sitemap 只收錄靜態法律／來源頁與有正式 published record 的 entity canonical URL。
- 無正式資料、fixture-only、來源未核准、entity 不存在：不生成或回應 404；必要的狀態頁設 `noindex`。
- 不批量建立「資料尚未提供」公司／債券頁。
- structured data 只引用已發布且可追溯欄位，不放投資評等、價格或預測。
- 分享預覽使用本站文字品牌，不使用官方圖樣。

## 導覽與 localStorage

主要導覽為首頁、興櫃公司、可轉債、上市櫃進度、事件、行事曆、資料來源。收藏若在 V1 後期加入，只保存 entity ID 與 schema version；不登入、不同步、不分析個人資料，損壞時安全重設。
