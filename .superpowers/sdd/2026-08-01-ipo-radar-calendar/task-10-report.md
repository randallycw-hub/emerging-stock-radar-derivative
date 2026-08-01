# Task 10：正式 IPO 資料合約 reconciliation 報告

日期：2026-08-02（Asia/Taipei）

狀態：**IMPLEMENTED_AND_VERIFIED_LOCALLY**

## 範圍與安全

- 僅修改 IPO source validation、snapshot aggregation 與對應測試。
- 未修改 snapshot `schemaVersion`；仍為 `1`。
- 未提交完整或大量 live payload；live-like 測試資料只保留能重現合約邊界的最小欄位與列。
- live 驗證只對五個已核准官方 URL 做 HTTP GET，未寫入 D1、未呼叫發布流程、未部署 Sites。
- 所有 Node、測試與建置程序均設定 `UV_THREADPOOL_SIZE=2`，PowerShell parent process 使用 Windows `BelowNormal` 優先權；建置另設定 `VITE_MAX_THREADS=2`。

## 根因與實作政策

### 1. 11586 歷史 chronology anomaly

維持全面 chronology fail-closed，只隔離下列兩筆已人工核對的官方歷史列：

| sourceRecordId | application | review | board | contract | listing |
| --- | --- | --- | --- | --- | --- |
| `TWSE:6280:0931230` | `0931230` | `0930907` | `0930921` | `0931001` | `0931228` |
| `TWSE:2453:0890831` | `0890831` | `0890929` | `0891017` | `0890115` | `0900522` |

`sourceRecordId` 與上述五個原始日期必須逐字完全一致，而且錯誤必須確實是 chronology violation，才會隔離該列。隔離列不進入 normalized rows、snapshot 或事件。任何日期改動、新 id、新 chronology anomaly，或同列其他已驗證欄位錯誤仍會失敗。production source 保留具審核日期與理由的 `REVIEWED_CHRONOLOGY_ANOMALIES` 常數。

P1 複核補強：exact allowlisted anomaly 仍參與完整來源 canonical `(companyCode, applicationDate)` uniqueness 檢查。正常列使用 normalized identity；exact anomaly 使用相同的 required text/date canonical validators。每一筆 reviewed anomaly 最多只能隔離一次；同一 anomaly exact duplicate 出現兩次即拋 `duplicate application identity`，不能用 allowlist 無限降低來源 cardinality。日期斜線或 companyCode 空白等格式差異也不能繞過 duplicate identity。uniqueness 在所有列都已完成正常 normalize 或 exact-reviewed isolation 判斷後、回傳 accepted rows 前執行，因此其他 malformed row 的驗證優先順序不變。

### 2. TWSE table live envelope

auction/publicForm root envelope 新增允許 `notes` 與 `total`，但未放寬其他 key：

- `notes` 存在時必須是純 `string[]`。
- `total` 存在時必須是非負整數，且精確等於 root `data.length`（不是 parser 篩選後筆數）。
- 其他 unknown key、錯型別、負數、小數與 total mismatch 仍拋 `IpoSourceValidationError`。

### 3. 多次正式申請與承銷流程

- application 先以精確 `(companyCode, market)` 分組，按 ISO `applicationDate` 選最新一次；同一最新日期的所有來源列仍一併合併，因此任一非空欄位（包含 `note`）衝突仍拋 `IPO_SOURCE_CONFLICT:<field>`。
- 被淘汰的舊 application 不再產生 stage、exception status 或 events。
- live 診斷另確認同一 IPO 可能保留較舊、已取消的 auction/public-offering 流程（例如 7814）。兩類證據分別按 `auctionOpenDate` / `drawDate` 選最新流程；同日列仍保留既有嚴格欄位衝突檢查。
- downstream evidence 的定義日期若早於最新 `applicationDate`，視為舊 attempt 證據並隔離，不能讓新申請提前變成 D/listed 或帶入舊價格與事件。
- application 與後續證據只依精確 company code + market 聚合，不用公司名稱做模糊配對。若 application 提供非 missing 值，保留其正式公司名稱與承銷商文字；後續證據只補空值，避免把 `億而得-創` / `億而得`、`永豐金` / `永豐金` 等官方顯示差異誤判為 identity conflict。若 application 承銷商為 `""` 或 `"—"`，或沒有 application 作 canonical identity，downstream 公司名稱／承銷商衝突仍 fail-closed。
- 不同來源或同日 duplicate flow 若承銷價格只差無意義的小數尾零，視為相同數值但保留第一個官方字串，沒有改寫價格；真正不同的價格仍拋 conflict。

### 4. TPEx no-limit 日期語意

第一輪修正後的 current-live aggregate 暴露 `6945` listingDate 衝突。官方 OpenAPI schema 說明：

- `Date` 是「資料日期」，不能當掛牌日。
- `StartDateForStabilizationOperation` 是「穩定操作起始日」，且 current official application、auction 與 public-offering 證據皆與此日期一致。

因此 `parseTpexIpoListingSource` 改以 `StartDateForStabilizationOperation` 產生 listing evidence 與 sourceRecordId，不再把每日資料日捏造成 listing date。其他 source 日期均原樣保留。

## TDD 證據

### 第一輪 RED

命令：

```text
node --test --test-concurrency=2 tests/source-verification/source-11586.test.mjs tests/source-verification/source-ipo-events.test.mjs tests/ipo-events-snapshot.test.mjs tests/ipo-events-refresh.test.mjs
```

結果：21 pass / 4 fail；四個預期失敗分別為：

1. exact 11586 anomaly 仍被 `listingReviewDate violates application chronology` 拒絕。
2. live envelope 仍被 `unknown key: notes` 拒絕。
3. 1623 reapplication 仍拋 `IPO_SOURCE_CONFLICT:applicationDate`。
4. 五來源 live-like API integration 仍回 503。

### 第二輪 RED

第一次 GREEN 後執行 current-live read-only 診斷，發現後續真實阻斷，再先補回歸測試。結果為 23 pass / 5 fail；預期失敗涵蓋：

1. TPEx `Date` 被錯當 listing date。
2. 舊且已取消的 auction/public flow 污染最新流程。
3. 相同 code/market 的官方公司名稱顯示差異被誤判 conflict。
4. 數值相同但尾零不同的官方價格被誤判 conflict。
5. 五來源 refresh 在 6945 listing evidence 邊界拋 `IPO_SOURCE_CONFLICT:listingDate`。

### GREEN

獨立 code review 再發現四個邊界：pre-application evidence、同日 nested price、same-attempt note 與無 application 時的 downstream identity。依 TDD 先加入測試，第三輪 RED 為 **26 pass / 4 fail**，四項皆以預期原因失敗。follow-up review 再指出 application 承銷商空白時的 downstream precedence；新增測試先以 **15 pass / 1 fail** 證明缺口。最小修正後完整 focused command 最終結果：**31 pass / 0 fail**。

P1 複核另先加入 exact anomaly duplicate regression：`source-11586` focused RED 為 **7 pass / 1 fail**，失敗原因是 missing expected `duplicate application identity`。review 再要求 canonical identity 不得因日期／空白格式差異繞過，該 regression 同樣先以 **7 pass / 1 fail** 重現。將 uniqueness 改為檢查完整 canonical identity set 後，同檔 GREEN 為 **8 pass / 0 fail**，完整 focused 仍為 **31 pass / 0 fail**。

測試同時證明：

- 兩筆 exact anomaly 被隔離，任一審核日期改一字仍 fail-closed。
- 任一 exact anomaly 出現 duplicate 時仍由 application identity uniqueness fail-closed。
- 合法 `notes/total` 可解析，錯型別、負數、小數、mismatch 與 unknown key 被拒絕。
- 1623 選取 `2025-09-30` 最新 application；舊 attempt 不污染 stage/events；同一最新日期的非空欄位衝突仍失敗。
- 新 application 不會吸收早於 applicationDate 的 listing/auction/public evidence。
- 較舊取消的 underwriting flows 不污染 current record。
- 同日 duplicate auction/public flow 的數值等價價格不衝突且不改寫第一個官方字串。
- 無 application 時的 downstream companyName/underwriter 衝突維持 fail-closed。
- application underwriter 為空字串或 em-dash placeholder 時，downstream underwriter 衝突同樣 fail-closed。
- 五個 live-like source 可由 API refresh 發布非空 snapshot，不再回 `source_unavailable`。

## Current-live 唯讀驗證

使用實際 `refreshOfficialIpoSnapshot({ fetchImpl: fetch, now: new Date() })` 讀取五個目前官方 payload，修正後結果：

```json
{
  "schemaVersion": 1,
  "dataDate": "2026-08-02",
  "records": 1437,
  "sources": [
    { "sourceId": "twse-applications", "rowCount": 695 },
    { "sourceId": "tpex-applications", "rowCount": 810 },
    { "sourceId": "tpex-ipo-listings", "rowCount": 1 },
    { "sourceId": "twse-auctions", "rowCount": 41 },
    { "sourceId": "twse-public-offerings", "rowCount": 37 }
  ]
}
```

aggregate 成功且 records 非空；兩筆 reviewed 11586 anomaly 已從 697 個 live source rows 中隔離，manifest 記錄 695 個可發布 rows。

上述 current-live 成功執行發生在最後一個「application underwriter 空白時 downstream 仍須 fail-closed」hardening 之前；該 hardening 不改 parser、來源選取、records cardinality 或有非空 application underwriter 的 live 路徑。修改後嘗試再次執行相同唯讀 GET，但工具因平台用量上限拒絕授權，未取得新的 live 結果，也沒有改用繞過方式。最終差異由 dedicated regression、五來源 live-like integration 與完整本機 suite 驗證；發布後仍需重新做 production live 驗證。

## 完整驗證

所有命令均 fresh run、exit code 0：

| 驗證 | 結果 |
| --- | --- |
| focused tests | 31 pass / 0 fail |
| `npm.cmd test` | 393 pass / 0 fail（包含 production build） |
| `npm.cmd run lint` | exit 0，無 lint error/warning |
| `npm.cmd run typecheck` | exit 0 |
| `npm.cmd run build` | exit 0 |
| `git diff --check` | exit 0 |

Vinext build 仍輸出既有的 route static-classification informational notice；沒有 build error。

## 修改檔案

- `lib/source-verification/source-11586.ts`
- `lib/source-verification/source-ipo-events.ts`
- `lib/ipo-events/snapshot.ts`
- `tests/source-verification/source-11586.test.mjs`
- `tests/source-verification/source-ipo-events.test.mjs`
- `tests/ipo-events-snapshot.test.mjs`
- `tests/ipo-events-refresh.test.mjs`
- 本報告

## 後續發布

本 Task **未發布**。需要重新發布 Sites，讓新的 parser/aggregate 進入 production runtime；發布後再驗證 D1 current pointer、`/api/ipo-events` HTTP 200、snapshot manifest 與公開 IPO UI。這些外部寫入與 production 驗證留給後續核准步驟。
