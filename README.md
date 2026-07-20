# 興債觀測網

興櫃公司、可轉債與上市櫃進度資訊。

## 資料原則

- 新資料來源必須先確認官方來源、授權及商業利用條件。
- 不使用券商網站資料接口、未公開 API、即時股價或延遲股價。
- IPO 階段互斥，正式掛牌後移出待觀察名單。
- 競拍日期、掛牌日期、最低投標價、得標加權平均價及實際承銷價分開保存。
- 對外內容僅供資訊整理，不構成個別投資建議。
- 興櫃與可轉債正式資料來源尚在建置，本階段不載入 fixture 或 mock。

## 本機開發

需要 Node.js 22.13 或更新版本。

```powershell
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm run dev
```

部署由獨立的 `.openai/hosting.json` 與 Sites project 管理，不得改用原網站的 project ID。
