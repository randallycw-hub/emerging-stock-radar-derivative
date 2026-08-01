# Task 9 正式驗證與 Sites 發布報告

日期：2026-08-02（Asia/Taipei）

## 結論

- 已將已驗證來源 commit `77c432ccf6cb5c926d9a53fd0b6cd68e20b50c1d` 推送至既有 Sites 專案 `main`。
- Sites version 6 已正式發布；deployment `appgdep_6a6e1e88d34481919597f5521c2de633` 最終狀態為 `succeeded`。
- 正式網址：<https://emerging-stock-radar-derivative-20260720.chiayu333.chatgpt.site>
- 三個正式頁面皆為 HTTP 200；目前首次 IPO 快照尚未建立，API 如實回傳可重試的 `503 source_unavailable`，未捏造 `schemaVersion`、source manifest 或 records。

## 正式測試

所有 CPU 密集工作均設定 `UV_THREADPOOL_SIZE=2`，執行程序優先權為 `BelowNormal`。

| 驗證 | 結果 |
| --- | --- |
| IPO 來源、快照、repository、refresh、API 精確測試 | 17/17 pass，0 fail |
| 興櫃、IPO 雷達、IPO 時程、共用頁面、排程精確測試 | 23/23 pass，0 fail |
| `npm run test:showcase` | 382/382 pass，0 fail |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |

正式 build 產生 `dist/server/index.js`、`dist/.openai/hosting.json` 與完整靜態資產。`migrations/0005_ipo_event_snapshots.sql` 與部署成品中的同名 migration SHA-256 均為 `1D67B6862B6CA27A00CD29891DB225D208D26C6D6C179317C58B7F4F7DC74ECC`。

## 瀏覽器 QA

在既有正式 build 的本機預覽完成下列驗收：

- 桌機 `1440×900` 與手機 `390×844`。
- `/market-site/ipo-radar.html`、`/market-site/ipo.html`、`/market-site/emerging.html`。
- 三頁深色與淺色主題皆可切換且文字可讀。
- 三頁在兩個 viewport 均無 body 水平溢出。
- 桌機主要導覽與目前頁 `aria-current` 正確；手機選單可展開並顯示全部五個入口。
- IPO 時程的「月份檢視」可切換為 selected；手機版使用卡片／空狀態，桌機版表格正常。
- 興櫃手機版桌機表格隱藏且行動卡片可見。
- 公開頁未顯示「當日成交均價（盤後）」欄位；核准的衍生「均價漲跌」仍保留。
- 三頁未出現 fixture、mock、假資料或測試資料方法文案。

正式部署後 in-app browser 暫時沒有可用 browser binding，因此沒有重複進行線上視覺截圖；改以公開 HTTPS 與 UTF-8 HTML 驗證確認正式頁面、標題、共用導覽及禁止文案。這不影響發布前已完成的完整瀏覽器 QA。

## Sites 發布

| 項目 | 結果 |
| --- | --- |
| Project | 既有 project，public access |
| Source commit | `77c432ccf6cb5c926d9a53fd0b6cd68e20b50c1d` |
| Version | 6 |
| Archive | tar，110 files，30,341,120 bytes |
| Archive SHA-256 | `ed2c18370d7a65d4b3ebc44d8d88c89966416ab415e22ff6a5b3effe64661d54` |
| Deployment | `appgdep_6a6e1e88d34481919597f5521c2de633` |
| Status | `succeeded` |
| 完成時間 | 2026-08-02 00:28:30（Asia/Taipei） |
| URL | <https://emerging-stock-radar-derivative-20260720.chiayu333.chatgpt.site> |

公開頁唯讀驗證：

| 頁面 | HTTP | 標題 | 共用導覽 | 禁止文案 |
| --- | --- | --- | --- | --- |
| `/market-site/ipo-radar.html` | 200 | IPO 進度雷達｜盤後市場資訊 | pass | pass |
| `/market-site/ipo.html` | 200 | IPO 時程｜盤後市場資訊 | pass | pass |
| `/market-site/emerging.html` | 200 | 興櫃市場｜盤後市場資訊 | pass | pass |

## 正式 API

`GET /api/ipo-events` 目前結果：

- HTTP `503 Service Unavailable`
- `Content-Type: application/json`
- `Cache-Control: no-store`
- `Access-Control-Allow-Origin: *`
- body：`{"status":"source_unavailable"}`

這是首次正式快照尚未成功產生時的 fail-closed 狀態，不是偽造的空快照。兩次獨立公開請求均觸發 Worker，Worker outcome 為 `ok` 且明確回傳 503。程式在 current snapshot 為空時會令 `shouldRefreshIpoSnapshot` 回傳 true；後續每次 GET 都會重新嘗試五個必要官方來源，只有全部下載、解析與驗證完成後才會原子發布 snapshot。因此此狀態可回復，但在成功 refresh 之前無法合法聲稱 HTTP 200、`schemaVersion: 1`、五筆 source manifest 或非空 records。

## Commit

- 已部署來源：`77c432ccf6cb5c926d9a53fd0b6cd68e20b50c1d`
- 本報告以 `chore: verify IPO production release` 提交；實際 commit SHA 由提交結果記錄。

## Concerns

- 首次 IPO snapshot 尚未產生；公開頁會誠實顯示資料暫時無法讀取／沒有可顯示資料。
- 公開 API 必須待後續某次五來源完整 refresh 成功後，才能驗證 200、schemaVersion、source manifest 與 records。
