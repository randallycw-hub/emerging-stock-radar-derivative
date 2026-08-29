# V5.3 可轉債工作台設計

## 目標

在 V5.2 的 canonical identity、公開快照與資料狀態規則之上，將可轉債入口整合為五個可操作子功能：市場總覽、全部 CB、發行進度、事件行事曆與市場統計。每一個公開數值都必須能回到 TPEx、TWSE、MOPS、TDCC 的原始事實或明確的本站計算。

## 現況與決策

現有 `bond-workbench.json` 已含 401 筆債券、條款、行情 view 與部分事件；`bond-market-history.json` 已保存日別事實。現有公開頁仍將市場總表、發行案件、公開事件拆開，且缺少統一的 view tabs、客觀聚合、事件月曆與熱力圖降級方式。

採用「一份工作台快照、前端投影多頁」：建置時從 `bond-workbench.json`、`bond-market-history.json`、`cb-master.json` 與 canonical 公司主檔產生一份 `cb-workbench-v53.json`。它不是第二套真相，而是嚴格可重建的公開 read model；保留原始 dataset URL 與 `dataDate`，只投影前台需要的安全欄位。

## 資料模型與來源

- `cb_master`：現有 `cb-master.json`，僅以 `cb_code`/`stock_code` JOIN。
- `cb_quotes`：由工作台 view 與歷史行情投影；只有同一資料日的 CB 收盤、標的收盤及轉換價會計算轉換價值、溢價率。
- `cb_events`：由 11406 條款的掛牌、賣回、到期，加上已驗證的 MOPS/TPEx 強制贖回與已驗證轉換價調整、停止轉換事件建立；每筆保留 type、關鍵日期與 source URL。無可靠來源的事件不產生。
- `cb_issuance`：由已驗證公開條款與承銷公告的已知節點建立；未知節點維持 `null`，前台顯示「待公告」，不得推估日期。

資料狀態固定為：真實零顯示 `0`、無欄位顯示 `—`、未公告日期顯示 `待公告`、零成交顯示 `今日無成交`、讀取失敗顯示 `資料暫時無法取得`；發布 gate 失敗時保留 last-known-good。任何資料日不一致均不產生估值。

## 前端架構

`bonds.html` 成為市場總覽，呈現市場摘要、成交排行、近期事件、近期發行與客觀熱力圖。既有 `bonds-filter.html` 升級為「全部 CB」，以行情/條款/事件/流動性 view tabs 取代超寬欄位；`bonds-issuance.html` 顯示發行 pipeline；`bonds-events.html` 提供列表與月曆；新增 `bonds-stats.html` 顯示今日、本週、20 交易日、90 日事件窗。

所有列都能進入同一個 CB 詳情，而詳情重組為 CB 概覽、行情、權利事件、發行條款、標的公司。原有技術分析與投資評分不會重新公開。公司頁僅加上相關有效 CB 摘要、30 日事件及發行中案件。

## 可用性、安全與 RWD

所有使用者可輸入內容一律經 `escapeHtml` 輸出；只有 allowlist 的官方 HTTPS URL 可成為來源連結。搜尋直接重用全站 canonical index，篩選狀態可從 URL 重建並可一鍵清除。桌機表格保留 sticky header/首欄；小螢幕切為 compact cards、事件列表與熱力圖排行降級。前台不輸出 source ID、缺漏原因、內部快照、評分或風險診斷。

## 驗收

新增資料模型、UI 與 staging 測試；抽樣至少 20 檔有效 CB、5 檔近期發行、5 件事件，驗證 code/name/issuer、條款日期、同日估值、事件 source URL、生命週期已亮節點與 canonical search。回歸 V5.2 全站搜尋、公司市場別、CB JOIN、缺值不變零、build、lint、typecheck 及公開頁 smoke test。
