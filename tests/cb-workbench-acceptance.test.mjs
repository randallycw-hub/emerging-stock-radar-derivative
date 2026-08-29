import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildBondWorkbenchSnapshot } from "../lib/market-data/bond-workbench.ts";
import { runIsolatedNightlyMarketRefreshTestHarness } from "../scripts/run-nightly-market-refresh.mjs";
import {
  projectPublicBondArtifacts,
  stageStaticShowcase,
  stripPublicInternalMetadata,
} from "../scripts/stage-static-showcase.mjs";
import {
  filterBondRecords,
  paginateBondRecords,
  serializeBondListState,
  sortBondRecords,
} from "../static-showcase/assets/bond-list-page.js";

const designFixtures = [
  {
    sampleLabel: "聯電一（匿名化）", bondCode: "90001", issuerCode: "9000",
    issuerName: "公開發行人甲", bondName: "設計樣本一", dataDate: "2026-08-12",
    status: "archived", archiveReason: "matured", archivedAt: "2026-08-12",
    issueAmount: "100000000", outstandingAmount: "0", cbTradeUnits: "0",
    ohlcAvailable: false, optionalState: "unavailable", historyCount: 0,
  },
  {
    sampleLabel: "金像電三（匿名化）", bondCode: "90002", issuerCode: "9001",
    issuerName: "公開發行人乙", bondName: "設計樣本二", dataDate: "2026-08-12",
    status: "active", archiveReason: null, archivedAt: null,
    issueAmount: "200000000", outstandingAmount: "150000000", cbTradeUnits: "12",
    ohlcAvailable: true, optionalState: "fresh", historyCount: 60,
  },
  {
    sampleLabel: "博智二（匿名化）", bondCode: "90003", issuerCode: "9001",
    issuerName: "公開發行人乙", bondName: "設計樣本三", dataDate: "2026-08-11",
    status: "active", archiveReason: null, archivedAt: null,
    issueAmount: "300000000", outstandingAmount: "300000000", cbTradeUnits: "0",
    ohlcAvailable: false, optionalState: "stale", historyCount: 1,
  },
  {
    sampleLabel: "偉詮電一（匿名化）", bondCode: "90004", issuerCode: "9002",
    issuerName: "公開發行人丙", bondName: "設計樣本四", dataDate: "2026-08-12",
    status: "archived", archiveReason: "removed_from_official_roster", archivedAt: "2026-08-12",
    issueAmount: "400000000", outstandingAmount: "400000000", cbTradeUnits: "4",
    ohlcAvailable: true, optionalState: "fresh", historyCount: 20,
  },
  {
    sampleLabel: "至上 11（匿名化）", bondCode: "90005", issuerCode: "9003",
    issuerName: "公開發行人丁", bondName: "設計樣本五", dataDate: "2026-08-10",
    status: "archived", archiveReason: "redeemed", archivedAt: "2026-08-12",
    issueAmount: "500000000", outstandingAmount: "0", cbTradeUnits: "0",
    ohlcAvailable: true, optionalState: "stale", historyCount: 45,
  },
  {
    sampleLabel: "順德一（匿名化）", bondCode: "90006", issuerCode: "9004",
    issuerName: "公開發行人戊", bondName: "設計樣本六", dataDate: "2026-08-12",
    status: "active", archiveReason: null, archivedAt: null,
    issueAmount: "600000000", outstandingAmount: "600000000", cbTradeUnits: "0",
    ohlcAvailable: false, optionalState: "unavailable", historyCount: 2,
  },
];

const publicFixtureKeys = new Set([
  "sampleLabel", "bondCode", "issuerCode", "issuerName", "bondName", "dataDate",
  "status", "archiveReason", "archivedAt", "issueAmount", "outstandingAmount",
  "cbTradeUnits", "ohlcAvailable", "optionalState", "historyCount",
]);

test("offline builder and outer refresh stage the same CB generation through the static page loaders", async () => {
  const outcome = await withGlobalFetchBlocked(() =>
    runIsolatedNightlyMarketRefreshTestHarness({
      date: "2026-07-29",
      scenario: "success",
    }));

  assert.equal(outcome.status, "fulfilled");
  assert.deepEqual(outcome.deploymentEffects, []);
  assert.deepEqual(outcome.decisions, {
    added: ["11011"],
    updated: ["35221"],
    archived: ["99999"],
  });
  const runtime = JSON.parse(outcome.artifacts.active["runtime.json"]);
  const manifest = JSON.parse(outcome.artifacts.active["manifest.json"]);
  const workbench = JSON.parse(outcome.artifacts.active["bond-workbench.json"]);
  const history = JSON.parse(outcome.artifacts.active["bond-market-history.json"]);
  assert.equal(runtime.datasets.bondWorkbench, `./data/${runtime.generation}/bond-workbench.json`);
  assert.equal(manifest.market.status, "verified");
  assert.ok(manifest.market.files.some((entry) => entry.name === "bond-workbench.json"));
  assert.equal(workbench.schemaVersion, 1);
  assert.equal(
    workbench.records.find((record) => record.bondCode === "99999")?.archiveReason,
    "removed_from_official_roster",
  );
  const zeroTradeDateMismatch = workbench.records.find(
    (record) => record.bondCode === "11011",
  );
  assert.equal(zeroTradeDateMismatch?.view.cbTradeUnits, "0");
  assert.ok(zeroTradeDateMismatch?.view.missingReasons.includes("NO_COMMON_VALUATION_DATE"));
  assert.ok(zeroTradeDateMismatch?.view.missingReasons.includes("BALANCE_TRADE_DATE_MISMATCH"));
  assert.equal(new Set(workbench.records.map((record) => record.bondCode)).size, workbench.records.length);
  for (const record of workbench.records) {
    assert.equal(record.bondCode, record.term.bondCode);
    assert.equal(record.bondCode, record.view.bondCode);
    assert.equal(record.term.issuerCode, record.view.issuerCode);
    assert.ok(Number(record.term.outstandingAmount) <= Number(record.term.issueAmount));
    for (const strategy of record.assessment.strategies) {
      assert.ok(new Set(strategy.checks.map((check) => check.dataDate).filter(Boolean)).size <= 1);
    }
  }
  const workbenchCodes = new Set(workbench.records.map((record) => record.bondCode));
  assert.ok(Array.isArray(history));
  assert.ok(history.every((point) => workbenchCodes.has(point.bondCode)));

  const root = await mkdtemp(join(tmpdir(), "cb-workbench-acceptance-"));
  const source = join(root, "source");
  const destination = join(root, "market-site");
  try {
    await cp(fileURLToPath(new URL("../static-showcase/", import.meta.url)), source, {
      recursive: true,
    });
    await rm(join(source, "data"), { recursive: true, force: true });
    const generationRoot = join(source, "data", ...runtime.generation.split("/"));
    await mkdir(generationRoot, { recursive: true });
    await writeFile(
      join(source, "data", "current.json"),
      outcome.artifacts.after.pointerText,
      "utf8",
    );
    for (const [name, text] of Object.entries(outcome.artifacts.active)) {
      assert.equal(typeof text, "string", `isolated candidate omitted ${name}`);
      await writeFile(join(generationRoot, name), text, "utf8");
    }

    await stageStaticShowcase({ source, destination });
    const stagedPointerText = await readFile(join(destination, "data", "current.json"), "utf8");
    assert.equal(stagedPointerText, outcome.artifacts.after.pointerText);
    const stagedPointer = JSON.parse(stagedPointerText);
    const stagedRuntimePath = join(
      destination,
      ...stagedPointer.runtimeUrl.replace(/^\.\//, "").split("/"),
    );
    const stagedRuntimeText = await readFile(stagedRuntimePath, "utf8");
    const stagedRuntime = JSON.parse(stagedRuntimeText);
    const expectedRuntime = JSON.parse(outcome.artifacts.active["runtime.json"]);
    Object.assign(expectedRuntime, {
      companyMasterUrl: `./data/${expectedRuntime.generation}/company-master.json`,
      cbMasterUrl: `./data/${expectedRuntime.generation}/cb-master.json`,
      searchIndexUrl: `./data/${expectedRuntime.generation}/search-index.json`,
    });
    assert.deepEqual(stagedRuntime, expectedRuntime);
    assert.equal(
      stagedRuntime.datasets.bondWorkbench,
      `./data/${stagedRuntime.generation}/bond-workbench.json`,
    );
    const stagedWorkbenchPath = join(
      destination,
      ...stagedRuntime.datasets.bondWorkbench.replace(/^\.\//, "").split("/"),
    );
    const stagedWorkbenchText = await readFile(stagedWorkbenchPath, "utf8");
    const expectedPublicBondArtifacts = projectPublicBondArtifacts({
      workbench,
      views: JSON.parse(outcome.artifacts.active["bond-market-view.json"]),
      issuerResearch: JSON.parse(outcome.artifacts.active["cb-issuer-research.json"]),
    });
    assert.deepEqual(
      JSON.parse(stagedWorkbenchText),
      stripPublicInternalMetadata(expectedPublicBondArtifacts.workbench),
    );
    const stagedHistoryPath = join(
      destination,
      ...stagedRuntime.datasets.bondHistory.replace(/^\.\//, "").split("/"),
    );
    assert.deepEqual(
      JSON.parse(await readFile(stagedHistoryPath, "utf8")),
      stripPublicInternalMetadata(JSON.parse(outcome.artifacts.active["bond-market-history.json"])),
    );

    const page = await runStagedBondPage(destination);
    try {
      assert.deepEqual(
        new Set(page.fetches.map((url) => new URL(url).pathname.split("/").at(-1))),
        new Set([
          "current.json", "runtime.json", "manifest.json", "11406.json",
          "bond-market-history.json",
          "conversion-prices.json", "bond-workbench.json", "cb-master.json",
        ]),
      );
      assert.match(page.document.element("bond-table-body").innerHTML, /35221/);
      assert.doesNotMatch(page.document.element("bond-table-body").innerHTML, /99999/);

      const activeOrigin = page.document.resultFor("35221", "TR");
      assert.ok(activeOrigin);
      assert.equal(activeOrigin.getClientRects().length, 1);
      activeOrigin.dispatch("click");
      assert.equal(page.location.search, "?bond=35221");
      assert.match(page.document.element("bond-workbench").innerHTML, /御嵿一/);
      assert.equal(page.document.activeElement, page.document.closeButton);
      assert.doesNotMatch(page.document.element("bond-workbench").innerHTML, /data-bond-kline-host|klinechart/i);

      page.document.closeButton.dispatch("keydown", { key: "Enter" });
      assert.equal(page.location.search, "");
      assert.equal(page.document.activeElement?.dataset.bondCode, "35221");
      assert.equal(page.document.activeElement?.tagName, "TR");
      assert.notEqual(page.document.activeElement, activeOrigin);
      const archiveToggle = page.document.element("bond-archive-toggle");
      archiveToggle.checked = true;
      archiveToggle.dispatch("change", { target: archiveToggle });
      assert.match(page.document.element("bond-table-body").innerHTML, /99999/);
      page.document.resultFor("99999").dispatch("click");
      assert.equal(page.location.search, "?archived=1&direction=asc&page=1&bond=99999");
      assert.match(page.document.element("bond-workbench").innerHTML, /舊債一/);
      assert.doesNotMatch(page.document.element("bond-workbench").innerHTML, /封存原因|archiveReason/);
    } finally {
      page.dispose();
    }

    const emptyPage = await runStagedBondPage(destination, {
      workbenchFailure: "empty",
    });
    try {
      assert.doesNotMatch(emptyPage.document.element("bond-table-body").innerHTML, /35221/);
      assert.match(emptyPage.document.element("bond-table-body").innerHTML, /沒有符合條件/);
      assert.equal(emptyPage.document.querySelectorAll("[data-bond-code]").length, 0);
    } finally {
      emptyPage.dispose();
    }

    const mobilePage = await runStagedBondPage(destination, { compact: true });
    try {
      const hiddenRow = mobilePage.document.resultFor("35221", "TR");
      const mobileOrigin = mobilePage.document.resultFor("35221", "BUTTON");
      assert.equal(hiddenRow.getClientRects().length, 0);
      assert.equal(mobileOrigin.getClientRects().length, 1);
      mobileOrigin.dispatch("click");
      assert.equal(mobilePage.document.activeElement, mobilePage.document.closeButton);
      mobilePage.document.closeButton.dispatch("click");
      assert.equal(mobilePage.location.search, "");
      assert.equal(mobilePage.document.activeElement?.tagName, "BUTTON");
      assert.equal(mobilePage.document.activeElement?.dataset.bondCode, "35221");
      assert.notEqual(mobilePage.document.activeElement, mobileOrigin);
    } finally {
      mobilePage.dispose();
    }

    const directPage = await runStagedBondPage(destination, {
      initialSearch: "?bond=35221",
    });
    try {
      assert.equal(directPage.document.activeElement, directPage.document.closeButton);
      directPage.document.closeButton.dispatch("click");
      assert.equal(directPage.location.search, "");
      assert.equal(
        directPage.document.activeElement,
        directPage.document.element("bond-search"),
      );
    } finally {
      directPage.dispose();
    }

    const keyboardPage = await runStagedBondPage(destination, {
      initialSearch: "?event=rights90",
    });
    try {
      const search = keyboardPage.document.element("bond-search");
      search.value = "35221";
      search.dispatch("input");
      search.dispatch("keydown", { key: "Enter", currentTarget: search });
      assert.equal(
        keyboardPage.location.search,
        "?q=35221&event=rights90&direction=asc&page=1&bond=35221",
      );
      assert.match(keyboardPage.document.element("bond-workbench").innerHTML, /御嵿一/);
    } finally {
      keyboardPage.dispose();
    }

    const undeclaredPage = await runStagedBondPage(destination, {
      workbenchFailure: "undeclared",
    });
    try {
      const search = undeclaredPage.document.element("bond-search");
      search.value = "35221";
      search.dispatch("input");
      assert.match(undeclaredPage.document.element("bond-table-body").innerHTML, /可轉債工作台資料目前無法使用/);
      assert.equal(undeclaredPage.document.element("bond-search-suggestions").innerHTML, "");
      assert.equal(search.getAttribute("aria-expanded"), "false");
      assert.ok(!undeclaredPage.fetches.some((url) => url.endsWith("bond-workbench.json")));
    } finally {
      undeclaredPage.dispose();
    }

    for (const workbenchFailure of ["network", "http", "json"]) {
      const failedPage = await runStagedBondPage(destination, { workbenchFailure });
      try {
        assert.match(
          failedPage.document.element("bond-table-body").innerHTML,
          /可轉債工作台資料目前無法使用/,
          `${workbenchFailure} must fail closed instead of rendering legacy rows`,
        );
        assert.equal(failedPage.document.querySelectorAll("[data-bond-code]").length, 0);
      } finally {
        failedPage.dispose();
      }
    }
    const failedDirectPage = await runStagedBondPage(destination, {
      initialSearch: "?bond=35221",
      workbenchFailure: "json",
    });
    try {
      assert.match(
        failedDirectPage.document.element("bond-workbench").innerHTML,
        /可轉債工作台資料目前無法使用/,
      );
      assert.doesNotMatch(
        failedDirectPage.document.element("bond-workbench").innerHTML,
        /找不到代碼/,
      );
    } finally {
      failedDirectPage.dispose();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("anonymous six-case matrix covers list, archive, and missing-data edges without proprietary fields", () => {
  assert.deepEqual(designFixtures.map((fixture) => fixture.sampleLabel), [
    "聯電一（匿名化）", "金像電三（匿名化）", "博智二（匿名化）",
    "偉詮電一（匿名化）", "至上 11（匿名化）", "順德一（匿名化）",
  ]);
  for (const fixture of designFixtures) {
    assert.ok(Object.keys(fixture).every((key) => publicFixtureKeys.has(key)));
    assert.ok(Number(fixture.outstandingAmount) <= Number(fixture.issueAmount));
  }
  assert.equal(designFixtures.filter((fixture) => fixture.issuerCode === "9001").length, 2);
  assert.ok(designFixtures.some((fixture) => fixture.cbTradeUnits === "0"));
  assert.ok(designFixtures.some((fixture) => fixture.ohlcAvailable === false));
  assert.ok(designFixtures.some((fixture) => fixture.optionalState === "stale"));
  assert.ok(designFixtures.some((fixture) => fixture.historyCount < 5));
  assert.deepEqual(
    filterBondRecords(designFixtures, { query: "公開發行人乙" }).map((fixture) => fixture.bondCode),
    ["90002", "90003"],
  );
  assert.deepEqual(
    filterBondRecords(designFixtures).map((fixture) => fixture.bondCode),
    ["90002", "90003", "90006"],
  );
  assert.equal(filterBondRecords(designFixtures, { archived: true }).length, 6);
  assert.equal(sortBondRecords(designFixtures, { key: "outstandingAmount", direction: "desc" })[0].bondCode, "90006");
  assert.equal(paginateBondRecords(Array.from({ length: 51 }, (_, index) => ({ bondCode: String(index) })), 2).records.length, 1);
  assert.equal(
    serializeBondListState({ query: "90001", archived: true, sortKey: "bondCode", direction: "desc", page: 2 }),
    "?q=90001&archived=1&sort=bondCode&direction=desc&page=2",
  );
});

test("production workbench builder decides redemption, maturity, zero balance, and roster removal", () => {
  const previous = buildBondWorkbenchSnapshot(lifecycleInput({
    currentTerms: [lifecycleTerm("35221"), lifecycleTerm("35222"), lifecycleTerm("35223"), lifecycleTerm("35224")],
    currentViews: [lifecycleView("35221"), lifecycleView("35222"), lifecycleView("35223"), lifecycleView("35224")],
  }));
  const result = buildBondWorkbenchSnapshot(lifecycleInput({
    previous,
    currentTerms: [
      lifecycleTerm("35221"),
      lifecycleTerm("35222", { maturityDate: "2026-08-12" }),
      lifecycleTerm("35223", { outstandingAmount: "0" }),
    ],
    currentViews: [
      lifecycleView("35221", { redemptionEvent: lifecycleRedemptionEvent() }),
      lifecycleView("35222", { maturityDate: "2026-08-12" }),
      lifecycleView("35223", { outstandingAmount: "0" }),
    ],
  }));

  assert.deepEqual(result.records.map(({ bondCode, archiveReason }) => [bondCode, archiveReason]), [
    ["35221", "redeemed"],
    ["35222", "matured"],
    ["35223", "balance_exhausted"],
    ["35224", "removed_from_official_roster"],
  ]);
});

function lifecycleTerm(bondCode, patch = {}) {
  return {
    bondCode, issuerCode: "3522", bondName: "御嵿一", issuerName: "御嵿",
    issueDate: "2023-12-18", listingDate: "2023-12-18", maturityDate: "2028-07-29",
    issueAmount: "500000000", outstandingAmount: "400000000", outstandingDataDate: "2026-08-12",
    initialConversionPrice: "40", conversionStartDate: "2024-03-19", conversionEndDate: "2028-07-29",
    putDates: ["2027-08-30"], putPrice: "101", securedStatus: "無擔保",
    underwriter: "兆豐證券", trustee: "彰化銀行", unitFaceValueTwd: null,
    ...patch,
  };
}

function lifecycleView(bondCode, patch = {}) {
  return {
    bondCode, issuerCode: "3522", bondName: "御嵿一", issuerResearch: null,
    cbClose: "103.5", cbPriceDate: "2026-08-12", cbTradeUnits: "10",
    stockClose: "38.25", stockPriceDate: "2026-08-12", currentConversionPrice: "35.1",
    conversionPriceEffectiveDate: "2025-11-09", valuationDate: "2026-08-12",
    valuationCbClose: "103.5", valuationStockClose: "38.25", conversionValue: "108.97",
    premiumRate: "-5.02", outstandingAmount: "400000000", outstandingDataDate: "2026-08-12",
    outstandingReductionRate: "20", remainingUnits: "4000", remainingRatio: "80",
    dailyTurnoverRate: "0.25", institutionDataDate: null, institutionNetUnits: null,
    institutionNet5dUnits: null, institutionNet20dUnits: null, redemptionEvent: null,
    maturityDate: "2028-07-29", daysToMaturity: 715, nextPutDate: "2027-08-30",
    daysToNextPut: 382, nextEventType: "put", nextEventDate: "2027-08-30",
    daysToNextEvent: 382, marketStatus: "ACTIVE", dataQuality: "partial", staleCbPrice: false, missingReasons: [],
    ...patch,
  };
}

function lifecycleInput(patch = {}) {
  return {
    generatedAt: "2026-08-13T01:00:00.000Z", dataDate: "2026-08-12",
    asOfDate: "2026-08-13", currentTerms: [lifecycleTerm("35221")],
    currentViews: [lifecycleView("35221")], currentEvents: [],
    ...patch,
  };
}

function lifecycleRedemptionEvent() {
  return {
    issuerCode: "3522", issuerName: "御嵿", bondCode: "35221", bondName: "御嵿一",
    announcementDate: "2026-08-01", delistingDate: "2026-08-13",
    subject: "公告御嵿股份有限公司國內轉換公司債(簡稱：御嵿一，代碼：35221)發行公司行使債券贖回權暨訂於115年08月13日終止櫃檯買賣等相關事宜。",
    detailUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3522&date1=20260801&seq_no=1&pub_class=0&firstin=1",
  };
}

async function withGlobalFetchBlocked(run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("LIVE_NETWORK_BLOCKED_BY_ACCEPTANCE_TEST");
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

async function runStagedBondPage(
  destination,
  { compact = false, initialSearch = "", workbenchFailure = null } = {},
) {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    location: globalThis.location,
    history: globalThis.history,
    fetch: globalThis.fetch,
  };
  const document = new AcceptanceDocument(
    pathToFileURL(join(destination, "bonds.html")).href,
    compact,
  );
  const location = { pathname: "/bonds.html", search: initialSearch };
  const updateLocation = (url) => {
    const parsed = new URL(url, "https://acceptance.invalid/bonds.html");
    location.pathname = parsed.pathname;
    location.search = parsed.search;
  };
  const history = {
    pushState(_state, _unused, url) { updateLocation(url); },
    replaceState(_state, _unused, url) { updateLocation(url); },
  };
  const fetches = [];
  const window = {
    document,
    location,
    history,
    matchMedia() {
      return {
        matches: compact,
        addEventListener() {},
        removeEventListener() {},
      };
    },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = window;
  globalThis.document = document;
  globalThis.location = location;
  globalThis.history = history;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), document.baseURI);
    fetches.push(url.href);
    if (workbenchFailure === "undeclared" && url.pathname.endsWith("/runtime.json")) {
      const runtime = JSON.parse(await readFile(fileURLToPath(url), "utf8"));
      delete runtime.datasets.bondWorkbench;
      return Response.json(runtime);
    }
    if (url.pathname.endsWith("/bond-workbench.json")) {
      if (workbenchFailure === "empty") {
        return Response.json({ schemaVersion: 1, records: [] });
      }
      if (workbenchFailure === "network") throw new Error("simulated network failure");
      if (workbenchFailure === "http") return new Response("not found", { status: 503 });
      if (workbenchFailure === "json") return new Response("{", { status: 200 });
    }
    try {
      return new Response(await readFile(fileURLToPath(url), "utf8"), { status: 200 });
    } catch {
      return new Response("not found", { status: 404 });
    }
  };
  const cacheKey = `task10-page-${Date.now()}-${Math.random()}`;
  await import(`${pathToFileURL(join(destination, "assets", "bonds-page.js")).href}?${cacheKey}`);
  return {
    document,
    location,
    fetches,
    dispose() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    },
  };
}

class AcceptanceElement {
  constructor(document, id = "", { tagName = "DIV", visible = true } = {}) {
    this.ownerDocument = document;
    this.id = id;
    this.tagName = tagName;
    this.visible = visible;
    this.dataset = {};
    this.hidden = false;
    this.checked = false;
    this.value = "";
    this.textContent = "";
    this.isConnected = true;
    this.listeners = new Map();
    this.attributes = new Map();
    this._innerHTML = "";
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this.ownerDocument.onInnerHtml(this);
  }

  get innerHTML() { return this._innerHTML; }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  dispatch(type, event = {}) { this.listeners.get(type)?.({ preventDefault() {}, ...event }); }
  focus() { this.ownerDocument.activeElement = this; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getClientRects() { return this.visible ? [{}] : []; }
}

class AcceptanceDetailElement extends AcceptanceElement {
  set innerHTML(value) {
    this._innerHTML = String(value);
    this.ownerDocument.onInnerHtml(this);
    this.ownerDocument.resetDetail(this._innerHTML);
  }

  get innerHTML() { return this._innerHTML; }

  querySelector(selector) {
    if (selector === "[data-detail-close]") return this.ownerDocument.closeButton;
    if (selector === ".close-workbench") return this.ownerDocument.closeButton;
    if (selector === "[data-detail-tab][aria-selected=\"true\"]") {
      return this.ownerDocument.detailTabs.find(
        (tab) => tab.getAttribute("aria-selected") === "true",
      ) ?? null;
    }
    if (selector === "[data-chart-data]") return null;
    return null;
  }

  querySelectorAll(selector) {
    if (selector === ".detail-mobile-area") return this.ownerDocument.detailAreas;
    if (selector === "[data-detail-panel]") return this.ownerDocument.detailPanels;
    if (selector === "[data-detail-tab]") return this.ownerDocument.detailTabs;
    return [];
  }
}

class AcceptanceDocument {
  constructor(baseURI, compact = false) {
    this.baseURI = baseURI;
    this.compact = compact;
    this.activeElement = null;
    this.elements = new Map();
    for (const id of [
      "bond-search", "bond-archive-toggle", "bond-clear-filter", "bond-result-count",
      "bond-search-suggestions",
      "bond-table-body", "bond-card-list", "bond-pagination", "bond-list-view",
      "bond-update-status", "bond-market-heading",
    ]) this.elements.set(id, new AcceptanceElement(this, id));
    this.elements.set("bond-workbench", new AcceptanceDetailElement(this, "bond-workbench"));
    this.resultsByContainer = new Map();
    this.closeButton = null;
    this.detailTabs = [];
    this.detailAreas = [];
    this.detailPanels = [];
  }

  element(id) { return this.elements.get(id); }

  querySelector(selector) {
    if (selector.startsWith("#")) return this.element(selector.slice(1)) ?? null;
    if (selector === "[data-page-error]") return null;
    return null;
  }

  querySelectorAll(selector) {
    if (selector === "[data-sort-key]" || selector === "[data-page]") return [];
    if (selector === "[data-bond-code]") {
      return [...this.resultsByContainer.values()].flat();
    }
    return [];
  }

  onInnerHtml(element) {
    if (element.id !== "bond-table-body" && element.id !== "bond-card-list") return;
    for (const result of this.resultsByContainer.get(element.id) ?? []) {
      result.isConnected = false;
    }
    const results = [];
    for (const match of element.innerHTML.matchAll(/data-bond-code="(\d{5,6})"/g)) {
      const result = new AcceptanceElement(this, "", {
        tagName: element.id === "bond-table-body" ? "TR" : "BUTTON",
        visible: element.id === "bond-table-body" ? !this.compact : this.compact,
      });
      result.dataset.bondCode = match[1];
      results.push(result);
    }
    this.resultsByContainer.set(element.id, results);
  }

  resetDetail(html) {
    this.closeButton = html.includes("data-detail-close") || html.includes("close-workbench")
      ? new AcceptanceElement(this, "detail-close")
      : null;
    this.detailTabs = ["overview", "terms", "institutions", "company"].map(
      (name, index) => {
        const tab = new AcceptanceElement(this);
        tab.dataset.detailTab = name;
        tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
        return tab;
      },
    );
    this.detailAreas = Array.from({ length: 9 }, () => new AcceptanceElement(this));
    this.detailPanels = [...html.matchAll(/data-detail-panel="([^"]+)"/g)].map((match) => {
      const panel = new AcceptanceElement(this);
      panel.dataset.detailPanel = match[1];
      panel.hidden = false;
      return panel;
    });
  }

  resultFor(bondCode, tagName = null) {
    return this.querySelectorAll("[data-bond-code]").find(
      (result) => result.dataset.bondCode === bondCode
        && (tagName === null || result.tagName === tagName),
    ) ?? null;
  }
}
