# 完整市場、IPO 與可轉債工作台實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成興櫃收盤價版、原邏輯五階段 IPO 時程板，以及可轉債契約總表與詳細查核工作台。

**Architecture:** 保留既有 `Dashboard` 作為正式頁面容器；市場資料、IPO 事件與可轉債契約分開建模，所有列表都顯示資料日期、來源與不可用狀態。開發預覽沿用 fixture，正式頁面只讀已驗證的公開資料，不把即時行情或推測值混入。

**Tech Stack:** Next/vinext、React、TypeScript、Cloudflare Worker/D1、Node test runner。

## Global Constraints

- 興櫃只呈現官方收盤／日終語意，不呈現買價、賣價或即時更新。
- IPO 階段只能由已公告日期推導；缺日期顯示未公告，不推估。
- 可轉債缺漏欄位顯示「—」，不自行補值。
- 所有公開資料保留官方資料日期、抓取時間與來源連結。
- 不新增推薦、套利、即時報價或虛構市場資料。

---

### Task 1: 興櫃收盤價市場頁

**Files:**
- Modify: `app/Dashboard.tsx`
- Modify: `app/globals.css`
- Modify: `lib/domain/types.ts`（僅在已驗證日終欄位需要時）
- Test: `tests/market-workbench.test.mjs`

- [ ] 先建立市場欄位與不可用狀態測試。
- [ ] 將 `ConstructionView` 替換成收盤價市場表，移除買價、賣價與即時更新文案。
- [ ] 加入搜尋、產業、流動性分區、排序、資料日期與來源狀態。
- [ ] 加入公司抽屜的基本資料、月營收、公告與 IPO 連結。
- [ ] 執行市場測試與完整測試。

### Task 2: 原邏輯五階段 IPO 時程板

**Files:**
- Modify: `app/Dashboard.tsx`
- Modify: `app/globals.css`
- Modify: `lib/tracker.mjs`（僅補狀態排序或下一事件欄位）
- Test: `tests/ipo-workbench.test.mjs`

- [ ] 建立五階段與下一事件排序測試。
- [ ] 保留送件、審議、董事會、契約、競拍／買賣五欄流程板。
- [ ] 保留未來關鍵事件與公開事件明細表。
- [ ] 以台灣時區計算距今天數，缺日期顯示未公告。
- [ ] 執行 IPO 測試與完整測試。

### Task 3: 可轉債完整契約資料

**Files:**
- Modify: `app/dev-preview/bonds/page.tsx`
- Modify: `app/dev-preview/bonds/[bondId]/page.tsx`
- Modify: `app/dev-preview/preview.css`
- Modify: `lib/preview/types.ts`（只有現有 fixture 欄位不足時才擴充）
- Test: `tests/dev-preview-routes.test.mjs`

- [ ] 補齊契約總表欄位與固定識別欄。
- [ ] 詳細頁加入條款、轉換權、賣回權、餘額異動、事件與來源區塊。
- [ ] 對尚未有官方欄位的贖回、停止轉換、付息資訊顯示明確未提供狀態。
- [ ] 驗證桌面橫向表格與手機欄位順序。
- [ ] 執行預覽測試與完整測試。

### Task 4: 公開展示與部署同步

**Files:**
- Modify: `app/showcase/page.tsx`
- Modify: `static-showcase/index.html`
- Modify: `README.md`

- [ ] 將展示頁標示為前端展示，不冒充正式資料。
- [ ] 保持 Cloudflare 靜態展示 Worker 與正式資料 Worker 分離。
- [ ] 建置、檢查差異、提交版本；部署只在驗證成功後進行。

