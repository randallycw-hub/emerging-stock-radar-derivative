# 公開事件工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 以可追溯的公開事件讓首頁、可轉債與 IPO 時程形成可操作的資訊工作台。

**Architecture:** 新增純函式事件摘要，從已發布的 CB workbench 與 IPO snapshot 產生四個中性入口。首頁只讀 active generation；CB 篩選走既有 URL state；IPO 以固定生命週期投影既有事件。staging 僅在來源、日期、唯一鍵與已宣告檔案完整時輸出。

**Tech Stack:** Node.js 22、原生 ES modules、Node test runner、靜態 HTML/CSS/JavaScript、Sites staging scripts。

**Spec:** docs/superpowers/specs/2026-08-23-public-event-workbench-design.md

## Global Constraints

- 只可使用既有 bond-market-view、11406、bond-workbench、IPO snapshot 與已登錄官方來源；不可擷取參考站或新增第三方資料。
- 不新增會員、付費、推播、廣告、推薦、評分、買賣／避險指示、目標價、預測、盤中／延遲報價；不得使用 Yahoo、券商、CBAS 或未授權 TCRI。
- 顯示資料日期、覆蓋狀態、欄位來源與原始連結；不同資料日期不可假裝可比較。
- 來源、schema、日期、唯一鍵、必要欄位或覆蓋範圍不合格時，發布必須失敗關閉，不能拿舊快照或第三方資料冒充最新。
- 保持現有紙本暖白視覺、鍵盤操作、ARIA、900px 響應式斷點與 URL 可分享狀態。
- 先寫失敗測試，再做最小實作；每一任務後跑指定測試並提交。CPU 密集指令最多 2 執行緒、BelowNormal 優先權。

---

## File Structure

- Create: static-showcase/assets/public-event-digest.js — 日期驗證與四個事件摘要。
- Modify: static-showcase/index.html、assets/home-page.js、assets/app.css — 首頁事件列與不可用狀態。
- Modify: static-showcase/assets/bond-list-page.js、bonds.html、assets/bonds-page.js、assets/bond-detail-page.js — CB 快捷／進階篩選、URL state、快照與可比較性。
- Modify: static-showcase/ipo.html、assets/ipo-page.js — IPO 固定生命週期與未知節點。
- Modify: scripts/stage-static-showcase.mjs — event inputs 的發布閘門。
- Create/Modify: tests/public-event-digest.test.mjs、tests/static-showcase-pages.test.mjs、tests/static-showcase-bond-ui.test.mjs、tests/static-showcase-ipo-ui.test.mjs、tests/stage-static-showcase.test.mjs。

## Task 1: Public event digest domain module

**Files:**
- Create: static-showcase/assets/public-event-digest.js
- Create: tests/public-event-digest.test.mjs

**Interfaces:**
- Consumes: { bonds, ipoRecords, asOfDate }；CB 使用 bondCode、nextEventDate、maturityDate、dataQuality；IPO 使用 companyCode、events[]。
- Produces: buildPublicEventDigest(input)，固定回傳 { id, label, count, nearestDate, href, state }。id 為 ipo-recent、bond-rights-90、bond-maturity-365、bond-pending；state 只能是 ready 或 unavailable。

- [ ] **Step 1: Write the failing test**

~~~js
import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicEventDigest } from "../static-showcase/assets/public-event-digest.js";

test("event digest only counts valid published events", () => {
  const digest = buildPublicEventDigest({
    asOfDate: "2026-08-24",
    bonds: [
      { bondCode: "1101A", nextEventDate: "2026-09-01", maturityDate: "2027-08-01", dataQuality: "complete" },
      { bondCode: "1101B", nextEventDate: "bad-date", maturityDate: "2026-10-01", dataQuality: "partial" },
    ],
    ipoRecords: [{ companyCode: "1234", events: [{ date: "2026-08-25", label: "掛牌", sourceRecordIds: ["TWSE:1234:1150825"] }] }],
  });
  assert.deepEqual(digest.map((item) => [item.id, item.count, item.nearestDate, item.href, item.state]), [
    ["ipo-recent", 1, "2026-08-25", "./ipo.html?sort=eventDate&direction=asc", "ready"],
    ["bond-rights-90", 1, "2026-09-01", "./bonds.html?event=rights90", "ready"],
    ["bond-maturity-365", 2, "2026-10-01", "./bonds.html?event=maturity365", "ready"],
    ["bond-pending", 1, null, "./bonds.html?quality=pending", "ready"],
  ]);
});

test("missing CB inputs are unavailable instead of a fake count", () => {
  const digest = buildPublicEventDigest({ asOfDate: "2026-08-24", bonds: null, ipoRecords: [] });
  assert.equal(digest.find((item) => item.id === "bond-rights-90").state, "unavailable");
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: node --test tests/public-event-digest.test.mjs

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write minimal implementation**

Export isPublishedIsoDate(value) and buildPublicEventDigest(input). Validate ISO dates with a strict YYYY-MM-DD pattern plus Date.parse. Count IPO events only if event has a non-empty sourceRecordIds array and valid date. Count right events only when nextEventDate is 0–90 calendar days from asOfDate. Count maturities only when maturityDate is 0–365 days away. Count pending CB records only where dataQuality is not complete. Invalid/missing input creates unavailable state, never a fabricated count.

- [ ] **Step 4: Run test to verify it passes**

Run: node --test tests/public-event-digest.test.mjs

Expected: PASS with two tests.

- [ ] **Step 5: Commit**

~~~bash
git add static-showcase/assets/public-event-digest.js tests/public-event-digest.test.mjs
git commit -m "feat: add public event digest"
~~~

## Task 2: Homepage event strip driven by active published data

**Files:**
- Modify: static-showcase/index.html
- Modify: static-showcase/assets/home-page.js
- Modify: static-showcase/assets/app.css
- Modify: tests/static-showcase-pages.test.mjs

**Interfaces:**
- Consumes: Task 1 module and active runtime.manifestUrl, runtime.datasets.bondWorkbench, runtime.ipoEventsUrl.
- Produces: #home-event-strip. Ready items are links; unavailable items are non-link articles with 資料暫時無法讀取.

- [ ] **Step 1: Write the failing page contract**

~~~js
test("首頁以已發布資料提供事件列與覆蓋狀態", async () => {
  const [home, script, css] = await Promise.all([
    readShowcaseFile("index.html"), readShowcaseFile("assets/home-page.js"), readShowcaseFile("assets/app.css"),
  ]);
  assert.match(home, /id="home-event-strip"/);
  assert.match(home, /id="home-data-coverage"/);
  assert.match(script, /buildPublicEventDigest/);
  assert.match(script, /ipoEventsUrl/);
  assert.match(script, /bondWorkbench/);
  assert.match(css, /\.home-event-strip/);
  assert.doesNotMatch(home + script, /排行|推薦|買進|賣出|目標價/);
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: node --test tests/static-showcase-pages.test.mjs

Expected: FAIL because event-strip IDs and imports are absent.

- [ ] **Step 3: Write minimal rendering**

Add a section after home-modules with heading 近期公開事件, #home-data-coverage and #home-event-strip. In home-page.js, safeJsonFetch current pointer, runtime, manifest, declared bondWorkbench, and ipoEventsUrl. Call buildPublicEventDigest with workbench.records, ipo.records, and manifest.market.dataDate. Render ready entries as anchors to their digest href; unavailable entries as articles with no numerical fallback. Use formatDate only for a valid nearest date. The coverage text contains the snapshot data date and number of usable event inputs.

Add home-event-section, home-event-strip, home-event-card and home-event-card--unavailable styles; desktop is a compact grid and the existing 900px media query changes it to one column; add dark-mode token coverage.

- [ ] **Step 4: Run focused tests**

Run: node --test tests/public-event-digest.test.mjs tests/static-showcase-pages.test.mjs

Expected: PASS; no static count or example record is placed in HTML.

- [ ] **Step 5: Commit**

~~~bash
git add static-showcase/index.html static-showcase/assets/home-page.js static-showcase/assets/app.css tests/static-showcase-pages.test.mjs
git commit -m "feat: show public events on homepage"
~~~

## Task 3: Composable CB event and evidence filters

**Files:**
- Modify: static-showcase/assets/bond-list-page.js
- Modify: static-showcase/bonds.html
- Modify: static-showcase/assets/bonds-page.js
- Modify: static-showcase/assets/app.css
- Modify: tests/static-showcase-bond-ui.test.mjs

**Interfaces:**
- Consumes: canonical CB fields and query parameters event, quality, maturityBefore, remainingMax, secured.
- Produces: parseBondListState and serializeBondListState with these values; filterBondRecords excludes missing data when an active condition depends on it.

- [ ] **Step 1: Write the failing state/filter test**

~~~js
test("bond list state round-trips composable public-event filters", async () => {
  const { parseBondListState, serializeBondListState, filterBondRecords } = await import("../static-showcase/assets/bond-list-page.js");
  const state = parseBondListState("?event=rights90&quality=pending&remainingMax=25&secured=無擔保");
  assert.deepEqual(state, { query: "", archived: false, sortKey: "bondCode", direction: "asc", page: 1, event: "rights90", quality: "pending", maturityBefore: null, remainingMax: 25, secured: "無擔保" });
  assert.equal(serializeBondListState(state), "?event=rights90&quality=pending&remainingMax=25&secured=%E7%84%A1%E6%93%94%E4%BF%9D");
  assert.deepEqual(filterBondRecords([{ bondCode: "A", daysToNextEvent: 8, dataQuality: "partial", remainingRatio: "20", securedStatus: "無擔保" }], state).map((row) => row.bondCode), ["A"]);
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: node --test tests/static-showcase-bond-ui.test.mjs

Expected: FAIL because the parser only exposes legacy fields.

- [ ] **Step 3: Implement filters and controls**

Extend state parsing with strict allowlists: event accepts rights90 or maturity365; quality accepts pending; remainingMax is finite 0–100; secured is a non-empty NFC-normalized label. Serialize in canonical order. filterBondRecords applies archive/query first, then every active filter. Rights requires valid daysToNextEvent <= 90; maturity requires valid daysToMaturity <= 365; pending requires dataQuality not equal to complete. Missing/non-numeric values fail enabled date/numeric filters.

Add a labelled fieldset.bond-event-shortcuts with four data-bond-shortcut buttons and controls #bond-maturity-before, #bond-remaining-max, #bond-secured, #bond-quality. Bind each to state in bonds-page.js, reset page to 1, sync existing URL state and toggle aria-pressed. The zero state names current conditions and has 清除所有條件. Preserve existing table fields; do not add price rankings or advice copy.

- [ ] **Step 4: Run focused tests**

Run: node --test tests/static-showcase-bond-ui.test.mjs tests/public-event-digest.test.mjs

Expected: PASS; unknown values never meet enabled conditions.

- [ ] **Step 5: Commit**

~~~bash
git add static-showcase/assets/bond-list-page.js static-showcase/bonds.html static-showcase/assets/bonds-page.js static-showcase/assets/app.css tests/static-showcase-bond-ui.test.mjs
git commit -m "feat: add CB public event filters"
~~~

## Task 4: CB snapshot evidence and IPO life-cycle

**Files:**
- Modify: static-showcase/assets/bond-detail-page.js
- Modify: static-showcase/ipo.html
- Modify: static-showcase/assets/ipo-page.js
- Modify: static-showcase/assets/app.css
- Modify: tests/static-showcase-bond-ui.test.mjs
- Modify: tests/static-showcase-ipo-ui.test.mjs

**Interfaces:**
- Consumes: CB view, term, events; IPO normalized events and snapshot data date.
- Produces: renderBondSnapshot(record) and projectIpoLifecycle(row). Each life-cycle item is { key, label, date, state, sourceId }; state is complete, upcoming, or unavailable.

- [ ] **Step 1: Write failing UI contracts**

~~~js
test("CB 明細快照分開呈現資料日與不可比較原因", async () => {
  const detail = await readFile(new URL("assets/bond-detail-page.js", root), "utf8");
  assert.match(detail, /目前資料快照/);
  assert.match(detail, /可比較性/);
  assert.match(detail, /目前無核准公開資料／待確認/);
});

test("IPO 詳細歷程採固定公開生命週期且未知節點不可完成", async () => {
  const [html, script] = await Promise.all([readFile(new URL("ipo.html", root), "utf8"), readFile(new URL("assets/ipo-page.js", root), "utf8")]);
  for (const label of ["公告", "送件", "核准／生效", "詢圈或競拍", "轉換價確認", "掛牌"]) assert.match(html + script, new RegExp(label));
  assert.match(script, /projectIpoLifecycle/);
  assert.match(script, /尚無公開資料/);
});
~~~

- [ ] **Step 2: Run tests to verify they fail**

Run: node --test tests/static-showcase-bond-ui.test.mjs tests/static-showcase-ipo-ui.test.mjs

Expected: FAIL because the snapshot/lifecycle contracts are absent.

- [ ] **Step 3: Implement evidence-first presentation**

Place a top section.bond-current-snapshot before the existing status matrix. Show data date, outstanding amount, remaining ratio, previous-comparable change, next event, maturity and 可比較性. Only calculate change if both values have valid source IDs and matching comparison rules; otherwise show 目前無核准公開資料／待確認 plus the existing missing reason. Reuse fact() and sourceLink() so outbound sources remain allowlisted.

Export projectIpoLifecycle(row, today). Its fixed order is announcement, submission, effective, auction, pricing, listing; it maps only a matching normalized event to a step and otherwise uses null date/sourceId and unavailable state. Use it in expanded table and mobile cards after 最近事件, 下一已知事件, 資料日期. Preserve unknown kinds in the full-event list but never use them to fill a fixed milestone. Show underwriter, issuance size and auction result only when normalized official evidence exists. Unknown milestone copy is 尚無公開資料.

- [ ] **Step 4: Run focused tests**

Run: node --test tests/static-showcase-bond-ui.test.mjs tests/static-showcase-ipo-ui.test.mjs

Expected: PASS; missing milestones never appear complete.

- [ ] **Step 5: Commit**

~~~bash
git add static-showcase/assets/bond-detail-page.js static-showcase/ipo.html static-showcase/assets/ipo-page.js static-showcase/assets/app.css tests/static-showcase-bond-ui.test.mjs tests/static-showcase-ipo-ui.test.mjs
git commit -m "feat: clarify CB and IPO public evidence"
~~~

## Task 5: Fail-closed event publication gate

**Files:**
- Modify: scripts/stage-static-showcase.mjs
- Modify: tests/stage-static-showcase.test.mjs

**Interfaces:**
- Consumes: active pointer/runtime/manifest, declared workbench, ipo-events.json, hash and record counts.
- Produces: assertPublishedEventInputs({ manifest, runtime, root }); it returns only when event inputs are valid, sourceManifest-backed and identity-safe, otherwise throws before destination mutation.

- [ ] **Step 1: Write failing staging test**

~~~js
test("Sites staging fails closed when IPO event evidence lacks source record, date, or identity", async () => {
  const { source, destination } = await seededGenerationWithIpoEvents();
  await writeFile(join(source, "data/generations/abc123/ipo-events.json"), JSON.stringify({
    records: [{ companyCode: "1234", events: [{ date: "2026-08-25", label: "掛牌", sourceRecordIds: [] }] }],
  }) + "\n", "utf8");
  await assert.rejects(stageStaticShowcase({ source, destination }), /IPO event.*source|date|identity/i);
  await assert.rejects(readFile(join(destination, "data/current.json"), "utf8"));
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: node --test tests/stage-static-showcase.test.mjs

Expected: FAIL because staging does not yet validate IPO event provenance at this boundary.

- [ ] **Step 3: Implement validation before destination mutation**

Add assertPublishedEventInputs adjacent to declared-workbench validators. Resolve only previously validated active pointer/runtime paths. Require runtime.ipoEventsUrl to be inside the active generation and have exactly one manifest entry. Verify SHA-256, raw bytes and record count with existing helpers. Parse { records, sourceManifest }; every record requires companyCode and every event requires date, label, a non-empty sourceRecordIds array, and a unique companyCode:market:event.kind:event.date:sourceRecordId identity. Each source-record prefix must map to exactly one sourceManifest entry whose source URL passes the existing official IPO source registry. Call this before copying files or writing destination current.json. Never add previous-generation fallback or per-event source fields.

- [ ] **Step 4: Run staging and source tests**

Run: node --test tests/stage-static-showcase.test.mjs tests/ipo-events-snapshot.test.mjs tests/source-verification/source-ipo-events.test.mjs

Expected: PASS; source/date/identity failures, hash mutation and wrong-generation paths reject publication.

- [ ] **Step 5: Commit**

~~~bash
git add scripts/stage-static-showcase.mjs tests/stage-static-showcase.test.mjs
git commit -m "feat: gate event data publication"
~~~

## Task 6: Full verification, visual check and handoff

**Files:**
- Modify only if verification identifies a defect in Tasks 1–5.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified local static build; deployment is out of scope.

- [ ] **Step 1: Run regression suite with low-load settings**

~~~powershell
$env:UV_THREADPOOL_SIZE = '2'
Start-Process -FilePath npm -ArgumentList 'run','test:showcase' -WorkingDirectory $PWD -Priority BelowNormal -Wait -NoNewWindow
~~~

Expected: all showcase, staging, source-verification and UI tests pass.

- [ ] **Step 2: Run static checks and build with low-load settings**

~~~powershell
$env:UV_THREADPOOL_SIZE = '2'
Start-Process -FilePath npm -ArgumentList 'run','typecheck' -WorkingDirectory $PWD -Priority BelowNormal -Wait -NoNewWindow
Start-Process -FilePath npm -ArgumentList 'run','lint' -WorkingDirectory $PWD -Priority BelowNormal -Wait -NoNewWindow
Start-Process -FilePath npm -ArgumentList 'run','build' -WorkingDirectory $PWD -Priority BelowNormal -Wait -NoNewWindow
~~~

Expected: typecheck/build exit 0; no new lint warnings.

- [ ] **Step 3: Inspect local built pages**

Verify that homepage has four modules plus event strip; ready URLs apply expected filters; unavailable inputs have no fake count; CB filters compose and clear; CB desktop/mobile snapshot agree; missing IPO stages say 尚無公開資料; keyboard and dark mode remain usable.

- [ ] **Step 4: Confirm source safety and working tree**

~~~powershell
rg -n "Yahoo|yahoo finance|CBAS|TCRI|買進|賣出|目標價|即時報價" static-showcase scripts tests
git status --short
git log --oneline -6
~~~

Expected: no prohibited production additions; clean tree after commits.

- [ ] **Step 5: Commit verification-only fix and hand off without deployment**

~~~bash
git add <only-files-fixed-by-verification>
git commit -m "fix: verify public event workbench"
~~~

Report commit IDs, verification outputs and local preview behavior. Publication remains pending explicit user approval.

## Plan Self-Review

- **Spec coverage:** Tasks 1–2 are homepage digest/count/date/availability. Task 3 is CB shortcuts, advanced composition and shareable URLs. Task 4 is CB comparability and IPO lifecycle/unknown states. Task 5 is fail-closed event publication. Task 6 is accessibility, source/advice safety, build verification and no deployment.
- **Scope:** Excludes phase-two company pages, new adapters, financial statements, realtime updates, non-official data and deployment.
- **Placeholder scan:** Each task includes files, interfaces, actual test behavior, failure/pass commands, implementation details and a commit boundary.
- **Type consistency:** buildPublicEventDigest, parseBondListState, serializeBondListState, filterBondRecords, projectIpoLifecycle and assertPublishedEventInputs are defined before use. URL values are consistently rights90, maturity365 and pending.
