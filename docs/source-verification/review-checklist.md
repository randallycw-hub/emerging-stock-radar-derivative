# 來源驗證與 Fixture 人工覆核清單

此清單僅保存人工覆核結果；完成清單不會自動變更 Source Registry 或核准 production。

## 每個資料集必填欄位

- [ ] `sourceId` 與資料集 ID（僅限 11406、94025、11586、28567）一致。
- [ ] 已記錄官方 HTTPS resource URL、取得 UTC 時間與 HTTP Content-Type。
- [ ] 已確認 provider、資料集名稱與「政府資料開放授權條款－第1版」適用範圍。
- [ ] 已保存同次原始 response 的 SHA-256、列數，以及裁切後 fixture 的 SHA-256、列數。
- [ ] fixture 列數不大於來源列數，且只保留測試所需最少列與欄。
- [ ] 已列出所有排除的敏感欄位；個資存在與去識別化聲明一致，並有具體理由。
- [ ] 人工已確認 fixture 不含未經核准欄位、價格、成交量、投資建議或未授權資料。
- [ ] 已確認 fixture 僅供 tests 使用，production runtime 不得載入。
- [ ] 已記錄抽樣方法、覆核人、覆核 UTC 時間與 evidence path。

## 簽核

| 欄位 | 值 |
| --- | --- |
| 資料集 ID | |
| 覆核人 | |
| 覆核 UTC 時間 | |
| Evidence path | |
| 結論（通過／暫停／需補件） | |
| 補件或暫停理由 | |

## 興櫃盤後行情 `tpex_esb_latest_statistics` 專項覆核

- [ ] Resource: GET https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics
- [ ] Status: VERIFIED_FOR_IMPLEMENTATION
- [ ] Purpose: 興櫃股票當日盤後行情
- [ ] Published source fields: Average, PreviousAveragePrice, Highest, Lowest, TransactionVolume
- [ ] Allowed derived fields: 均價漲跌額、均價漲跌幅、上漲/下跌/平盤分類、估算成交金額（盤後）、同日排行
- [ ] Forbidden fields: BuyingPrice, BuyingQuantity, SellingPrice, SellingQuantity, LatestPrice, Buy/Sell, SuspendTime
- [ ] 已確認 `估算成交金額（盤後）` 是以 `當日成交均價（盤後）×成交量` 計算的估算值，源自四捨五入的來源值，不能用於精確對帳。
- [ ] 已確認公開輸出沒有即時、買賣價量或 `LatestPrice`。
