# V5.5 CB 權利事件前台落地設計

## 目的

依使用者提供的 V5.5 規格，讓可轉債權利事件從公告名單與後端資料，變成公開前台上可看、可篩選、可點官方來源的市場工具。本次維持 V5.2 搜尋、V5.3 工作台與 V5.4 資料稽核基線，不重新設計網站框架。

## 現況基準

- 既有 bond-supplemental.json 有 37 筆 TPEx 強制贖回 discovery 公告，但只保留公告日、終止交易日、主旨和明細網址。
- V5.4 canonical event dataset 已有新掛牌、賣回、到期、轉換價變動與強制贖回的基本事件，卻未解析強制贖回明細，無法正確顯示日期語意、價格及狀態。
- 已以 MOPS 官方明細驗證 31672、629010 的公告確實可提供受理期間、收回基準日、終止交易日、最後轉換期限與每張收回價格。這兩筆只作解析器測試範例，不會硬寫成產品資料。
- 首頁、事件中心、CB 行事曆、單檔詳情與搜尋尚未共用帶有事件狀態與日期語意的單一 V5.5 資料集。

## 官方資料邊界

1. TPEx bond/redeem 是強制贖回 discovery 來源；由 discovery 取得、通過 URL 驗證的 MOPS ajax_t120sb23 明細頁是事實來源。
2. TPEx 11406 CSV 提供新掛牌、賣回及到期已公告條款；已驗證的 MOPS 轉換價頁提供轉換價調整事實。
3. 明細網址只接受 HTTPS、mopsov.twse.com.tw、/mops/web/ajax_t120sb23，以及發現清單指定的六個查詢參數。網址不由訪客輸入、不追隨重新導向。
4. 第三方網站與新聞不進入正式事件資料集，也不影響 event status。

## Canonical event model

V5.5 輸出 canonical-events-v55.json 與 cb-workbench-v55.json。每筆 CB 事件含有：

    eventId, eventType, marketScope, stockCode, cbCode, companyName, instrumentName,
    announcementDate, startDate, endDate, effectiveDate, deadlineDate,
    lastConversionDate, lastTradingDate, recordDate, price, reason,
    status, source, sourceUrl, publishedAt, fetchedAt, rawSourceId, eventDetails

- eventId 由官方事件的 CB 代碼、公告日和公告序號或條款日期構成，重抓同一公告時保持不變。
- eventType 支援 cb_early_redemption、cb_conversion_suspension、cb_put、cb_maturity、cb_conversion_price_change、cb_listing。
- eventDetails 僅放已有官方事實的類型專屬欄位。未知值維持 null，前台顯示「—」或「待公布」，絕不倒推或轉成 0。
- rawSourceId 與 raw text hash 僅供內部追溯，不進入前台畫面。

## 狀態和排序

- cancelled：官方公告明示撤銷。
- completed：所有可核對的關鍵日期均早於資料日。
- deadline_soon：距最後轉換、最後交易、收回基準、申請截止或到期日不超過 3 個日曆日。
- active：資料日位於正式受理期間或事件有效期間。
- upcoming：公告已發布，但受理或生效期尚未開始。

未完成事件以最近關鍵日由近到遠排序。completed 只在歷史切換中出現。每個日期會帶「公告日」、「最後轉換日」、「終止交易日」或「收回基準日」等語意標籤。

## Pipeline 與 fallback

TPEx discovery -> MOPS detail fetch -> pure parser -> rights-event snapshot -> V5.5 canonical dataset -> runtime/search -> frontend。

若強制贖回明細抓取失敗、schema 驗證失敗或明細數異常為零，保留上一份完整有效 snapshot 並標示更新延遲。禁止以空陣列覆蓋既有資料。V5.5 不破壞既有 bond-supplemental 快照相容性。

## 前台落點

- 首頁：新增 CB 關鍵事件，顯示強贖、停轉、近期賣回、90 日內到期 count，以及最近 3 至 5 筆未完成事件。資料不可得顯示「—」。
- 市場事件中心：支援 CB subtype、今天／7 日／30 日／月曆／歷史；列出類型、CB、日期語意、倒數、狀態與官方來源。
- CB 工作台：事件行事曆提供期間、類型、狀態、CB 搜尋、月曆和官方連結。
- 單檔 CB：active 或 deadline_soon 事件置於行情卡之前的克制警示區；completed 事件移入事件分頁歷史。
- 搜尋：維持既有順位；只為 active 或 deadline_soon CB 加上事件 badge 與關鍵日副標。

## 驗收與安全

- 解析器、snapshot fallback、狀態機、V5.5 canonical 投影、搜尋 badge、跨頁投影均使用固定官方形狀 fixture 先寫失敗測試。
- QA 自 V5.5 canonical dataset 抽樣至少 20 檔 CB，覆蓋當期存在事件類型，並檢查同一 eventId 跨頁一致。
- 前台不顯示 source ID、hash、缺漏原因、資料完整度、稽核診斷或私有狀態。
- 外部連結均需 allowlist、HTML escaping 和 noopener noreferrer；不引入登入、個資或第三方會員資料。
- 最後以 desktop 及 390px 行動版檢查首頁、事件中心、CB 行事曆、單檔警示與搜尋，保留 Before/After 畫面作為內部驗收證據。

