# V5.7 精準修復與研究頁收斂設計

## 目標

依據使用者提供的 V5.7 規格，修正 V5.6 稽核的兩個資料語義 P0，補上可由正式來源驗證的研究欄位，並縮短公開研究頁的重複與過長內容。既有搜尋的結果排序與跳轉行為維持不變。

## 資料流程

所有新欄位遵守單一路徑：正式來源快照 → generation 衍生資料 → `v56-market-data.json` 的公開 view model → 頁面專用 formatter。前台不得自行以 0 補缺值，且不得顯示來源 ID、資料集健康狀態或私有流程名稱。

### 交易與價格語義

- IPO 價格採欄位專屬 formatter。實際承銷價、暫定承銷價、競拍最低投標價彼此不 fallback；未公布的非正值價格輸出 `null`，前台顯示「待公告」。
- CB 與興櫃交易狀態永遠比較 `latestTradeDate` 和公開快照 `dataDate`。非同日成交顯示「今日無成交」，但保留最後成交日、價格和量。
- period、均量與量比僅由已驗證交易日計算。樣本不足輸出 `null`，前台為 `—`。

### 研究頁資料契約

- 發行 pipeline 只包含 active、upcoming 或 recent listing 案件；歷史已掛牌主檔不再成為發行進度列。公開 model 沒有 `CBAS` stage 或 label。
- 興櫃績效與量能使用 TPEx 的盤後日資料；IPO 掛牌績效使用已發布實際承銷價與 TWSE/TPEx 股票日行情。沒有完整正式資料時保留欄位但顯示 `—`。
- CB 轉換價歷史僅輸出可追溯的官方紀錄或標記為 derived 的前筆 verified 推導值；同一 canonical event 合併為一個前台 marker。

## UI 收斂

- 首頁分成「今天有哪些變化」（snapshot diff）與「接下來 7 天」（canonical events），不再雙重呈現同一 CB 事件。
- 市場事件預設 7 日、提供期間/市場/類型 URL state 與 Load more；同一 entity、事件類型及有效日期只顯示一筆。
- CB 熱力圖只繪製 Top N 或 selected label；單檔 CB 的最新交易狀態與重要權利事件置於內容前段。

## 驗證策略

每項修復先新增失敗的 Node regression test，再做最小實作。另加入可重現的 Playwright QA script，在 1440×1000 與 390×844 擷取 PDF 指定頁面。正式建置、全量測試、型別檢查、lint、公共部署後瀏覽器驗收均為發布 gate。

