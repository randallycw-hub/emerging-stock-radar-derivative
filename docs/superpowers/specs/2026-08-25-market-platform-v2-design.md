# 興櫃・IPO・可轉債公開資料研究平台 V2 設計

## 依據與目標

本設計依據使用者提供且已核准的「Codex 總控執行指令：興櫃・IPO・可轉債公開資料研究平台完整改版」整理。目標是把現有公開盤後網站升級為可追溯、可驗證、非投資建議的台灣興櫃、IPO 與可轉債研究平台。

現行 `AGENTS.md` 的安全、來源授權、盤後資料與不提供投資建議限制優先於舊文件或介面文案。未獲核准的官方來源只可建立驗證文件與 fixture，不得進入正式快照或公開頁面；第三方與登入資料永遠不是正式資料。

## 現況與差距

| 領域 | 已具備 | V2 差距 |
| --- | --- | --- |
| 興櫃 | TPEx 盤後日均價、前日均價、買賣價、成交量與 IPO 申請欄位的驗證流程 | 沒有 `/market/[code]` 靜態個股頁、週基準／週漲跌、完整無成交呈現與統一市場摘要 |
| IPO | 上市、上櫃申請、掛牌、競拍與公開申購的核准來源與事件快照 | 雷達、行事曆、競拍申購仍是兩個資料投影，缺少統一公司事件模型、期限檢視與資料中心來源說明 |
| 可轉債 | 11406 條款與餘額、核准盤後行情、標的股收盤、目前生效轉換價、歷史行情、法人／贖回補充與私有 Excel 後台 | 只是一個市場頁和 query-string 明細；缺少 CB 分類／發行／事件頁、可讀 URL、狀態引擎、版本化轉換價與完整事件去重 |
| 資料品質 | source registry、schema、來源 attribution、原子 generation、部分 publication gate 已存在 | 欄位日期與狀態模型不一致；缺少跨市場共用 sourced-value、日期倒退／筆數異常／IPO 階段倒退的完整 gate |
| 排程 | 夜間 CB refresh 程式與台北日期工具存在 | repository 中沒有正式 workflow；現行文件時間與 V2 指定時間不一致，需統一為 Asia/Taipei 的 mode-based workflow |
| 介面 | 靜態展示站、桌機表格／行動卡片、深淺色、基本來源連結 | 主導覽不含資料中心，首頁不是摘要 dashboard，全站搜尋與 methodology 內容不足；仍有「快速策略」等不符合研究平台定位的字眼 |

## 架構

1. **資料層**：保留現有 source registry、嚴格 parser、normalized snapshot 與 atomic publication；新增一個可共用的 `SourcedValue` 語意，將值、來源、資料日、擷取時間及狀態一起傳遞。舊 JSON 欄位保留相容投影，不能破壞目前公開 generation。
2. **品質層**：每個市場候選都先經 schema、日期、筆數、單調性與交叉來源驗證。失敗時維持前一個已驗證 generation；公開頁只顯示最後有效值與日期，或 `—`，不曝光內部診斷碼。
3. **領域層**：興櫃以日均價和前一有效交易日均價計算日漲跌；週基準只取上一完整交易週最後有效交易日。IPO 以官方事件合併成固定階段。CB 以評估日挑選生效中的轉換價版本，並先由狀態引擎決定是否可計算市場衍生值。
4. **展示層**：維持靜態展示站為公開入口，擴增成市場、IPO、CB 與資料中心的可分享 route。明細頁使用靜態相容的 query parameter 或 build-time page，所有輸入均先白名單化與轉義。
5. **營運層**：單一 GitHub Actions workflow 以 `FAST`、`OFFICIAL`、`EVENT`、`RECONCILE`、`WEEKLY` mode 執行；實際發布仍和資料更新分離，且只在候選通過品質閘門後交由既有 hosting 流程部署。

## 資料與來源規則

- 正式來源只使用個別已核准的 TPEx、TWSE、TDCC、MOPS 與公開觀測站資源；每個新增 endpoint 必須先經 schema、授權、固定 URL、content type、大小、timeout 與 fixture 驗證。
- 不使用 Yahoo、券商、CBAS、RobotCB、The Few、CyclesInvest 或登入內容作為正式資料。使用者提供 Excel 永遠只在 localhost 後台匯入、差異檢查與人工核對。
- 核心數據的 UI provenance 採精簡 details/tooltip：來源、資料日期、最後驗證；不顯示內部 `sourceId`、missing reason 或 QA code。
- 行情日期、股票行情日期、轉換價生效日、餘額資料日、法人資料日、財報期間、事件公告／生效日分開顯示。

## 資料品質與狀態

- `ok`、`stale`、`conflict`、`missing` 為欄位狀態；資料缺失只顯示 `—`，不得填 0、推估、抄第三方或把昨天值偽裝為今日。
- CB 狀態以 `MATURED > DELISTED > REDEMPTION_PROCESS > TRADING_SUSPENDED > CONVERSION_SUSPENDED > NO_TRADE > STALE > DATA_CONFLICT > ACTIVE` 決定。到期／下櫃紀錄只作歷史資料，不產生交易條件。
- IPO 預設只顯示未終止、來源完整且階段未倒退的進行中案件；撤件、自撤、駁回只保留在「全部／歷史」，不混入進行中數量。
- 每次資料更新都執行 row-count、日期倒退、唯一鍵、CB 餘額上下界、無成交、轉換價版本與 IPO 階段單調性檢查。

## 介面與資訊架構

主要導覽固定為「首頁｜興櫃市場｜IPO｜可轉債｜資料中心」。二級導覽由各領域頁提供：IPO 雷達／時程／競拍申購；CB 市場／分類／個券／發行／事件。所有排序與篩選只描述客觀欄位與門檻，禁止評分、推薦、買賣、套利、目標價與綜合健診文字。

首頁顯示興櫃、IPO、CB 三組摘要，並以可篩選的近期事件時間軸整合三個領域。桌機表格使用 sticky header/left column、tabular number 與可排序欄位；行動版以摘要卡取代寬表格。

## 驗證與安全

- 所有新純函數與資料轉換先以 fixture 寫 failing test，再實作；unit tests 不呼叫即時網路。
- 每一階段執行目標測試、相關回歸、typecheck、lint、必要 build、diff check 後再 commit。
- 原始 Excel、登入資訊、權杖、個資與受限來源不進 Git、靜態產物、瀏覽器回應或 log。公開連結只接受經核准 HTTPS URL，使用 `noopener noreferrer`。
- 任何建置或資料處理以低優先權與最多兩個工作執行緒進行。

