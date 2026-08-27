# Data Center V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `/market-site/data-center.html` from a source-description page into a trustworthy Data Operations & Quality Center driven by the existing published snapshot and staging validation.

**Architecture:** A pure status-projection module will derive public dataset health, QA, timeline, source registry, and the six fixed status states from the active generation's verified artifacts. The staging script will write a public `data-status.json` and inject the same safe summary into the generated HTML, so the core status remains visible before or without JavaScript. The browser module will render from that embedded snapshot first and may refresh it from the matching generated JSON without clearing valid content after a fetch failure.

**Tech Stack:** Static HTML, vanilla ES modules, Node.js test runner, Vinext build, existing `scripts/stage-static-showcase.mjs` publication gate.

**Spec:** `C:\Users\USER\Desktop\台灣盤後市場資訊台_DataCenter_V3_Codex大改版執行規格.pdf`

## Global Constraints

- Change only Data Center, its required shared public-status code, and Methodology links; do not alter emerging, IPO, CB financial definitions, calculations, source priority, or snapshot-generation data.
- Dynamic public values must come from the active verified generation or the staging validation; never invent market figures, set missing values to `0`, or claim a QA pass without a completed check.
- Preserve the existing immutable-generation / current-pointer publication gate. A failure must leave the prior published generation in place.
- Do not publish source identifiers, diagnostic metadata, hashes, credentials, internal reasons, or imported private data.
- Core status must be readable in staged HTML before JavaScript runs. A failed status fetch must retain the embedded safe snapshot.
- Keep status accessible with text labels in addition to colour, semantic table headers, focusable links/disclosures, and a non-horizontal-scroll mobile Dataset Health view.
- Maintain the existing source-code CPU limits: no new concurrent CPU-heavy processing; validation runs remain single process.

---

### Task 1: Public data-status projection and six-state model

**Files:**
- Create: `static-showcase/assets/data-center-status.js`
- Create: `tests/static-showcase-data-center-v3.test.mjs`

**Interfaces:**
- Consumes: the active generation pointer, runtime URLs, manifest metadata, public `emerging-market.json`, `ipo-events.json`, `bond-workbench.json`, and `94025.json`.
- Produces: `buildDataCenterStatus({ generation, manifest, runtime, artifacts, evaluatedAt })`, returning `{ schemaVersion, generatedAt, snapshotId, system, datasets, qa, timeline, incidents, sources, commonStates }`.
- Produces: `DATA_CENTER_STATUS` with exactly `OK`, `WAITING_PUBLISH`, `DELAYED`, `FALLBACK`, `ERROR`, and `NON_TRADING_DAY`, plus `renderDataCenterBootstrap(status)` for static safe markup.

- [ ] **Step 1: Write the failing status-model tests**

```js
test("Data Center V3 projects only verified public inputs into an OK health record", () => {
  const status = buildDataCenterStatus(verifiedFixture({ evaluatedAt: "2026-08-26T18:20:00+08:00" }));
  assert.equal(status.system.status, DATA_CENTER_STATUS.OK);
  assert.ok(status.datasets.every((dataset) => dataset.status === DATA_CENTER_STATUS.OK));
  assert.equal(JSON.stringify(status).includes("sourceId"), false);
});

test("Data Center V3 distinguishes waiting, delayed, fallback, error, and non-trading states", () => {
  assert.equal(projectDatasetStatus({ dataDate: "2026-08-26", evaluatedAt: "2026-08-27T10:00:00+08:00" }), DATA_CENTER_STATUS.WAITING_PUBLISH);
  assert.equal(projectDatasetStatus({ dataDate: "2026-08-26", evaluatedAt: "2026-08-27T19:00:00+08:00" }), DATA_CENTER_STATUS.DELAYED);
  assert.equal(projectDatasetStatus({ dataDate: "2026-08-26", evaluatedAt: "2026-08-27T19:00:00+08:00", fallbackSnapshotId: "previous" }), DATA_CENTER_STATUS.FALLBACK);
  assert.equal(projectDatasetStatus({ qaPassed: false }), DATA_CENTER_STATUS.ERROR);
  assert.equal(projectDatasetStatus({ evaluatedAt: "2026-08-30T12:00:00+08:00" }), DATA_CENTER_STATUS.NON_TRADING_DAY);
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the status module is absent**

Run: `node --test tests/static-showcase-data-center-v3.test.mjs`

Expected: failure reporting that `data-center-status.js` or its exports do not exist.

- [ ] **Step 3: Implement the minimal pure projection module**

```js
export const DATA_CENTER_STATUS = Object.freeze({
  OK: "OK", WAITING_PUBLISH: "WAITING_PUBLISH", DELAYED: "DELAYED",
  FALLBACK: "FALLBACK", ERROR: "ERROR", NON_TRADING_DAY: "NON_TRADING_DAY",
});

export function buildDataCenterStatus(input) {
  // Validate only public generation fields, derive record counts and dates,
  // preserve unavailable values as null, and derive status from evaluatedAt,
  // verified data dates, cadence, QA outcome, and an explicit fallback pointer.
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test tests/static-showcase-data-center-v3.test.mjs`

Expected: every six-state and public-projection assertion passes.

- [ ] **Step 5: Commit the independently tested status model**

```bash
git add static-showcase/assets/data-center-status.js tests/static-showcase-data-center-v3.test.mjs
git commit -m "feat: add Data Center V3 status model"
```

### Task 2: Build-time status artifact and JavaScript-safe HTML bootstrap

**Files:**
- Modify: `scripts/stage-static-showcase.mjs`
- Modify: `static-showcase/data-center.html`
- Modify: `tests/stage-static-showcase.test.mjs`
- Modify: `tests/static-showcase-data-center-v3.test.mjs`

**Interfaces:**
- Consumes: `buildDataCenterStatus(...)` and the same verified generation inputs already validated by `stageStaticShowcase`.
- Produces: `dist/client/market-site/data/generations/<generation>/data-status.json` and embedded public-safe summary markup plus `<script id="data-center-bootstrap" type="application/json">` in staged `data-center.html`.
- Guarantees: source data failure still stops staging before the destination is replaced; status generation never alters `static-showcase/data/generations/*` source snapshots.

- [ ] **Step 1: Write a failing staging test for safe static output**

```js
test("Sites staging writes a public Data Center status artifact and safe HTML bootstrap", async () => {
  const { source, destination } = await seededGenerationWithIpoEvents();
  await writeFile(join(source, "data-center.html"), dataCenterTemplate(), "utf8");
  await stageStaticShowcase({ source, destination });
  const status = JSON.parse(await readFile(join(destination, "data/generations/abc123/data-status.json"), "utf8"));
  const html = await readFile(join(destination, "data-center.html"), "utf8");
  assert.equal(status.snapshotId, "abc123");
  assert.match(html, /id="data-center-bootstrap"/);
  assert.doesNotMatch(html, /更新資訊讀取中/);
});
```

- [ ] **Step 2: Run the focused staging test and verify it fails because the artifact is absent**

Run: `node --test tests/stage-static-showcase.test.mjs --test-name-pattern "Data Center status artifact"`

Expected: failure because `data-status.json` and the bootstrap element are not produced.

- [ ] **Step 3: Implement staging generation without weakening the existing gate**

```js
const status = buildDataCenterStatus(await readActiveGenerationArtifacts({ source, pointer, runtime, manifest }));
await writeFile(join(base, "data-status.json"), `${JSON.stringify(status, null, 2)}\n`, "utf8");
await injectDataCenterBootstrap({ destination, status });
```

Keep `data-status.json` destination-only, include it in the public metadata projection, and escape all text inserted into static HTML. Do not copy raw source metadata or source identifiers into the status payload.

- [ ] **Step 4: Run focused staging and status tests and verify they pass**

Run: `node --test tests/stage-static-showcase.test.mjs tests/static-showcase-data-center-v3.test.mjs`

Expected: staging creates the public artifact, retains the destination-safe failure behavior, and the status tests remain green.

- [ ] **Step 5: Commit the static-resilience integration**

```bash
git add scripts/stage-static-showcase.mjs static-showcase/data-center.html tests/stage-static-showcase.test.mjs tests/static-showcase-data-center-v3.test.mjs
git commit -m "feat: stage resilient Data Center status snapshots"
```

### Task 3: Data Operations and Quality Center UI

**Files:**
- Modify: `static-showcase/data-center.html`
- Modify: `static-showcase/assets/data-center-page.js`
- Modify: `static-showcase/assets/app.css`
- Modify: `tests/static-showcase-data-governance.test.mjs`
- Modify: `tests/static-showcase-data-center-v3.test.mjs`

**Interfaces:**
- Consumes: embedded `#data-center-bootstrap` and same-generation `data-status.json`.
- Produces: System Status Hero, Dataset Health table/cards, Data Quality, real Update Timeline, Incidents/Corrections empty state, Official Source Registry, Common Data States, and Methodology shortcuts.
- Guarantees: browser fetch is enhancement-only; parse/fetch errors leave staged status visible and announce a non-destructive refresh failure.

- [ ] **Step 1: Write failing page-contract tests**

```js
test("Data Center V3 keeps its last safe snapshot when the refresh request fails", async () => {
  const page = await import("../static-showcase/assets/data-center-page.js");
  assert.deepEqual(page.chooseStatusSnapshot(bootstrap, null), bootstrap);
});

test("Data Center V3 exposes semantic operational sections without internal diagnostics", async () => {
  const html = await readFile(new URL("../static-showcase/data-center.html", import.meta.url), "utf8");
  for (const label of ["Dataset Health", "Data Quality", "更新紀錄", "異常與勘誤", "官方來源", "資料狀態說明"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /sourceId|missingReasons|response_hash|sha256/);
});
```

- [ ] **Step 2: Run the focused page tests and verify they fail for missing V3 sections or fetch fallback**

Run: `node --test tests/static-showcase-data-governance.test.mjs tests/static-showcase-data-center-v3.test.mjs`

Expected: failure identifying the missing page contract.

- [ ] **Step 3: Implement the V3 DOM contract and progressive enhancement**

```js
export function chooseStatusSnapshot(bootstrap, refreshed) {
  return refreshed?.schemaVersion === 1 ? refreshed : bootstrap;
}

async function initialize() {
  const bootstrap = readEmbeddedStatus(document.querySelector("#data-center-bootstrap"));
  renderDataCenter(document, bootstrap);
  const refreshed = await fetchGeneratedStatus(bootstrap?.statusUrl);
  renderDataCenter(document, chooseStatusSnapshot(bootstrap, refreshed));
}
```

Render factual labels and dates only. Use explicit text badges, `—` for unavailable fields, a clear no-unresolved-incidents empty state, actual stage-validation QA checks, and links only to public official source URLs or the existing Methodology page.

- [ ] **Step 4: Implement responsive and accessible layout rules**

```css
@media (max-width: 760px) {
  .data-health-table { display: none; }
  .data-health-cards { display: grid; }
  .data-center-hero__facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

Use one status palette shared by table and cards, semantic table headers on desktop, visible keyboard focus, and no horizontal-only mobile table.

- [ ] **Step 5: Run focused UI/governance tests and verify they pass**

Run: `node --test tests/static-showcase-data-governance.test.mjs tests/static-showcase-data-center-v3.test.mjs`

Expected: public-content, static-resilience, and V3-section tests all pass.

- [ ] **Step 6: Commit the V3 Data Center interface**

```bash
git add static-showcase/data-center.html static-showcase/assets/data-center-page.js static-showcase/assets/app.css tests/static-showcase-data-governance.test.mjs tests/static-showcase-data-center-v3.test.mjs
git commit -m "feat: redesign Data Center as operations dashboard"
```

### Task 4: Regression, release verification, and review

**Files:**
- Modify: `docs/market-platform-v2-completion-checklist.md` only if it needs an explicit V3 Data Center verification entry.
- Test: `tests/static-showcase-data-center-v3.test.mjs`, `tests/static-showcase-data-governance.test.mjs`, `tests/stage-static-showcase.test.mjs`, complete `npm test` suite.

**Interfaces:**
- Verifies the Data Center V3 status artifact against the existing publication gate and public-data projection boundary.
- Verifies the rest of the market site keeps its existing routes and financial data contracts.

- [ ] **Step 1: Add any missing regression assertions before changing release documentation**

```js
test("Data Center V3 does not alter published market data or expose prohibited internal fields", async () => {
  const html = await readFile(new URL("../dist/client/market-site/data-center.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /sourceId|missingReasons|approved_cb_history/);
});
```

- [ ] **Step 2: Run targeted V3, staging, and public-data tests**

Run: `node --test tests/static-showcase-data-center-v3.test.mjs tests/static-showcase-data-governance.test.mjs tests/stage-static-showcase.test.mjs tests/public-static-projection.test.mjs`

Expected: zero failures and no public internal metadata.

- [ ] **Step 3: Run full quality checks**

Run: `npm test && npm run lint && npm run typecheck`

Expected: build succeeds, all tests pass, lint produces zero errors, and TypeScript exits zero.

- [ ] **Step 4: Perform browser smoke checks against staged output**

Check desktop and narrow mobile for `/market-site/data-center.html`; verify the system hero, Dataset Health, QA, timeline, incident empty state, source links, Methodology link, no console error, no missing asset, and no horizontal layout overflow. Also smoke-check `/market-site/`, `emerging.html`, `ipo.html`, and `bonds.html` for regression.

- [ ] **Step 5: Request focused code review and address any critical or important findings**

Provide the reviewer with this plan, the V3 requirement PDF, the base SHA, the final SHA, and the prohibition against changing financial calculations or publishing internal metadata.

- [ ] **Step 6: Commit verified V3 changes**

```bash
git add docs/market-platform-v2-completion-checklist.md tests/static-showcase-data-center-v3.test.mjs
git commit -m "test: verify Data Center V3 release readiness"
```
