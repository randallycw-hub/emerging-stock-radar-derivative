# Task 7 Report — IPO 時程分頁

## 完成內容

- 將 `ipo.html` 改為獨立 IPO 時程頁，提供五階段流程、未來關鍵事件、清單／月份檢視與完整時程表。
- 改由 Task 6 的 `loadIpoSnapshot()` 讀取正式 `IpoEventSnapshot.records`；前端以 session storage 保存最近成功版本，並處理空資料、讀取錯誤與舊資料狀態。
- 搜尋公司、名稱與承銷商；市場、階段、事件類型與年份篩選；可排序公司、階段、事件日、距今天數、競拍日與買賣日。篩選、檢視、排序與頁碼都會還原 URL 狀態。
- 桌面提供可橫向捲動的資料表；手機改用可展開歷程的事件卡。沿用深淺主題、鍵盤焦點與 reduced-motion 樣式。
- 依工作指示，未顯示價格、報酬、資料方法或內部擷取／快照文字；僅呈現不含數值的定價狀態。
- 複核修正：未來關鍵事件與月份檢視現在共用事件層篩選結果，確保公司、市場、階段、事件類型與年份條件一致。

## 驗證

- `node --test tests/static-showcase-ipo-ui.test.mjs tests/static-showcase-pages.test.mjs tests/static-showcase-ipo-radar-ui.test.mjs` — 16 passed
- `npm.cmd run lint` — passed
- `npm.cmd run typecheck` — passed
- `node --check static-showcase/assets/ipo-page.js` 與 `git diff --check` — passed

## 備註

- 既有 Task 7 brief 對承銷價欄位的描述，與本次明確「不得顯示價格」指示相衝突；頁面保留資料模型相容性與定價公告狀態，但不輸出任何價格數值。
