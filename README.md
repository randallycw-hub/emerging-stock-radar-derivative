# 興櫃雷達｜獨立衍生版

臺灣興櫃市場、IPO 時程、事件進度與公開公司資訊的唯讀網站。

## 資料原則

- TWSE、TPEx 與公開資訊觀測站等官方來源優先。
- IPO 階段互斥，正式掛牌後移出待觀察名單。
- 競拍日期、掛牌日期、最低投標價、得標加權平均價及實際承銷價分開保存。
- 對外內容僅供資訊整理，不構成個別投資建議。

## 本機開發

需要 Node.js 22.13 或更新版本。

```powershell
npm ci
npm test
npm run dev
```

部署由獨立的 `.openai/hosting.json` 與 Sites project 管理，不得改用原網站的 project ID。
