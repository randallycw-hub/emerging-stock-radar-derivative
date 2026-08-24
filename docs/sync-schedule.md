# 資料同步、快照與健康狀態

所有排程以 `Asia/Taipei` 解讀；資料庫的 `fetchedAt`、`normalizedAt` 存 ISO 8601 時間，市場資料日期存 `YYYY-MM-DD`。只有來源為 `APPROVED` 且 adapter 通過驗收後才啟用。

## 交易日排程

| 時間 | 工作 |
|---|---|
| 16:30 | 第一次取得興櫃盤後日行情 |
| 18:30 | 主要盤後同步：興櫃日行情、公司基本資料、上市櫃申請、債券發行資料及餘額 |
| 20:30 | 只重試資料日期尚未更新至預期日期的來源 |
| 22:30 | 以 `Asia/Taipei` 資料日執行完整市場候選：重新取得完整且已驗證的 11406 名冊、核心條款與核心 CB 盤後行情，再做候選驗證與健康檢查 |
| 次日 08:00 | 補抓前一交易日仍未成功的資料 |

若官方來源不保證固定時間，以來源資料日期判斷是否重試，不把某一時刻硬編碼為必定完成。

22:30 的可轉債入口為 `node scripts/run-nightly-market-refresh.mjs --date YYYY-MM-DD`。指定日期會對應到該日 `22:30 Asia/Taipei`；手動重跑也走相同來源日期、schema、筆數、hash 與 cross-file candidate 驗證，沒有略過驗證的參數。CLI 只產生通過驗證的靜態建置輸入，不讀取 hosting token，也不呼叫部署或 build hook。

## 可轉債完整名冊與生命週期

每次 22:30 候選以當次完整、已驗證的 11406 名冊為 current set，逐 `bondCode` 產生新增、更新與封存差異。HTTP 200 與可解析 CSV 不足以證明完整；候選必須另與當次官方轉換公司債索引的獨立 bond-code census 核對，census 中每一檔都必須存在於 11406。只有兩個官方集合核對成功時才能把前次存在、當次消失的債券標為 `removed_from_official_roster`；部分名冊或失敗回應不得觸發封存。

- 當日零成交仍保留 active，成交狀態為 no-trade，OHLC 保持 `null`；不得以昨收、均價或其他債券資料補值。
- 到期、已驗證提前贖回下櫃、餘額為零及從完整名冊消失依既有明確規則封存；封存紀錄保留歷史並可被查詢。
- issuer research、法人、贖回與承銷屬 optional。單一 optional 來源失敗時，只能沿用該公司／該市場／該來源自己的上一份 validated snapshot，並標為 stale；不得跨公司、跨市場或跨來源借值。

## 月營收與低頻來源

- 每月 1–11 日每天 08:30 同步興櫃月營收。
- 10 日後檢查完整率；11–15 日針對缺漏公司每天補同步。
- 平時每週一次檢查修正資料，不需每小時更新。
- 集保結算所月資料只有在精確來源 APPROVED 後，依官方月頻率同步，不得宣稱每日。
- 支援受保護的本機／維運手動同步命令，第一版不建公開管理後台。

## 成功條件

HTTP 200 不代表同步成功。完整成功必須同時符合：

1. Registry 仍為 `APPROVED`。
2. Schema 驗證通過。
3. 每筆必要核心 CB 行情及每個 current issuer 的核心股票收盤資料，都明確帶有 runner 指定的市場日期；缺日期、混合日期或舊日期均拒絕。
4. 11406 bond-code 集合通過另一份當次官方轉換公司債索引的完整性核對，不以固定最低筆數猜測完整。
5. 唯一鍵沒有異常大量重複。
6. 正規化成功率達來源個別門檻。
7. 快照雜湊、筆數與完整成功旗標已記錄。

只有完整成功 run 可做資料消失比對。部分成功或失敗不得判定下櫃、到期或失效。

## 流程

```text
排程或受保護手動命令
→ 驗證來源 APPROVED
→ 建立 IngestionRun
→ 有限逾時與最多 2 次退避重試
→ 保存 RawSnapshot metadata
→ Schema 驗證
→ 正規化與 attribution
→ 完整性及差異檢查
→ 冪等寫入 Repository
→ 衍生事件、狀態與提醒
→ 更新 SourceHealth / DataFreshness
```

不得改用其他來源 fallback；同一來源以租約避免同步重疊。

## RawSnapshot 與保存

每筆 snapshot metadata 保存 `sourceId`、`fetchedAt`、HTTP 狀態、資料日期、回應雜湊、筆數、schema 版本及是否完整成功。原始內容是否能保存及保存多久取決於 registry 的人工授權結果：

- `PENDING`：不做正式快照保存。
- `APPROVED` 且允許快取但未允許歷史：只保留最後一份成功快照及必要稽核 metadata。
- `APPROVED` 且明確允許歷史：預設保留最近 90 日每日快照與 13 個月月資料；更長期間須另行批准。
- 授權撤回：停止新快照，既有資料依批准紀錄決定刪除或封存。

不得把正式大量資料寫進 Git 追蹤 JSON。

## 健康與失敗

`SourceHealth`：`HEALTHY | DELAYED | PARTIAL | STALE | UNAVAILABLE`。
`DataFreshness`：`CURRENT | DELAYED | STALE | UNKNOWN`。

- 單一失敗：其他來源照常，顯示該來源最後成功時間。
- 部分成功：整體標 `PARTIAL`，保留可用資料，不執行消失比對。
- 全部失敗：網站仍載入最後成功資料或清楚無資料狀態。
- 延遲／過期：門檻依 registry 的頻率與窗口計算，不以 HTTP 時間猜測。
- 授權待確認：不同步，顯示 `UNKNOWN`。
- 來源停止：標 `UNAVAILABLE`，不切換 Yahoo、CBAS、券商或未批准來源。

可轉債 nightly candidate 採原子切換。完整 11406 名冊、核心條款或核心 CB 行情任一必要來源失敗，核心 CB／股票資料日期不等於 runner 指定日期，或候選 schema/hash/count/cross-file 驗證失敗時，不建立新的有效 generation，也不切換 `current.json`；前一版 `current.json`、workbench 與 history 必須逐 byte 保持不變。實際 market builder 必須先以 central registry 的 exact URL 與 `APPROVED_FOR_PRODUCTION` 狀態產生 optional authorization plan，才把 candidate-local fetch dependency 傳入 collector；未登錄、撤銷或非 production-approved 的 optional resource 在 underlying request boundary 的嘗試次數必須為零，其他仍核准的同類來源可獨立繼續。測試使用固定資料情境，不覆寫 process-global `fetch`，也不提供可替換 market builder。optional 來源失敗只影響自身 stale/unavailable 狀態，不得掩蓋必要來源失敗。

## 歷史更正與部署邊界

一般 nightly 流程對 `bond-market-history.json` 僅 append 或同值冪等合併；同債券同日期若內容不同，一律拒絕，不得靜默覆寫。正式更正只能由獨立 backfill/correction 流程同時提供 exact data-only manifest 與獨立 captured official evidence record。manifest 欄位恰為 `bondCode`、`date`、`sourceId`、`retrievedAt`、`sha256`、`beforeHash`、`afterHash`；evidence 欄位恰為 `sourceId`、`resourceUrl`、`retrievedAt`、`sha256`、`payload`，其中 `payload` 必須是該 URL 擷取的原始 TPEx `cbDayQry` JSON。系統驗證兩份紀錄的來源／擷取時間／hash 完全相同及 `sha256(payload)`，再把 raw payload 送入既有核准 URL、request contract 與官方 CB 行情 parser；manifest 的 target／`afterHash` 必須等於 parser 產生並依未更正欄位重算的 history point，且不得改動其他既有 bond/date，才重建候選。把 normalized candidate 直接 `JSON.stringify` 後自行簽 hash 不接受；callback、檔案路徑或額外欄位也不接受。

資料同步與 production hosting 是兩個責任邊界：本 repo 的 runner 最多完成已驗證靜態輸入與 pointer 切換；production build、發布、版本切換與回滾由另行授權的 hosting 排程負責。repo 不保存 hosting token 或 build-hook URL，runner 也不觸發外部部署。

每次 run 保存程式版本、開始／結束時間、讀取／接受／拒絕筆數、結果及錯誤摘要；敏感或完整回應不寫入 log。
