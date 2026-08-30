# V5.4 資料完整度、來源追溯與跨頁 QA 執行計畫

> 執行方式：依使用者明確的「執行 PDF 檔」授權，在同一工作階段直接完成下列工作、測試、審查與發布準備。

## 1. 建立 V5.4 audit 與來源血緣基礎

**檔案：**
- 新增 `static-showcase/assets/v54-canonical-data.js`
- 新增 `scripts/v54-data-audit.mjs`
- 修改 `scripts/stage-static-showcase.mjs`
- 新增 `tests/static-showcase-v54-data-coverage.test.mjs`

**步驟：**
1. 先寫 failing tests，定義 source registry、field lineage、dataset metadata、coverage 與 baseline input hash 行為。
2. 建立 V5.4 canonical builder：同一 source generation 輸入，產生 canonical company/stock/CB/IPO/event 模型與不可公開的 audit artifacts。
3. 將 staging 擴充成寫入 V5.4 public read models，並將 audit artifacts 寫到 `artifacts/v54/`、排除於 Sites 發布集合。
4. 跑 V5.4 focused tests。

## 2. 完整化 CB 條款、權利事件與歷程

**檔案：**
- 修改 `static-showcase/assets/cb-workbench-v53.js` 或由 V5.4 投影取代其公開模型
- 修改 `static-showcase/assets/cb-detail-v53.js`
- 修改 `static-showcase/assets/cb-workbench-ui.js`
- 修改 `static-showcase/assets/bond-events-page.js`
- 修改 `static-showcase/assets/bond-issuance-page.js`
- 新增 `tests/static-showcase-v54-cb-events.test.mjs`

**步驟：**
1. 以 failing tests 定義強贖、賣回、到期、轉換價歷程、官方連結、日期不推估、缺欄位 null 與 event dedupe。
2. 將現有 MOPS 贖回快照的公告日/終止交易日/摘要/官方 URL 合併至 CB canonical events；不得虛構其他強贖日期或金額。
3. 從 11406 提取賣回、到期、掛牌與發行條款；從 MOPS 明細提取可證實的轉換價歷程。
4. 更新 CB 總覽、行事曆、詳情與發行流程，全部只讀 V5.4 模型；強贖警示僅於真實資料存在時顯示。
5. 跑 focused tests 與既有 V5.3 回歸。

## 3. 統一 IPO、興櫃、公司與搜尋投影

**檔案：**
- 修改 `static-showcase/assets/market-event-model.js`
- 修改 `static-showcase/assets/public-event-digest.js`
- 修改 `static-showcase/assets/company-overview.js`
- 修改 `static-showcase/assets/public-market-research.js`
- 修改 `static-showcase/assets/site-search.js`（若為保持 canonical identity 所必須）
- 新增 `tests/static-showcase-v54-cross-page-qa.test.mjs`

**步驟：**
1. 用 failing tests 固定 IPO 送件、審議、契約、競拍、申購、掛牌的日期與價格欄位語意。
2. 將首頁、事件中心、公司、CB 與搜尋改為消費 canonical event / master 投影，不再獨立重算。
3. 驗證興櫃無成交、月營收尚未公布、公司 CB/IPO 存在性與搜尋載入失敗語意。
4. 寫 20/20/5/5/5/10/10 抽樣 cross-page QA 並以 audit report 輸出結果。

## 4. 安全、缺值、回歸與發布準備

**檔案：**
- 修改/新增所有需要的 V5.4 tests
- 修改 `docs/` 中的實際 audit 說明（如需）

**步驟：**
1. 全域檢查公開路徑的危險 0 fallback、未 escaped 插值、非 allowlist 官方 URL 與內部診斷外洩。
2. 執行 staging、V5.4 audit、focused tests、全測試（test concurrency 2）、lint、typecheck、build、JSON/asset/link QA；依錯誤修正直到通過。
3. 產生一份最終 internal coverage/QA summary，明列無合法官方來源的未解缺口。
4. 完成審查後提交、推送目前 Sites source repository、保存新版與公開發布。
