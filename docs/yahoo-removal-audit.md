# Yahoo 移除稽核

稽核日期：2026-07-20  
稽核範圍：`app`、`lib`、`worker`、`db`、`public`、`tests`、`scripts`、`package.json`、`package-lock.json`、環境變數範例、README、部署設定與建置設定。

## 稽核結論

現有網站把 Yahoo 同時用於興櫃即時成交資訊、歷史收盤資訊、公司技術線圖與公司新聞。Yahoo 行情還會與 TPEx 興櫃行情合併，衍生漲跌幅、週漲跌、成交量、成交額、流動性、排行、訊號與溢價文字。這些功能必須整體移除，不能改用券商網站、代理伺服器或其他未授權行情 API。

專案沒有發現 `NEXT_PUBLIC_YAHOO`、`YAHOO_API` 或其他 Yahoo 環境變數；`package.json` 與 `package-lock.json` 沒有 Yahoo 專用套件；`public` 沒有 Yahoo Logo。`.openai/hosting.json` 只有既有 Sites project ID，與 Yahoo 無關，必須保留且不得部署。

## 逐檔結果

| 檔案位置 | Yahoo／行情用途 | 是否被其他程式引用 | 移除方式 | 移除後替代或刪除的畫面 |
|---|---|---|---|---|
| `lib/yahoo.ts` | 呼叫 `query1.finance.yahoo.com` chart、spark 與 Yahoo 股市內部 stockList API；合併即時價、前收、週收盤、成交量及市場狀態；含快取與 fallback | `app/api/yahoo/route.ts`、`lib/tracker.mjs` | 刪除整個 adapter，不建立替代行情 adapter | 刪除即時價、日漲跌、週漲跌、成交量與報價狀態 |
| `app/api/yahoo/route.ts` | 批次代理 Yahoo 報價給瀏覽器 | `app/Dashboard.tsx`、API CORS 測試、rendered HTML 測試 | 刪除 route | 前端不再請求 `/api/yahoo` |
| `app/Dashboard.tsx` | 批次載入 Yahoo 報價、與 TPEx 行情合併，顯示即時價、買賣價、漲跌、成交量、成交額、排行、報價完整度、技術線圖與價格型公司面板 | 首頁及 `/market`、`/radar`、`/ipo` | 移除 Market/Yahoo 型別、fetch、排序、卡片、表格欄位、refresh、價格工具與外部線圖／新聞 UI；保留導覽、搜尋、篩選、事件表格與響應式殼層 | 行情區改為「官方資料來源建置中，目前不提供即時或延遲行情。」；上市櫃進度只顯示公告事件 |
| `lib/tracker.mjs` | 對每筆申請公司呼叫 Yahoo；計算現價、上週收盤、週漲跌、溢價、價格訊號並產生 Yahoo chart URL | `/api/tracker`、Dashboard、tracker 測試 | 移除 Yahoo import、價格 enrichment、行情欄位、漲跌／溢價／chart URL；保留官方承銷定價與事件日期 | 進度雷達移除成交價、漲跌、週漲跌、波動／價差欄 |
| `app/api/company/route.ts` | 回傳 Yahoo 技術線圖；抓取 Yahoo RSS 新聞並解析 XML | Dashboard 公司面板、rendered HTML 測試 | 刪除 `chartUrl`、新聞 fetch、RSS 型別與解析工具 | 公司面板只保留官方公司資料與公司官網，不顯示新聞或技術線圖 |
| `tests/rendered-html.test.mjs` | 明確要求 Yahoo adapter、route、報價欄位與 Yahoo 新聞存在 | `npm test` | 改寫為新品牌、無行情介面、非股價官方事件與無 Yahoo 結構測試 | 測試不再保護舊行情功能 |
| `tests/api-cors.test.mjs` | 把 Yahoo route 列為公開 API | `npm test` | 從 route 清單移除 Yahoo 與 market 行情 API | 只驗證保留的 tracker、company 唯讀 API |
| `lib/market.ts` | 呼叫 TPEx 興櫃即時／延遲行情，產生成交價、買賣價、成交量、成交額、漲跌、流動性與 fallback 快照 | `/api/market`、`/api/company`、Dashboard、測試 | 將公司基本資料工具抽離後刪除行情模組 | 刪除盤面、行情排行與流動性功能 |
| `app/api/market/route.ts` | 對外提供興櫃行情並保存收盤快照 | Dashboard、API CORS 測試 | 刪除 route | `/market` 保留路由但只顯示建置中空狀態 |
| `lib/market-snapshot.ts` | 保存興櫃行情 fallback | `lib/market.ts` | 刪除 | 不使用看似即時的備援行情 |
| `lib/quote-snapshot.ts` | 保存興櫃成交價、量與額 fallback | `lib/market.ts` | 刪除 | 不使用價格 fixture／snapshot |
| `db/market.ts` | 建立並寫入 `market_snapshots`，同檔兼具公司 profile cache | `/api/market`、`/api/company` | 刪除行情資料層；公司 API 改用現有記憶體快取及官方快照 | 無行情儲存 |
| `db/schema.ts`、`db/index.ts`、`drizzle/*`、`drizzle.config.ts` | 定義行情快照資料表與 D1 存取 | `db/market.ts`、Drizzle script | 因 D1 未綁定且清理後無 runtime 使用，移除整套行情資料庫檔案與未使用依賴 | 無使用者畫面影響 |
| `app/market/page.tsx` | metadata 宣稱即時排行 | 路由 | 改為資料建置狀態說明 | 不顯示即時或延遲行情承諾 |
| `app/methodology/page.tsx` | 描述第三方即時行情、週比較、流動性、備援快照與技術線圖／新聞 | 導覽 | 改寫為官方公告資料原則、來源與更新時間規則 | 刪除行情方法章節 |
| `app/about/page.tsx`、`app/disclaimer/page.tsx`、`app/privacy/page.tsx` | 多處宣稱行情、價格排序、技術線圖、新聞或第三方行情 | 導覽 | 移除行情與第三方服務敘述，更新品牌及永久限制 | 保留只讀、非建議、無會員付款廣告聲明 |
| `app/layout.tsx`、`README.md` | 使用舊品牌並以興櫃報價為定位 | 全站 metadata、專案說明 | 更新品牌與固定副標題 | Open Graph 與首頁標題使用新品牌 |
| `public/og.png`、`public/og-preview.png` | 舊品牌社群預覽圖片 | `app/layout.tsx` | 移除圖片與 metadata 引用；本階段不生成或部署新圖片 | 社群 metadata 保留新品牌文字，不提供舊圖片 |
| `package.json`、`package-lock.json` | 無 Yahoo 套件；Drizzle 只服務將移除的資料層；缺少 typecheck script 與新品牌描述 | npm | 移除未使用 Drizzle 套件，加入 description 與 `typecheck`，以 npm 更新 lockfile | 無畫面影響 |

## 無命中項目

- `worker/`：沒有 Yahoo、券商接口或行情 fallback。
- `scripts/update-company-basic-snapshot.mjs`：只更新 TPEx 官方公司基本資料快照，沒有 Yahoo。
- 環境變數範例：專案目前沒有 `.env.example` 或其他環境變數範例，也沒有 Yahoo 變數。
- `next.config.ts`、`vite.config.ts`、`.openai/hosting.json`：沒有 Yahoo 設定。
- `public/`：沒有 Yahoo Logo；只有舊品牌 Open Graph 圖片需要移除。

## 移除後允許保留的「價格」資料

競拍最低投標價、得標價、暫定承銷價與實際承銷價屬於 TWSE／TPEx 公開的上市櫃事件公告欄位，不是即時或延遲市場股價。它們可留在進度資料中，但不得用來計算行情漲跌、溢價、買賣訊號、目標價或獲利保證。
