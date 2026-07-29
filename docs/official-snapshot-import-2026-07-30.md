# 2026-07-30 官方資料快照匯入

本次從官方資料下載頁取得三份原始檔，匯入 `static-showcase/data/`，並保留原始欄位、來源 URL、下載日期、SHA-256 與筆數。

| 資料集 | 官方來源 | 筆數 | SHA-256 |
| --- | --- | ---: | --- |
| 94025 興櫃每月營收 | `https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv` | 354 | `f9bc7d149bb5a602fc798f0f1f5f007d0f8eff1aa6cd2a68f80084636249ac44` |
| 11406 可轉債發行資料 | `https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv` | 413 | `883dbc1cb7b589047e28f033b6e4d385dde6518d7c0209085f293058c9bae855` |
| 11586 IPO 申請資料 | `https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data` | 697 | `0373ecf384f13492d3be544a031a55ec6b04a36e2c3677345452454f07a01a4b` |

快照頁面會顯示完整原始資料，並明確標註「官方快照、非即時」。這次不會把快照直接升級為 production：11406 仍有部分官方列缺少債券簡稱，11586 存在官方歷史資料的日期順序異常，兩者都應在正式發布前由人工確認處理策略。
