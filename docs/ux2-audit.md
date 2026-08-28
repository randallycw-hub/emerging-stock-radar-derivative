# 市場事件雷達 UX 2.0：Phase 0 稽核

日期：2026-08-28（Asia/Taipei）  
依據：`市場事件雷達_UX2.0_Codex完整重構指令.pdf`

## 不變邊界

- 公開網址、既有 HTML 路由、Vinext 建置與靜態發佈流程均保留。
- 既有正式資料契約均保留：`current.json` → `runtime.json` → 興櫃、IPO、CB 工作台快照。
- 不會修改資料來源核准機制、GitHub Actions 排程、資料寫入或私有匯入流程。
- 所有前台事件僅取已發布、有效日期的事實；不輸出來源 ID、診斷、完整度或缺漏原因。

## 已確認資料基準

目前 generation 為 `generations/52e30d38bda6abac`，資料日期為 2026-08-26：

| 資料域 | 記錄數 | 可用事件／備註 |
| --- | ---: | --- |
| IPO | 1,438 | 126 個進行中案件、6,667 筆已發布事件 |
| 可轉債 | 399 | 387 檔 active、1,092 筆事件 |
| 興櫃 | 362 | 盤後市場快照 |

## 路由與改造方式

| 範圍 | 現況 | UX 2.0 處理 |
| --- | --- | --- |
| 主導覽 | 首頁／興櫃／IPO／可轉債 | 新增「市場事件」公開入口；保留原四項與所有舊連結 |
| `ipo-radar.html` | IPO 階段總覽 | 改為緊湊 pipeline 與近期可行動事件 |
| `ipo.html` | 完整 IPO 時程 | 保留資料與 URL 篩選，採日期群組與清楚狀態 |
| `bonds.html`／`bonds-events.html` | CB 市場／CB 事件 | 維持既有 CB 詳情與事件路由，套用緊湊表格與狀態語意 |
| `emerging.html`／`company.html` | 興櫃清單／公司研究 | 強化列層級、公司事件時間軸、IPO/CB 匯流入口 |
| `index.html` | 研究入口與摘要 | 首屏改為 Today Brief、重要事件與快速搜尋 |
| 新增 `events.html` | 現況沒有跨市場事件總頁 | 以既有已發布快照組合市場事件清單、日曆與公司群組，不新增資料來源 |

## 可重用與需重構區域

- 保留：`ipo-data.js`、`ipo-stage-filter.js`、`bond-public-data.js`、`public-event-digest.js`、KLineChart adapter、資料 staging，以及所有來源驗證測試。
- 重構：`site-shell.js`、`app.css`、首頁／IPO／CB／興櫃／公司公開畫面的表現層。
- 新增：純前台的事件正規化、日期群組、日曆與明細抽屜元件；其輸入全部是既有公開投影。
- 不刪除：任何既有的資料欄位、API、排程、公開路由或資料中心後台。

## 基準驗證

- `npm run lint`：通過。
- `npm run typecheck`：通過。
- `npm test`：1,109 項通過、0 失敗；包含 `npm run build`。
- 桌機基準：本機 1280 px 寬已檢查 `ipo-radar.html`，現況是大型區塊／卡片優先的 IPO 總覽；作為改版前比較基準。

## 已知修正範圍

現有跨市場事件 helper 已有「已驗證、日期有效、不帶內部來源欄位」的安全投影；UX 2.0 會擴展這個安全投影來提供可篩選的事件列與公司群組，絕不將內部事件證據帶進 DOM。
