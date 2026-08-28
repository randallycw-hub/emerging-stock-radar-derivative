# V5.1 最終稽核

## 範圍與資料契約

- [x] 首頁與全站搜尋共用 staging 後的 `market-research.json`。
- [x] read model 僅由已驗證 generation 投影；既有 `runtime.json` 保持不可變。
- [x] 搜尋支援 NFKC、全形數字、公司／股票／CB 名稱與代碼；完整 CB 代碼優先。
- [x] 搜尋載入失敗與查無結果分開處理。
- [x] 所有 CB 標的股排行僅採資料日相同的股票行情；不混算舊價。
- [x] 已驗證零成交、沒有同日驗證資料、未公告與暫時無法取得為不同公開狀態。
- [x] IPO 7／30 日行事曆與最新事件排除送件、審議、契約核准等流程雜訊。

## 首頁與可用性

- [x] 首屏為「今天從這裡開始」三張研究卡：CB 標的股、興櫃排行、近期 IPO 時程。
- [x] 下方提供 CB 當日／近五日成交、已公告發行與掛牌、官方 CB 事件、30 日 IPO 排程。
- [x] 首頁主要內容於 staging 寫入靜態 HTML；JavaScript 僅補排名頁籤互動。
- [x] 排名頁籤具備 `tab` 語意、左右鍵、Home／End 與焦點移動。
- [x] 桌機三欄／雙欄與行動單欄均有對應 CSS。

## 公開資料與安全

- [x] 方法頁列出 TPEx、TWSE、MOPS 實際公開來源 URL 與欄位邊界。
- [x] 市場新聞未接入未授權、登入或付費資料，且不參與任何金融數值計算。
- [x] public artifact／首頁／搜尋不暴露 `sourceId`、`missingReasons`、快照識別、診斷欄位、會員或個人資料。
- [x] 外部官方公告連結採 `noopener noreferrer`。

## 驗證紀錄

- [x] targeted V5.1 tests（9/9）。
- [x] 全套 `npm test`（1129/1129）。
- [x] `git diff --check`。
- [ ] 發布產物封裝、線上部署與發布後 URL 驗證。
