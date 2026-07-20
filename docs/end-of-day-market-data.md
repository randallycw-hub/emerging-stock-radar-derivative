# 官方日終資料設計

日終資料是第一版的可選、獨立階段，不是核心功能。來源、欄位、商用、重製、快取、歷史保存與歸屬未人工批准前不得實作正式 adapter。

## 興櫃候選來源

候選：櫃買中心 `/tpex_esb_latest_statistics`，registry 狀態 `PENDING`。

| 外部欄位 | 允許的內部名稱 | 語意 |
|---|---|---|
| `Date` | `marketDate` | 官方資料日期 |
| `Time` | `sourceTime` | 來源標示時間，不宣稱即時 |
| `SecuritiesCompanyCode` | `companyIdentifier` | 公司代碼 |
| `Average` | `dailyAveragePrice` | 興櫃日均價；絕不可稱收盤價 |
| `Highest` | `dailyHighPrice` | 當日最高成交價 |
| `Lowest` | `dailyLowPrice` | 當日最低成交價 |
| `LatestPrice` | `lastTradePrice` | 最後成交價；只有欄位語意人工批准後才可使用 |
| `TransactionVolume` | `transactionVolume` | 當日成交量；只有授權與單位確認後才可使用 |

`BuyingPrice`、`BuyingQuantity`、`SellingPrice`、`SellingQuantity` 不納入第一版，避免形成盤中報價介面。不得計算或呈現漲跌幅、價格排行、K 線或技術指標。

## 模型

```ts
interface EmergingEndOfDayObservation {
  id: string;
  companyId: string;
  marketDate: string;
  dailyAveragePrice: string;
  dailyHighPrice?: string;
  dailyLowPrice?: string;
  lastTradePrice?: string;
  transactionVolume?: string;
  attribution: SourceAttribution;
}
```

唯一鍵為 `companyId + marketDate + sourceId`。所有 decimal 字串需通過非負格式驗證；最高、最低與平均間的合理性檢查只作資料品質警示，不自行修正或用浮點數運算。

## 顯示規則

- 區塊標題固定含「官方日終資料」。
- 顯示市場日期、來源發布／擷取時間及資料新鮮度。
- 沒有資料時顯示「官方日終資料尚未提供」，不能顯示零。
- 過期時保留最後資料但醒目標示，不以未授權來源補齊。
- 不使用「即時」、「延遲報價」或「收盤價」描述興櫃平均價。

## 可轉債日終資料

目前沒有經人工確認、可提供個別債券日終行情的官方候選來源。`bond_cb_daily` 已拒絕作此用途。本階段不建立模型、路由或 placeholder adapter；取得合格來源後須另做 registry 審查與獨立設計變更。
