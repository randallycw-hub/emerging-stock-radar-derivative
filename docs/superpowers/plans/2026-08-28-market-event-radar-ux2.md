# 市場事件雷達 UX 2.0 實作計畫

> 執行依據：使用者提供之《市場事件雷達 UX2.0 Codex 完整重構指令》。本計畫不取代 PDF，而是將其落到現有靜態公開網站架構。

## 目標

讓使用者在五秒內知道今日／明日／未來 7 日事件、最需處理事項，並在兩次操作內找到特定公司、IPO 或 CB 的相關事件；同時保留所有已發布資料與現有公開連結。

## 實作順序

1. **Phase 0：稽核與基準**
   - 已完成現有路由、資料快照、排程與公開投影盤點。
   - 保留 `npm test` 的 V5 基準並新增 UX 2.0 行為測試。

2. **建立安全事件模型與共用 Token**
   - 先寫事件投影與日期／篩選／群組測試。
   - 在 `public-event-digest.js` 建立僅含公開事實的跨市場 event shape：日期、類型、公司／代碼、標題、公開連結、更新日。
   - 在 `app.css` 建立 PDF 指定的 surface、ink、muted、border、brand、info、success、warning、danger token，並為現有深色主題提供等值 token。
   - 在 `site-shell.js` 加入市場事件導覽但維持舊路由與 mobile navigation。

3. **先完成市場事件頁**
   - 新增 `events.html` 和 `market-events-page.js`，並納入 `scripts/stage-static-showcase.mjs`。
   - 實作 Today／Tomorrow／7d／IPO／CB metric strip、FilterBar、日期群組 EventRow、URL query 同步、清除、清單／日曆／依公司檢視。
   - 實作同公司／同債券的 Event Cluster、可鍵盤操作的明細抽屜與公開頁導向。
   - 手機版改為 agenda + 週日期列 + bottom sheet，不顯示七欄月曆格。

4. **套用共享資訊階層**
   - IPO：以 stage、下一事件、日期、距今天數為優先；保留完整時間軸。
   - CB：以實際可用欄位製成可排序緊湊表格，7 日內日期警示但不推測資料。
   - 興櫃：公司主資訊、代碼次要資訊、排序與可點進公司研究頁。
   - 公司研究：將公開事件置於明確頁籤／時間軸，聚合 IPO/CB，但不暴露診斷資料。
   - K 線：保留真實 KLineChart、比例座標、十字線、OHLCV 和既有真實資料範圍。
   - 首頁：Today Brief → 5–8 件高優先事件 → 各市場摘要與快速搜尋。

5. **回歸、無障礙與發佈**
   - 對既有資料快照比對重構前後核心事件數與核心欄位。
   - 執行 lint、typecheck、全測試、建置，新增互動／路由／資料投影測試。
   - 使用本機瀏覽器在 390、768、1280、1440 寬度檢查首頁、事件清單／日曆、IPO、CB、興櫃、公司與 K 線，確認無橫向溢位、Tab/focus 可操作。
   - 檢查瀏覽器 console，公開版成功後依既有 Sites 專案發佈並做 production smoke test。

## 不可違反的驗收條件

- 不編造日期、公司、數字、評分、買賣建議或行情。
- 未知值只呈現 `—`；不讓資料品質／內部來源／缺漏原因流入前台。
- 事件的狀態以 Asia/Taipei calendar date 判定，已過期資料降低視覺權重但保留於歷程。
- 篩選、清除、日曆／清單切換與公司群組均不整頁重載，且 URL 可還原目前狀態。
- 舊 HTML 路由、API、排程與公開網址持續可用。
