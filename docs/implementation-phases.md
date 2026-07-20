# 興債觀測網第一版實作階段

每階段先寫失敗測試並確認失敗原因，再做最小實作，依序執行：專屬測試、`npm ci`、`npm test`、`npm run lint`、`npm run typecheck`、`npm run build`、`git diff --check`。全部成功後建立單一獨立 commit。若授權、端點、欄位不明，需抓一般網頁、需未授權付費資料、出現不明修改、驗證失敗或需大量超範圍變更，立即停止。

| 階段 | 目標與最小範圍 | 主要測試 | 建議 commit | 授權關卡 |
|---|---|---|---|---|
| Phase 1 | 安全護欄、品牌、來源禁止測試、價格語意規則；更新舊 AGENTS 規則以允許明確契約價格及經批准日終資料 | 禁 Yahoo/CBAS/券商/代理/爬蟲/前端 OpenAPI/輪詢；品牌；允許 `dailyAveragePrice`、`initialConversionPrice`、`putPrice`，禁止興櫃 `closePrice` | `test: establish xingzhai v1 safety and brand guardrails` | 否 |
| Phase 2 | 領域模型、schema、ISO 日期、Asia/Taipei 與 SourceAttribution | 型別、decimal 字串、穩定 ID、缺 attribution 拒絕 | `feat: define xingzhai domain schemas` | 否 |
| Phase 3 | Source Registry、Repository 介面與記憶體測試實作 | 只有 APPROVED 可建 adapter；頁面/API 不依賴 D1；production 不載 fixture | `feat: add source registry and repositories` | 否 |
| Phase 4 | IngestionRun、RawSnapshot、來源健康、資料新鮮度及最後成功資料 | HTTP 200 非充分條件；單一/部分/全部失敗；schema、日期、筆數、重複與成功率 | `feat: track ingestion and source health` | 否 |
| Phase 5 | `bond_ISSBD5_data` 正式 adapter、快照、驗證與正規化 | 欄位白名單、契約價格、空債券代碼複合識別、去重、餘額快照、attribution | `feat: ingest approved bond issue data` | 已通過文件授權關卡；實作仍須獨立批准 |
| Phase 6 | 興櫃公司基本資料、Company/Identifier/Profile 與名稱變更 | `/mopsfin_t187ap03_R` 白名單、公司識別穩定、名稱變更、市場身分 | `feat: ingest approved emerging companies` | 已通過文件授權關卡；實作仍須獨立批准 |
| Phase 7 | 興櫃月營收、十二月趨勢及本站衍生標示 | 月份唯一鍵、缺月、月增/年增/累計年增、計算說明 | `feat: add emerging monthly revenue trends` | 已通過文件授權關卡；實作仍須獨立批准 |
| Phase 8 | 興櫃盤後日行情 | 日均價不得命名收盤價；只用 Registry 白名單；日期非最新不得稱今日；盤後聲明；不使用買賣報價 | `feat: add approved emerging end of day data` | 已通過文件授權關卡；實作仍須獨立批准 |
| Phase 9 | 公司與可轉債關聯；非興櫃發行人只建最小 Profile | 代碼關聯、同名不同公司、缺發行人、公司市場別 | `feat: link bond issues to companies` | 依賴 Phase 5、6 已批准來源 |
| Phase 10 | CompanyEvent、BondEvent、BondStatus、BondAlertWindow、DerivedEvent 與快照差異 | 事件去重；完整成功才判斷消失；三階段消失狀態；30/60/90 日窗 | `feat: derive bond and company events` | 不新增來源 |
| Phase 11 | 首頁、`/emerging`、`/emerging/[companyId]` | 搜尋、產業篩選、無資料、錯誤、來源、盤後日期與響應式 | `feat: build emerging company radar` | 正式顯示依賴批准資料 |
| Phase 12 | `/bonds`、`/bonds/[bondId]` | 完整發行條件、來源時間、無可轉債行情聲明、無投資訊號 | `feat: build convertible bond radar` | 正式顯示依賴批准資料 |
| Phase 13 | `/events`、`/calendar`、`/listing-applications` | 事件日期、去重、TPEx 申請狀態、部分失敗；TWSE 資料不得載入 | `feat: add event calendar and listing progress` | TPEx 來源已批准；TWSE 仍 PENDING，先不介接 |
| Phase 14 | `data/manual/planned-bond-issues.json`、schema 與 `/planned-issues` | 缺官方 URL/日期 build 失敗；合法狀態；正式債券出現後才 issued | `feat: add reviewed planned bond issues` | 每筆來源人工確認 |
| Phase 15 | `/sources`、`/about`、`/disclaimer`、`/privacy`、`/terms`、SEO、manifest、OG、結構化資料 | 授權與顯名、品牌、canonical、無即時宣稱、合法 JSON-LD | `feat: add source legal and seo pages` | 不新增來源 |
| Phase 16 | localStorage 收藏、無資料／錯誤狀態與響應式整理 | storage 損壞/不可用；不跨裝置；React 空狀態與錯誤狀態 | `feat: add local favorites and resilient states` | 否 |
| Phase 17 | 完整測試、效能、安全性、無障礙與文件驗證 | 30 項必要護欄、lint、typecheck、production build、全專案掃描 | `test: verify xingzhai observatory v1` | 所有正式來源須 APPROVED |
| Phase CB-EOD-PRICE | 個別可轉債盤後市場價格的選用階段 | APPROVED 來源、盤後聲明、精度、日期與欄位語意 | `feat: add approved bond end of day data` | 必須另有 APPROVED 正式來源；目前跳過 |

## Phase 1 前置決策

現有 `tests/phase1-boundaries.test.mjs` 的全面價格禁令來自舊產品範圍。Phase 1 只能將它精煉成新規格的語意護欄，不能刪除或放寬 Yahoo、行情 route、即時行情與未授權來源禁令。既有已移除的舊一般 `price` UI 不恢復；只在相應階段加入完整命名且有 schema 的契約或日終欄位。

## 正式介接關卡

2026-07-20 文件審查已將 `tpex-bond-issue`、`tpex-company-basic`、`tpex-company-revenue`、`tpex-emerging-eod`、`tpex-listing-applications` 列為 `APPROVED`。這只解除對應階段的來源授權阻擋，不代表 adapter 已建立，也不授權在本次文件任務開始實作。

`twse-listing-applications` 因 JSON 鍵值錯位維持 `PENDING`；Phase 13 只能先使用已批准的上櫃申請來源。`Phase CB-EOD-PRICE` 因無批准來源繼續跳過。
