# Task 11：正式 IPO 來源、刷新、D1 與排程硬化報告

日期：2026-08-02（Asia/Taipei）

狀態：**IMPLEMENTED_AND_VERIFIED_LOCALLY**

## 範圍與安全

- 僅修改 IPO 後端 API、來源治理、snapshot 聚合／驗證、D1 repository／migration、每日 refresh script／workflow contract 與對應測試。
- 未修改 Task 12 IPO 頁面互動、公開 HTML/CSS/前端資產。
- 未發布 Sites、未呼叫正式 refresh、未寫 production D1、未新增 secret、未新增 cron 或通知 relay。
- 所有 Node、npm、測試與建置程序均使用 `UV_THREADPOOL_SIZE=2`；建置另使用 `VITE_MAX_THREADS=2`，PowerShell parent process 設為 Windows `BelowNormal`。

## 根因與修正

### 1. 五來源 registry、用途政策與傳輸邊界

根因是 IPO refresh 在 `lib/ipo-events/refresh.ts` 另存五個 URL；只有 11586 已進 `lib/pipeline/source-registry.ts`，Phase 1 quarantine 又維護另一份 IPO URL 集合。refresh fetch 未設定 manual redirect，也未驗 Content-Type、`response.redirected` 或最終 URL。

修正後：

- registry 登錄五個 production IPO resource；TWSE 年度端點只能由 registry 以四位數 `yy` 解析精確 URL。
- 每個 resource 具有 `ipoEventPolicy`（manifest identity、`ipo_events` 用途、可使用欄位）。11586 明確允許 underwriters/note 與正式時程欄位，明確排除 underwritingPrice、chairmanName 與資本額。
- refresh 只由 `getApprovedIpoResource` 取得 URL、Content-Type、size、timeout 與 manifest identity；不再有脫離 registry 的 source URL map。
- 所有 source fetch 使用 `redirect: "manual"`；拒絕 3xx、`response.redirected`、最終 URL 漂移及錯 Content-Type。CSV 僅接受 `text/csv`，JSON 僅接受 `application/json`。
- Phase 1 quarantine 從 registry 導出 IPO URL 與年度規則，legacy 已核准來源仍保留既有政策集合。

### 2. 承銷商衝突 fail-closed

根因是 Task 10 的 `mergeEvidenceText` 在 application 有非空承銷商時，刻意忽略 auction/public-offering 的非空差異。

修正後 application、auction、public-offering 任兩者非空且不同都拋 `IPO_SOURCE_CONFLICT:underwriter`；空值可由非空值補齊，相同值可合併。TPEx no-limit listing evidence 仍只作既有補充來源，避免把官方 `9800 元大` 顯示碼與 application `元大` 誤納入本次三來源 conflict policy；record 不會同時保存兩個互斥的承銷商值。

### 3. 公開 refresh single-flight、D1 lease 與 cooldown

根因是一般 GET 會在 stale/no-current 時直接抓五來源；沒有明確 refresh path、同 isolate single-flight 或跨 isolate D1 狀態。

修正後：

- 一般 `GET /api/ipo-events` 只讀 current；只有 `?refresh=1` 能進入刷新路徑。
- 同 isolate 使用一個 module-scoped in-flight promise；併行呼叫共享同一次五來源下載與 publish。
- 新增 forward-only `0006_ipo_event_refresh_state.sql`，以 conditional D1 upsert 提供 10 分鐘 lease 與 15 秒 cooldown。
- cooldown 以 attempt 完成時間更新；即使慢失敗已超過 15 秒，完成後仍有完整 cooldown。
- 取得不到 lease 時不 fetch、不 publish；有 current 回 `stale:true`，無 current 回 retryable 503。
- corrupt current 的一般讀取 fail-closed；明確 refresh 會把它視為無 current，取得 lease 後重建，不再用非法字串日期比較。

### 4. D1 pointer monotonic 與 idempotent publish

根因是 immutable snapshot 使用普通 `INSERT`，相同 snapshot 再發布會 duplicate；pointer upsert 無條件覆寫，較舊候選晚完成即可回退 current。

修正後：

- snapshot insert 使用 `INSERT OR IGNORE`，同 id/hash 重發 idempotent。
- pointer 只在 candidate `(dataDate, generatedAt)` 嚴格晚於 current 時更新。
- 較舊 candidate 可保存為 orphan/no-op，但不能回退 current；snapshot insert 與 conditional pointer 仍由 D1 batch 原子執行。
- `0006` 未改寫任何既有 migration；build 測試確認 migration byte-for-byte 打包到 `dist/.openai/migrations`。

### 5. Authoritative snapshot assertion

根因是 repository 只檢查四個 root 欄位的淺層型別，`dataDate:"zzzz"`、`generatedAt:"x"`、空／缺／重複 manifest、壞 hash/bytes/rowCount、`records:[null]` 與 nested enum/object 都可通過。

新增 `assertIpoEventSnapshot` 作唯一 authoritative contract，並由 builder、publish、read 共用。它完整驗證：

- root exact schema、schemaVersion、合法 `YYYY-MM-DD` 與含時區 ISO instant；
- 恰好五個且不重複的 source identity、registry 精確 URL、downloadedAt、64-hex SHA-256、正整數 bytes/rowCount；
- record exact fields、四位公司碼、market/stage/exception enum、日期、decimal/null、auction/publicOffering nested schema；
- event enum、日期、父 record identity、非空且不重複的 sourceRecordIds；
- `(companyCode, market)` record identity 唯一性。

### 6. 22:30 workflow 成功條件與 bounded retry

`trigger-ipo-refresh.mjs` 現在共用 authoritative assertion，另要求：

- `stale !== true`；
- records 非空；
- dataDate 精確等於本次執行的台灣今日；
- 五來源 manifest 與所有 nested schema 完整。

HTTP、JSON 或 payload 驗證失敗都在同一 job 內最多嘗試 3 次，預設兩次 20 秒退避；只有最後仍失敗才拋錯並讓 job nonzero。workflow 保持單一每日 `30 14 * * *` cron、單一 job，沒有 email/relay 或第二個 schedule。

## TDD RED／GREEN 證據

每一輪都先修改／新增測試並觀察預期失敗，再做最小 production 修正：

| Cycle | RED（預期缺口） | GREEN |
| --- | --- | --- |
| Registry/policy | 0 pass / 2 fail：缺少 `getApprovedIpoResource`、`listApprovedIpoResources` | 20 pass / 0 fail |
| 傳輸＋underwriter | 20 pass / 3 fail：未送 manual、錯 Content-Type 未拒、承銷衝突未拋 | 35 pass / 0 fail |
| public refresh/lease | 14 pass / 7 fail：一般 GET 自動刷新、10 次併行 fetch、無 cooldown/lease/migration | 22 pass / 0 fail |
| pointer | 3 pass / 2 fail：duplicate publish 失敗、舊 generatedAt 回退 current | 5 pass / 0 fail |
| snapshot assertion | 22 pass / 2 fail：corrupt read 與 invalid build 未拒 | 35 pass / 0 fail |
| corrupt recovery | 0 pass / 1 fail：read error 直接回 503 | 36 pass / 0 fail（完整 IPO focused） |
| workflow | 2 pass / 3 fail：接受 stale、無 retry、HTTP 只呼叫一次 | 61 pass / 0 fail（Task 11 focused 組合） |
| cooldown completion anchor | 0 pass / 1 fail：慢失敗完成後立即可重試 | 18 pass / 0 fail（refresh/repository/API） |

Mutation check 涵蓋：移除 manual redirect、放寬 content type/URL、恢復 application precedence、移除 single-flight/lease、從開始時間算 cooldown、恢復普通 INSERT／無條件 pointer、縮回淺層 assertion、接受 stale/empty/wrong-date 或將 retry 降為一次，皆至少會使一個 regression 失敗。

## 完整驗證

所有命令均在最終程式碼上 fresh 執行，exit code 0：

| 驗證 | 結果 |
| --- | --- |
| Task 11 focused tests | 61 pass / 0 fail |
| migration package focused | 2 pass / 0 fail，`0006` byte-for-byte staged |
| `npm.cmd test` | 412 pass / 0 fail（包含 production build） |
| `npm.cmd run lint` | exit 0，無 error/warning |
| `npm.cmd run typecheck` | exit 0 |
| `npm.cmd run build` | exit 0 |
| `git diff --check` | exit 0 |

Vinext build 仍只輸出既有 route static-classification informational notice，沒有 build error。

## 修改檔案

- Backend/runtime：`app/api/ipo-events/route.ts`、`lib/ipo-events/{refresh,repository,snapshot}.ts`
- Governance：`lib/pipeline/source-registry.ts`、`docs/data-source-registry.md`
- D1：`migrations/0006_ipo_event_refresh_state.sql`
- Schedule：`scripts/trigger-ipo-refresh.mjs`
- Tests：IPO API/refresh/repository/snapshot、source registry/quarantine、D1 schema/package、workflow 與 `tests/helpers/ipo-snapshot.mjs`
- 本報告

## 發布注意事項

本 Task **未發布**。下一次 Sites 發布必須套用並確認 `0006_ipo_event_refresh_state.sql`；之後才可驗證跨 isolate D1 lease、正式 `?refresh=1`、current pointer 與 22:30 workflow。公開 refresh path 依需求不使用 repo secret，其濫用防護是 D1 conditional lease/cooldown；它不是身分驗證端點。
