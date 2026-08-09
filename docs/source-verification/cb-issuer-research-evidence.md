# 可轉債發行公司月營收來源實作前驗證證據

證據記錄上界：`2026-08-09T09:56:01.6338243Z`

狀態：`VERIFIED_FOR_IMPLEMENTATION`

本文件只保存 controller 於上述時間點前立即取得的唯讀官方 response 證據、最小 fixture、來源政策與 parser 契約。本階段不執行 live fetch、不建立 runtime adapter、不發布完整上市／上櫃資料，也不將任一 resource 標為 production approved。

## 官方資料集與授權

| 市場 | data.gov.tw 詮釋資料頁 | 提供機關 | 授權／費用 |
|---|---|---|---|
| 上市 | `https://data.gov.tw/dataset/18420` | 金融監督管理委員會證券期貨局 | 政府資料開放授權條款-第1版（OGL 1.0）；免費使用 |
| 上櫃 | `https://data.gov.tw/dataset/56510` | 金融監督管理委員會證券期貨局 | 政府資料開放授權條款-第1版（OGL 1.0）；免費使用 |

兩個詮釋資料頁均列出下節相同的 14 欄。以上只證明官方來源、公開授權與實作前契約，不等於正式環境核准；正式顯名、live smoke 與 registry 升級仍須另案人工審查。

## Controller 提供的 response 證據

Controller 說明兩份 response 均在 `2026-08-09T09:56:01.6338243Z` 前立即取得，但沒有提供更細的個別擷取時間。因此 metadata 記錄這個可證明的時間上界與精度說明，不捏造個別 `retrievedAt`。

| 市場 | 精確 requested／final URL | HTTP | bytes | data rows | 完整 response SHA-256 |
|---|---|---|---:|---:|---|
| 上市 | `https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv` | `200`; `text/csv` | 203,061 | 1,082 | `3a344cdfa953daf6c13171dd433e6e756a948e2a25bd7fd2426eef6739aa4915` |
| 上櫃 | `https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv` | `200`; `text/csv` | 164,863 | 891 | `4d6f3c6c4691efe6472850c7a1773500ce77447210d96dcec9295439d08a1801` |

Requested URL 與 final URL 完全相同。唯讀政策只接受大寫 `GET` 與上述兩個逐字相同的 HTTPS URL；credentials、fragment、query、redirect、alternate host、不同 path、額外 slash 或其他 method 一律 fail closed。沒有 fallback URL。

## Reviewed 14 欄契約

1. 出表日期
2. 資料年月
3. 公司代號
4. 公司名稱
5. 產業別
6. 營業收入-當月營收
7. 營業收入-上月營收
8. 營業收入-去年當月營收
9. 營業收入-上月比較增減(%)
10. 營業收入-去年同月增減(%)
11. 累計營業收入-當月累計營收
12. 累計營業收入-去年累計營收
13. 累計營業收入-前期比較增減(%)
14. 備註

共用 parser 沿用資料集 94025 的精確 alias mapping、BOM 處理、日期／decimal 正規化與 `(資料年月, 公司代號)` duplicate check。未知或缺少 header、無效民國日期、無效 decimal、HTML body、空資料集及重複 identity 都拒絕整份輸入。來源提供的增減率原值直接保留，不由營收重算；normalized 單位固定為 `仟元`；`備註` 僅留在 raw row，不進 normalized model。

`parse94025Csv(text)` 只改為委派同一共用 seam，仍使用既有 `94025 CSV` 錯誤標籤；其 public type、normalization 與 schema comparison 行為不變。

## 最小 fixture 與抽樣

所有 row cell 均逐字取自 controller 提供的代表列；只移除未選取的官方列，未改寫資料。fixture 保留完整 14 欄與檔尾換行，repository SHA-256 由建立後的實際 bytes 計算。

| Fixture | 選取 identity（出表日期／資料年月／公司代號） | rows | repository SHA-256 |
|---|---|---:|---|
| `listed-minimal.csv` | `1150717/11506/1101`, `1150717/11506/1102` | 2 | `7e0bb95bc7d830ea563dfb71a2b9cd77a0d78fa179e26d9c832a9ad72a781f19` |
| `otc-minimal.csv` | `1150717/11506/1240`, `1150717/11506/1259` | 2 | `d72711731a25a54508dd09ca51310ad9048ff1a3d66cf3a8b5bc6625e2895d80` |

`metadata.json` 分別記錄 metadata page、method、requested/final URL、HTTP status、Content-Type、完整 response bytes/hash、完整列數、fixture hash、fixture 列數與選取 identities。測試從 repository 實際讀取 bytes 後重算 fixture hash，並逐欄解析所選 identity；沒有 live network 或正式資料 loader。

## 待後續核准事項

- 需要獨立的受限 live smoke 再驗 final URL、Content-Type、bytes 上限、最新資料年月、active-CB 精確代碼 match 與衝突數。
- runtime 只能發布 active 11406 issuer 的最小研究投影，不得把完整 L/O CSV 暴露到瀏覽器。
- 任一市場失敗只能沿用同市場已驗證的上一版 section；不得改用另一市場、第三方、券商或名稱模糊比對。
- 本證據不得被解讀為 `APPROVED_FOR_PRODUCTION`；promotion 必須由後續人工審查逐一來源決定。
