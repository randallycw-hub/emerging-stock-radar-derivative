# 可轉債官方盤後市場資料資源採用決策

決策日期：2026-07-30  
範圍：可轉債收盤、標的股票收盤、目前轉換價與生效日。  
資料集層級：尚未取得 `APPROVED_FOR_PRODUCTION`；本次只允許建立嚴格 adapter、離線驗證與發布前 smoke test。

## 核准摘要

| 資源 | 狀態 | 允許用途 |
| --- | --- | --- |
| TPEx `bond/cbDayQry` | `VERIFIED_FOR_IMPLEMENTATION` | 依債券代碼查詢月內等價／議價盤後行情，保留每列實際交易日。 |
| TWSE `STOCK_DAY_ALL` | `VERIFIED_FOR_IMPLEMENTATION` | 上市標的股票盤後收盤與成交統計。 |
| TPEx `tpex_mainboard_daily_close_quotes` | `VERIFIED_FOR_IMPLEMENTATION` | 上櫃標的股票盤後收盤與成交統計。 |
| TPEx `bond/convSearch` | `VERIFIED_FOR_IMPLEMENTATION` | 取得發行機構、債券名稱及 MOPS 發行資料連結。 |
| MOPS `t120sg01` | `VERIFIED_FOR_IMPLEMENTATION` | 解析發行時／最新轉換價及最近生效日。 |
| TPEx OpenAPI `bond_cb_daily` | `SUSPENDED` | 不得匯入、不得 fallback；它是金融機構買賣彙總，不是每檔行情。 |

## 唯一允許的正式資源契約

### TPEx 可轉債盤後行情

```text
POST https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry
body template:
  new URLSearchParams({ date, code: bondCode, response: "json" })
```

必須以 `tables[0].fields` 驗證欄位順序，並從 `tables[0].data` 選擇不晚於請求日的實際交易列。禁止從查詢參數推導交易日。

### 上市／上櫃標的股票盤後收盤

```text
GET https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL
GET https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes
```

只接受列上的公司代碼與資料日。禁止名稱模糊配對；同一公司代碼在來源內重複或日期無法解析時，該候選資料不得發布。

### 目前轉換價

```text
POST https://www.tpex.org.tw/www/zh-tw/bond/convSearch
body:
  new URLSearchParams({ name: "bondIssuer", searchNo: "", response: "json" })
```

索引提供的明細網址只有在 protocol、host、path 同時符合以下條件時才可讀取：

```text
https:
mopsov.twse.com.tw
/mops/web/t120sg01
```

MOPS 頁必須同時存在「發行時轉(交)換價格」、「最新轉(交)換價格」及「最近轉(交)換價格生效日期」。缺少任一欄位時不得沿用其他網站的值。

## 隔離決策

`GET https://www.tpex.org.tw/openapi/v1/bond_cb_daily` 維持 `SUSPENDED`。

實際回應以 `FinancialInstitutionsCode` 分組，欄位是買入／賣出面額與金額，沒有債券代碼、每檔收盤價或每檔成交量。它與 `bond/cbDayQry` 語意不同，禁止：

1. 當作可轉債收盤價來源。
2. 當作成交量或成交金額來源。
3. 在 `cbDayQry` 失敗時 fallback。
4. 參與轉換價值、溢價或歷史價格計算。

## 正確性與發布條件

- 來源只可在 `VERIFIED_FOR_IMPLEMENTATION` 後建立 adapter。
- 所有價格保留自己的官方日期；不同日期不顯示一般同日溢價。
- 目前轉換價必須保留生效日，且只可套用於不早於生效日的估值日。
- 網路錯誤、429 或 5xx 只重試相同 URL 與相同 body，最多三次。
- 不切換第三方來源。
- 候選快照通過欄位、日期、唯一鍵、筆數、精確關聯及衍生值驗證後，才可進入發布候選。
- 本決策不等於 `APPROVED_FOR_PRODUCTION`；正式公開前仍須通過 live smoke、顯名及整體頁面驗證。

