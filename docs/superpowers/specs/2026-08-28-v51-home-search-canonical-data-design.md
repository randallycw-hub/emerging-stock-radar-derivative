# V5.1 首頁、搜尋與 Canonical Data 設計

## 目標

將既有已驗證的興櫃、IPO、可轉債、股票收盤與 CB 歷史快照，在 staging 時投影為一份安全的公開研究 read model。首頁、全站搜尋與既有公司連結共用這份 read model；前端不各自抓取原始市場資料，也不重新定義金融數值。

## 資料流

```text
官方 snapshots + 已驗證 manifest
  -> public-market-research.js（純投影、驗證日期、保留缺值）
  -> data/<generation>/market-research.json（公開 read model）
  -> 靜態首頁 HTML + site-search.js + home-page.js
```

`market-research.json` 的 `meta` 保留 `dataDate`、`updatedAt`、`recordCount`、`status` 與本輪實際採用的官方來源 URL；不包含 source ID、原始證據識別、缺漏診斷或個資。

## 搜尋

索引由公司、IPO 與 CB 正規化資料組成。每筆結果僅有可公開的代碼、名稱、市場、別名、canonical internal route 與資料日。

- 查詢先以 NFKC 正規化全形數字並 trim。
- CB 完整代碼優先顯示 CB route；股票完整代碼先顯示公司並帶出相關 CB；名稱採部分比對。
- 索引讀取失敗與「查無結果」是兩個可觀察狀態，不能共用空陣列。
- Ctrl/Cmd+K、Esc、上下鍵、Enter、點外關閉與行動按鈕維持可存取操作。

## 首頁模組與資料規則

| 模組 | 來源與規則 | 無資料語意 |
| --- | --- | --- |
| 有 CB 標的漲幅排行 | active CB 對應股票；只採股票行情日期等於 snapshot `dataDate` 的官方資料 | `資料暫時無法取得`，不把不同日期混算 |
| 興櫃排行 | TPEx 興櫃 canonical records；漲跌排行排除無成交樣本 | `—` 或空清單，不把無成交視為 0% |
| CB 成交排行 | CB history 同日成交量；週量只加總同一段已驗證交易日 | `今日無成交` 只在已驗證同日資料確實為 0；資料缺口則 `資料暫時無法取得` |
| CB 發行進度 | 11406 正式條款中的已公告 issue/listing date 與公開事件 | 未公布日期為 `待公告`；不推算 |
| CB 官方公告 | 已公開的 CB event 與官方 `sourceUrl` | 市場新聞未有可公開來源時獨立顯示無可用資料 |
| IPO 7/30 日行事曆 | 已驗證 IPO event；僅競拍、申購、抽籤、承銷與掛牌日期 | 未公告日期不進入行事曆 |
| 最新公開事件 | 既有已公開跨市場事件投影，首頁僅 5–8 筆 | 空狀態不以 0 取代 |

## 安全與資料完整性

- staging 仍先驗證 manifest、runtime、hash 與 generation 才建立 read model。
- 只複製白名單靜態資產；新 read model 在通過驗證後寫入發布目的地。
- 不使用外部付費、登入或授權不明資料；市場新聞不寫入任何金融欄位。
- `null`、fetch error、尚未公告、真實 0 與當日無成交在模型層是不同 state。

## 相容性決定

既有 V5 公司頁、KLineChart、IPO／CB 詳細頁與 UX 2.0 市場事件頁保留。V5.1 只把它們的 route 和已公開資料納入同一搜尋與首頁 read model，不回退既有功能。
