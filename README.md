# 興債觀測網

興櫃與可轉債市場雷達
興櫃公司、可轉債與上市櫃進度資訊

<!-- ?閫皜祉雯 / ???砍?頧??撣??脣漲鞈? -->

這個專案提供興櫃、可轉債與 IPO 時程的資料檢視介面。正式核心第一階段使用本機已驗證資料，不依賴 Cloudflare；GitHub Pages 僅作靜態展示。

## 本機啟動

```powershell
npm.cmd install
npm.cmd run dev
```

正式核心路由：

- `/dev-preview`：市場總覽與搜尋
- `/dev-preview/emerging`：興櫃資料，價格欄位以收盤價語意呈現
- `/dev-preview/bonds`：可轉債完整橫式資料表與明細
- `/dev-preview/ipo`：IPO 時程資料狀態

## 驗證

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

缺少經驗證來源的欄位會顯示「—」，不以推測值填補；每個資料區塊都應顯示資料日期與來源。
