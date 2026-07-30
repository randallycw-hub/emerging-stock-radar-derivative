# 可轉債官方盤後市場資料證據

檢查時間：2026-07-30T05:51:01.055Z  
用途：確認可轉債收盤、標的股票收盤及目前轉換價的官方資料語意。此文件只核准精確列出的資源，不授權任何替代來源或自動 fallback。

## 資源與實際回應

| resourceId | 方法與官方資源 | HTTP／Content-Type | 實際筆數 | 證據結論 |
| --- | --- | --- | ---: | --- |
| `tpex-cb-day-query` | `POST https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry` | 200／`application/json;charset=UTF-8` | 41 | 以債券代碼及月份查詢，每列包含實際交易日期、交易模式、收市價、漲跌、開高低、成交筆數、單位、成交金額及平均價。 |
| `twse-stock-day-all` | `GET https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL` | 200／`application/json` | 1373 | 上市股票盤後收盤資料，含資料日、代碼、成交量值、開高低收、漲跌及成交筆數。 |
| `tpex-mainboard-daily-close` | `GET https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes` | 200／`application/json` | 10280 | 上櫃股票盤後收盤資料，含資料日、代碼、收盤、漲跌、開高低、均價、成交股數、金額及筆數。 |
| `tpex-conversion-index` | `POST https://www.tpex.org.tw/www/zh-tw/bond/convSearch` | 200／`application/json;charset=UTF-8` | 383 | 回傳發行機構代碼、名稱、債券名稱、掛牌日期及 MOPS 發行資料網址。 |
| `mops-conversion-detail` | `GET https://mopsov.twse.com.tw/mops/web/t120sg01?...` | 200／`text/html; charset=utf-8` | 1 | 明細頁含「發行時轉(交)換價格」、「最新轉(交)換價格」及「最近轉(交)換價格生效日期」。 |
| `tpex-bond-cb-daily` | `GET https://www.tpex.org.tw/openapi/v1/bond_cb_daily` | 200／`application/json` | 37 | 回應依金融機構代碼彙總買賣面額與金額，不含債券代碼或每檔收盤價，故不得當作可轉債行情。 |

完整回應 SHA-256、擷取時間、Content-Type 與筆數保存在 `tests/fixtures/source-verification/cb-market/metadata.json`。

## 可轉債行情合約

請求：

```text
POST https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry
Content-Type: application/x-www-form-urlencoded;charset=UTF-8
date=2026/07/30&code=35221&response=json
```

實際欄位順序：

```text
日期
交易模式
收市價
漲跌
開市價
最高價
最低價
成交筆數
單位
成交金額(元)
平均價
```

`date` 選定月份，回應是該月的等價／議價列；不能把查詢日當成每一列的價格日。以 `35221` 查詢時，`1150729` 等價交易列的收市價為 `103.5000`、單位為 `10`，而其他日期可為空白。正式解析必須保留列上的實際交易日期，空白列不得偽造為零價格。

## 股票盤後收盤合約

TWSE `STOCK_DAY_ALL` 實際欄位：

```text
Date, Code, Name, TradeVolume, TradeValue, OpeningPrice,
HighestPrice, LowestPrice, ClosingPrice, Change, Transaction
```

TPEx `tpex_mainboard_daily_close_quotes` 實際欄位：

```text
Date, SecuritiesCompanyCode, CompanyName, Close, Change, Open,
High, Low, Average, TradingShares, TransactionAmount, TransactionNumber
```

TPEx 回應另含最佳買賣、資本額及次日參考價等欄位；本期不匯入這些欄位。兩個資源都必須使用各列 `Date`，不得用本站擷取時間取代交易日。

## 目前轉換價合約

索引請求：

```text
POST https://www.tpex.org.tw/www/zh-tw/bond/convSearch
Content-Type: application/x-www-form-urlencoded;charset=UTF-8
name=bondIssuer&searchNo=&response=json
```

索引欄位：

```text
發行機構代碼
發行機構名稱
債券名稱
掛牌日期
發行資料
```

`發行資料` 只允許：

- protocol：`https:`
- host：`mopsov.twse.com.tw`
- path：`/mops/web/t120sg01`

2026-07-30 檢查 `35221` 的 MOPS 明細時，頁面顯示發行時轉換價 `19.5000` 元、最新轉換價 `18.2000` 元、最近生效日期 `115/01/30`。這些值只用作合約證據；正式資料仍須在每次更新時重新擷取、驗證並保留生效日。

## 明確隔離的錯誤資源

`bond_cb_daily` 實際欄位：

```text
Date
FinancialInstitutionsCode
FinancialInstitutionsName
ParValueOfPurchase
AmountOfPurchase
ParValueOfSell
AmountOfSell
```

它是金融機構買賣彙總，不是每檔可轉債行情。它不得用於收盤價、成交量、成交金額、轉換價值或溢價計算，也不得成為 `cbDayQry` 的 fallback。

## 使用邊界

- 僅使用盤後資料，不宣稱即時行情。
- 僅精確代碼關聯，不以名稱模糊配對。
- 不混用不同交易日計算一般溢價。
- 不採用 The Few、Yahoo、Goodinfo、CBAS、券商或其他第三方價格。
- 任一必要來源驗證失敗時保留上一個已驗證版本。

