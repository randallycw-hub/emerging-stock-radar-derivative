# V5.4 資料完整度、來源追溯與跨頁 QA 設計

## 目標與邊界

V5.4 是資料可信度修復版，不重做視覺設計，也不重新開放技術分析。它會把現有公開快照收斂為可驗證的 canonical 公司、股票、可轉債、IPO 與事件 read model，並在建置期產生內部的來源登錄、欄位血緣、覆蓋率及跨頁一致性報告。

資料優先順序固定為：TPEx、TWSE、MOPS、TDCC 的公開資料（A 級）→ 可由 A 級資料完整重現的衍生值（B 級）→ 僅供產品設計參考的第三方資料（C 級）。CBAS16889、CyclesInvest 與新聞不會成為 canonical 金融欄位；未授權或付費資料（D 級）不接入、不公開。

公開前台只顯示金融事實、資料日及安全的官方連結。來源 ID、完整度百分比、缺漏原因、內部診斷、快照 ID 和品質規則均留在內部產物，延續既有隱私與資訊呈現政策。

## 現況盤點與基線

改版前 Git 基線為 `bd0b1db38d17f2ca470359146754962cd2560a1e`，公開 generation 為 `generations/3b9f982ea995602c`，市場資料日為 2026-08-28。核心公開輸入的雜湊與筆數列在 `docs/v54-baseline.md`，作為 V5.4 回歸比較依據。

現有資料已涵蓋：401 筆 CB 工作台、15,646 筆 CB 歷史、1,439 筆 IPO 事件、362 筆興櫃行情、306 筆公司營收研究，以及 MOPS 贖回公告與轉換價公開明細連結。缺口則包含強贖公告正文中未結構化的「最後轉換申請日、收回基準日、收回價格、流通餘額」，以及沒有正式公告支撐的停轉／Reset 事件細節。這些欄位會在 coverage report 內明確標示為不可得，絕不推估或填零。

## Canonical 模型

建置階段新增 `cb-workbench-v54` 和 `canonical-events-v54` read models：

- CB record：沿用 V5.3 身分、條款、同日估值與流動性規則，補上可追溯的 `rights`、`redemption`、`conversionPriceHistory` 與發行 life cycle。所有金額、日期、來源都以 null 表示未公開；前台在必要時投影為 `—`、`待公布` 或 `今日無成交`。
- Canonical event：每筆事件具穩定 `eventId`、`eventType`、市場範圍、股票與 CB 身分、日期欄位、標題、官方 URL、資料日和事件特定 `extra`。CB 總覽、CB 行事曆、CB 詳情、公司頁、全站事件頁與首頁只讀此模型的各自投影。
- Company/stock/IPO：保留現有 canonical master；IPO 將既有的送件、審議、董事會、契約、競拍、申購、掛牌等事件轉成相同 event schema。價格欄位維持 provisional、minimum bid、final underwriting 三者分開，無公告日期一律維持 null。

事件的去重鍵固定為官方來源 URL（或已驗證的正式來源身分）+ 事件型別 + 實體 + 日期；更新只可補同一事件的空欄位，不可覆蓋不同歷史事件。

## 強贖與 CB 權利事件

MOPS/TPEx 現有可驗證贖回快照會產出 `cb_early_redemption` 事件，保留公告日、終止交易日、原始公告摘要、官方公告 URL；只有落在現有 CB 身分主檔的資料才會加入公開模型。單檔 CB 若目前處在此窗口，詳情頁最上方呈現警示區，但只列出實際已取得的欄位與官方公告，未取得欄位不會渲染為假資料。

賣回權、到期與掛牌從 11406 正式條款轉為獨立事件；賣回日期與價格可追溯至該份條款。轉換價變更歷程只採現有 MOPS 公開明細連結和有效日期，沒有公告日期、原因或舊價的資料不宣稱為 Reset。停轉、恢復轉換與完整 Reset 事件保留在 schema 與 coverage audit，待取得合法官方公開資料後才公開。

## 來源、覆蓋率與品質產物

`scripts/v54-data-audit.mjs` 會從 staged generation 產出四個不會打包到公開站的 JSON 產物：

1. `source-registry.v54.json`：每個 dataset/欄位的 source、URL、Tier、公開性、授權狀態、更新週期和 fallback 規則。
2. `field-lineage.v54.json`：公司、興櫃、IPO、CB 行情/估值、條款、事件與營收欄位的 canonical 來源與衍生公式。
3. `data-coverage-report.v54.json`：每個 dataset 的核心欄位、可用/缺失數、blocking gaps、來源確認與歷史可用性。
4. `qa-report.v54.json`：20 檔股票、20 檔有效 CB、5 檔近期掛牌、5 件強贖、5 件轉換價/停轉資料、10 個 IPO、10 家營收公司的 join、日期、值與 event identity 檢查結果。

快照輸入失敗或不符合 schema 時，staging 仍沿用既有 publication gate 與 last-known-good 策略，絕不以空資料覆寫有效 generation。

## 跨頁投影與缺值規則

CB/IPO 事件與估值不再由各頁面重算。所有頁面只從 V5.4 read model 取值：同日的 CB 收盤、標的股收盤與有效轉換價才會產生轉換價值與溢價；日期不一致時兩項均為 null。真實的 0 保留為 `0`；沒有官方資料為 `—`；尚未公告的下一階段為 `待公布`；明確零成交為 `今日無成交`；讀取失敗為 `資料暫時無法取得`。

公司頁僅在有有效 CB 或 IPO 案件時顯示對應模組；搜尋只讀 canonical index，並維持「載入失敗」與「查無結果」的不同文案。

## 安全與驗收

官方連結維持 HTTPS allowlist，所有插入 HTML 的文字一律 escape；公開投影會再次移除 source ID、缺漏原因與診斷欄位。新增單元、schema、read-model、coverage 與 cross-page QA 測試，並在 build、lint、typecheck、靜態 JSON/連結與 RWD smoke 全部通過後才允許發布。
