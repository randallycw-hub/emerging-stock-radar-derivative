# 舊程式可重用性與退場稽核

稽核基準：`6873058`。本文件不修改舊程式。

| 現有項目 | 現況 | 決策 |
|---|---|---|
| `app/Dashboard.tsx` | 單頁儀表板，已移除價格 UI；混合資料取得、狀態與呈現 | 可參考響應式版面；資料邏輯須移到應用服務，不直接擴充成正式資料頁 |
| `app/api/companies/route.ts` | API route 直接呼叫公司資料函式 | 後續改依賴 repository／service；不得直接依 D1 或外部來源 |
| `app/api/tracker/route.ts` | API route 直接呼叫 tracker | 退場或改成明確 schema 的事件／申請 API |
| `lib/company-basic.mjs` | 直接取得官方端點並有 snapshot fallback | 只有正規化概念可參考；來源未 `APPROVED` 前不得作正式 adapter，正式模式不得以 fixture fallback |
| `lib/tracker.mjs` | 直接取得上櫃／上市候選資料；欄位與來源耦合 | 不作正式 adapter；TWSE 欄位對映有疑義，須人工確認 |
| `lib/company-basic-snapshot.json` | 既有快照 | 視為開發／測試資料；不得由正式模式載入 |
| `lib/tpex-applicant-snapshot.json` | 既有申請快照，已移除 `OfferingPrice` | 視為開發／測試資料；不可冒充即時資料 |
| `scripts/update-company-basic-snapshot.mjs` | 產生快照 | 後續只能移到 fixture 流程；不得在來源未批准時成為正式同步 |
| `tests/phase1-boundaries.test.mjs` | 禁止 Yahoo、行情 route 及廣泛價格欄位 | 必須保留；後續精煉為語意護欄，允許明確契約價格與經批准的日終模型 |
| `tests/tracker.test.mjs` 等 | 覆蓋舊 tracker 行為 | 退場時以領域、repository、service 與 API schema 測試替代 |
| Vinext/Vite/Worker 設定 | 現有建置基礎 | 保留；Worker 只組裝依賴，不承載來源對映 |
| `.openai/hosting.json` | 既有 project ID | 不修改、不部署 |

## 可能誤刪或需重建

- 先前清理移除了所有一般價格語意；新規格僅允許明確的債券契約價格及人工批准後的官方日終欄位。護欄需按語意精煉，不能簡單恢復舊 `price` 欄位。
- 舊 Dashboard 的搜尋、篩選、空狀態與響應式樣式可重用，但須拆除對舊資料形狀的依賴。
- 舊 tracker 的申請資料呈現可作視覺參考；來源對映不能沿用為正式依據。

## 退場驗收

- 正式頁面只呼叫應用服務。
- API route 只呼叫應用服務並輸出已驗證 schema。
- 外部 adapter 只能對應 `APPROVED` registry。
- fixture 路徑有顯式環境隔離，production build／runtime 不載入。
- 舊網站檔案只在本工作區內逐步替換，不觸碰父層網站。
