# 法律、授權與資料風險

本文件是工程風險控制，不是法律意見。逐一資料集依 Source Registry 狀態管理；未來可能營利不會自動否決 OGL 1.0 資料，但正式加入廣告、付費或其他營利功能前必須再人工覆核。

## OGL 1.0 判定

政府資料開放授權條款－第1版允許不限目的、時間與地域、免授權金利用，包含重製、散布、公開傳輸、編輯、改作及開發產品／服務；使用者必須依附件顯名。條款不授與商標或專利權。

只有獨立 data.gov.tw 頁面明示 OGL 1.0、免費、官方提供者，且正式 resource 可與頁面/OAS 明確對應、沒有衝突條款、欄位與顯名範圍清楚的資料集，才能成為 `APPROVED_FOR_V1_DESIGN`。

## 四個循序核准階段與獨立暫停狀態

本輪核准僅限設計文件修訂。下列前四項才是循序核准階段；`SUSPENDED` 是獨立暫停狀態，不是第五階段，也不授權跳過任何核准步驟。

- `CANDIDATE`：不建立正式 model assumption 或 adapter。
- `APPROVED_FOR_V1_DESIGN`：可寫模型、mapping 與計畫；不可連正式 runtime。
- `VERIFIED_FOR_IMPLEMENTATION`：保存合法 fixture、schema 與顯名驗證後才可實作 adapter。
- `APPROVED_FOR_PRODUCTION`：live smoke、來源再次覆核、正式顯名頁與人工上線確認完成。
- `SUSPENDED`（獨立暫停狀態）：停止新同步與發布；保留 registry、run、hash、snapshot metadata 與決策紀錄。既有資料是否繼續公開或刪除，依授權覆核結果決定；解除後須重新核對並回到適當核准階段。

## 顯名最低內容

每個資料頁須顯示資料提供機關、正式資料集名稱、授權條款名稱、官方資料集連結、官方資料更新時間、本站擷取時間及「資料經興債觀測網整理」。不使用政府、TPEx、TWSE、TDCC 或其他單位 Logo，不使用使人誤認為官方網站的名稱、配色或版式。

## 主要風險與控制

| 風險 | 控制 |
|---|---|
| 可讀 endpoint 被誤認可商用 | 必須有獨立資料集頁與 OGL 證據 |
| metadata、CSV、OpenAPI 分屬不同主機 | Registry 分開記錄角色與對應證據 |
| CSV/OpenAPI schema 不一致 | 實作前保存同日最小樣本；只選一個正式 resource |
| 一般網站額外條款 | 不抓一般頁面、下載按鈕內部接口或 HTML；有衝突即人工法律審查 |
| 公開發行被誤認興櫃 | 28567 只能補充 94025 涵蓋集合，不能判定身分 |
| 價格資料被重新導入 | 產品禁令優先於授權可用性；11747 與 bond 行情維持 `SUSPENDED` |
| schema 靜默變更 | strict schema、fixture contract、live smoke 與狀態降級 |
| 來源故障造成錯誤事件 | published pointer 不動；不產生消失或餘額歸零 |
| 第三方權利或商標 | 欄位白名單、不用 Logo；疑義升級專業法律審查 |
| 營利模式改變 | 上線廣告／付費前逐筆人工最終覆核 |

## 永久禁止來源

Yahoo、Yahoo Finance、CBAS、券商整理頁、未公開 API、未確認授權第三方 API、HTML 大量爬蟲及由一般查詢網頁逆向出的資源不得進 Registry 的可核准路徑，也不得作故障 fallback。金管會新聞頁與附件可供人工研究或逐筆人工來源證據，但未核准前不得自動同步。
