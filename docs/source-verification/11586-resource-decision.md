# 11586 資源採用決策

檢查日期：2026-07-26
基線：`623de5532b1a947cfff289890442f2cc8b568002`
目前資料集狀態：`APPROVED_FOR_V1_DESIGN`

## 決策摘要

本次將 CSV 與 OpenAPI 分開評估，不因 OpenAPI 的錯位風險否決 CSV，也不因 CSV 可用而忽略 OpenAPI 風險。

- CSV：建議列為 `VERIFIED_FOR_IMPLEMENTATION` 候選，提交人工 Source Registry amendment 審核；本文件不直接升級狀態。
- OpenAPI `/company/applylistingLocal`：建議列為 resource-level `SUSPENDED`／`NOT_APPROVED_FOR_DATA_INGESTION` 候選，只保留 schema drift 比較證據，不得作正式 ingest 或 fallback。
- 唯一主要 resource 建議：若人工核准，僅選資料集頁面列出的 CSV；系統不得在 CSV 失敗時自動切換 OpenAPI。
- Dataset-level：維持 `APPROVED_FOR_V1_DESIGN`，直到人工核准 CSV resource 並完成 dataset-level amendment。

## CSV resource 證據

資源 URL：
`https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data`

| 證據 | 值 |
| --- | --- |
| HTTP status | 200 |
| Content-Type | `text/csv;charset=utf-8` |
| 官方 response hash | `sha256:8e7b9d81b54701dc75e3f0550cecd0f2d2968ddd09346935d46ed7108d58fd75` |
| 官方 data row count | 695 |
| Fixture row count | 2 |
| Fixture hash | 見 `tests/fixtures/source-verification/11586/metadata.json` |

資料集頁面 [11586](https://data.gov.tw/dataset/11586) 列出的欄位包括公司代號、公司簡稱、申請日期、董事長、申請時股本、審議日期、董事會通過日期、上市契約備查日期、股票上市日期、承銷商、承銷價與備註；頁面同時標示臺灣證券交易所、政府資料開放授權條款第 1 版及免費。

### CSV 語意結論

目前 Fixture、schema、日期 parser、identity comparator 與 mapping 可驗證下列非行情欄位：公司代號、公司名稱、申請日期、董事長、申請時股本、審議日期、董事會通過日期、上市契約備查日期、上市日期、承銷商與備註。日期保存為 `YYYY-MM-DD`；空日期保留為未提供；公司代號加申請日期作為重複檢查 identity。

`承銷價` 只作原始欄位排除測試，不進入 normalized model，也不會被前端或正式資料模型使用。

目前未發現 CSV Fixture 中的欄位錯置、日期型別或 identity 未解決問題；但 Fixture 是最小化 contract sample，不等同於已發布完整市場快照。

## OpenAPI 證據與錯位風險

Endpoint：`https://openapi.twse.com.tw/v1/company/applylistingLocal`

| 證據 | 值 |
| --- | --- |
| HTTP status | 200 |
| Content-Type | `application/json` |
| 官方 response hash | `sha256:f15a53807561b1da17355d899c5a030beaac714905e8b249882a6329350ea3fd` |
| 官方 record count | 695 |

實際回應前兩筆顯示明確語意錯位，例如：

```text
Code = 1
Company = 7843
ApplicationDate = 英柏得
Chairman = 1150724
AmountofCapital  = 林傳生
CommitteeDate = 334400
```

`ApplicationDate` 的值呈現公司名稱、`Chairman` 的值呈現日期、`AmountofCapital` 的值呈現董事長、`CommitteeDate` 的值呈現資本額，不能依 property name 直接 mapping。這是值與欄位語意不一致的實證，不是單純 CSV／JSON 格式差異。

因此 OpenAPI：

1. 不可作正式資料來源。
2. 僅供 OAS／schema drift 與錯位比較。
3. 不得作 CSV 的 fallback。
4. 不得據此產生上市申請事件或 published snapshot。

## Swagger／OAS 角色

Swagger URL：`https://openapi.twse.com.tw/v1/swagger.json`
HTTP status：200
Content-Type：`application/json`
Response hash：`sha256:2c2cecccb7a220ac9e263228a7659aa49b1ada5aea397650e601ad3dfcc48043`

Swagger UI 確認存在 `/company/applylistingLocal` operation，但 OAS 只能證明 endpoint 與 schema 文件存在，不能證明實際 payload 的欄位值語意可靠。因此 OAS 不得單獨授權資料 ingest。

## Resource-level 與 Dataset-level 建議

| 層級 | 建議 | 本輪是否直接修改 Registry |
| --- | --- | --- |
| CSV resource | `VERIFIED_FOR_IMPLEMENTATION` 候選，等待人工核准 | 否 |
| OpenAPI resource | `SUSPENDED`／`NOT_APPROVED_FOR_DATA_INGESTION` 候選 | 否 |
| Dataset 11586 | 維持 `APPROVED_FOR_V1_DESIGN` | 否 |

建議進入人工 Source Registry amendment：人工覆核 CSV 資源與資料集頁面對應、CSV 欄位語意、顯名文字、商業利用條款與 primary resource 選擇。人工決定前不得撰寫正式 11586 adapter。

## 尚未解決風險

- CSV 的長期欄位穩定性與官方內容更新仍需後續 smoke／schema drift 監控。
- OpenAPI 的欄位錯位原因尚未由提供機關修正或正式說明。
- Dataset-level 狀態尚未完成人工 amendment；不得宣稱已核准正式上線。
- 本資源不代表完整上市櫃進度名錄，不得據此宣稱完整市場涵蓋。

本輪未修改 Source Registry，未建立 adapter、D1、API、頁面或部署設定，未開始 Task 5。
