# 官方盤後日資料設計

人工審查日期：2026-07-20

## 興櫃 VERIFIED_FOR_IMPLEMENTATION 來源

- 官方資料集：興櫃股票當日行情表。
- 政府資料集：[11747](https://data.gov.tw/dataset/11747)。
- 官方端點：`https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics`。
- 狀態：`VERIFIED_FOR_IMPLEMENTATION`。
- 授權：政府資料開放授權條款－第1版。

批准只涵蓋以下欄位：

| 外部欄位 | 內部名稱 | 語意 |
|---|---|---|
| `Date` | `marketDate` | 官方資料日期 |
| `Time` | `sourceTime` | 官方資料時間，不宣稱即時 |
| `SecuritiesCompanyCode` | `companyIdentifier` | 公司代號 |
| `CompanyName` | `companyName` | 公司名稱，關聯仍以代號為準 |
| `PreviousAveragePrice` | `previousDailyAveragePrice` | 前日均價 |
| `Highest` | `dailyHighPrice` | 日最高 |
| `Lowest` | `dailyLowPrice` | 日最低 |
| `Average` | `dailyAveragePrice` | 興櫃日均價，絕不可稱收盤價 |
| `TransactionVolume` | `transactionVolume` | 盤後成交量 |
| `ApplyingDate` | `listingApplicationDate` | 上市櫃進度日期 |
| `ApplyingStatus` | `listingApplicationStatus` | 上市櫃進度 |

第一版明確排除 `BuyingPrice`、`BuyingQuantity`、`SellingPrice`、`SellingQuantity`，避免形成盤中報價介面；同時排除 `LatestPrice`、`Buy/Sell`、`SuspendTime` 及所有未列入白名單的欄位。只允許衍生均價漲跌額、均價漲跌幅、上漲/下跌/平盤分類、估算成交金額（盤後）與同日排行；不得發布即時、買賣價量或 `LatestPrice`，不得計算 K 線或技術指標。

`估算成交金額（盤後）` 是以 `當日成交均價（盤後）×成交量` 計算的估算值，源自四捨五入的來源值，不能用於精確對帳。

```ts
interface EmergingEndOfDayObservation {
  id: string;
  companyId: string;
  companyName: string;
  marketDate: string;
  sourceTime: string;
  previousDailyAveragePrice?: string;
  dailyAveragePrice: string;
  dailyHighPrice?: string;
  dailyLowPrice?: string;
  transactionVolume?: string;
  listingApplicationDate?: string;
  listingApplicationStatus?: string;
  attribution: SourceAttribution;
}
```

唯一鍵為 `companyId + marketDate + sourceId`。decimal 字串需通過非負格式驗證；最高、最低與平均間的合理性只作資料品質警示，不自行修正或使用浮點數運算。

## 顯示及新鮮度

- 區塊標題固定含「官方盤後資料」。
- 顯示市場日期、官方資料時間、本站擷取時間、來源與新鮮度。
- 固定顯示「盤後資料，非即時行情」。
- `dailyAveragePrice` 只能稱「當日加權平均成交價」或「日均價」，不能稱 `closePrice` 或收盤價。
- 資料日期不是最新交易日時，不得稱為今日價格。
- 無資料時顯示「官方盤後資料尚未提供」，不能顯示零。
- 過期時保留最後成功資料並警示，不以未授權來源補齊。
- 顯名為 `金融監督管理委員會證券期貨局 2026 興櫃股票當日行情表`，附資料集與 OGL 1.0 連結，不使用 Logo。

## 快照與商業利用

資料集 11747 明示 OGL 1.0。依條款第 2 條，可不限目的、免授權金重製、編輯及開發產品／服務；依第 3 條必須顯名，且不包含商標權。在履行顯名義務下保存最後成功快照及最近 90 日每日快照，不得把快照冒充即時資料。

## 可轉債盤後價格

目前沒有可提供個別債券盤後成交價格的 `APPROVED` 正式來源。`bond_cb_daily` 維持 `REJECTED`。不建立可轉債價格模型、路由或 placeholder adapter；介面顯示：

「盤後價格資料來源確認中，目前僅提供官方發行條件與事件資訊。」
