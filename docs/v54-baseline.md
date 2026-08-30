# V5.4 改版前資料基線

- Commit：`bd0b1db38d17f2ca470359146754962cd2560a1e`
- 公開 generation：`generations/3b9f982ea995602c`
- 市場資料日：`2026-08-28`
- 擷取時間：`2026-08-30`（本機 V5.4 執行前）

下列檔案是 V5.4 的不可變回歸錨點；建置測試必須確認資料未因模型改寫而無聲遺失或變成零值。

| 已驗證輸入 | 筆數 | SHA-256 |
| --- | ---: | --- |
| `emerging-market.json` | 362 | `fcdda0b708e3533499c61d737e5ed67ab5496b46bac51c73c7ff1f4634f35366` |
| `ipo-events.json` | 1,439 | `a0a343255cee228d9e34ce44b4f7c2102861250575fe7582bd2919df6d160f7a` |
| `bond-workbench.json` | 401 | `f3da365589fe239a741007c25199395c2bd1a606208ca4594ffae967ba88527d` |
| `bond-market-history.json` | 15,646 | `a697185646939112b7b9f1497bf195fe3c1850a18a576e1a4bfe66b17577a3e9` |
| `bond-supplemental.json` | 1 snapshot | `8f50f144293c6789322c3aefae05aa6c1314f42edab74463ca349f948fd633da` |
| `cb-issuer-research.json` | 306 | `edd2e3623400341926945d94709318839e28ced09fb54760227be3a492e42eff` |

建置前會保留 source generation；建置後以同一個 inputs 與這些 count/hash 驗證輸入未被公開投影改寫。公開投影的雜湊可變，因為它會合法移除內部來源識別與診斷欄位；其內容一致性由 V5.4 QA report 驗證。
