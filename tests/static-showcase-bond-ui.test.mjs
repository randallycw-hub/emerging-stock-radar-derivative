import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bondShortcutState } from "../static-showcase/assets/bonds-page.js";

const root = new URL("../static-showcase/", import.meta.url);

test("bond strategy shortcuts select a public screener without internal quality filters", () => {
  assert.deepEqual(bondShortcutState("recent-issue"), { screener: "recent90" });
  assert.deepEqual(bondShortcutState("low-premium"), { screener: "lowPremium" });
  assert.deepEqual(bondShortcutState("near-conversion"), { screener: "conversion100" });
  assert.deepEqual(bondShortcutState("low-price"), { screener: "cheap" });
  assert.deepEqual(bondShortcutState("upcoming-rights"), { screener: "", event: "rights90" });
});

test("bond page exposes the complete sortable CB workbench", async () => {
  const [home, bondsHtml, js, detailJs, sortJs, css] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("bonds.html", root), "utf8"),
    readFile(new URL("assets/bonds-page.js", root), "utf8"),
    readFile(new URL("assets/bond-detail-page.js", root), "utf8"),
    readFile(new URL("assets/table-sort.js", root), "utf8"),
    readFile(new URL("assets/app.css", root), "utf8"),
  ]);

  for (const label of [
    "CB 代碼／名稱",
    "CB 收盤",
    "標的股收盤",
    "目前轉換價",
    "轉換價值",
    "轉換溢價率",
    "流通餘額比例",
    "下一事件",
    "資料日期",
  ]) {
    assert.match(bondsHtml + js, new RegExp(label));
  }
  assert.match(home, /assets\/app\.css/);
  assert.doesNotMatch(home, /assets\/(?:app|bonds-page)\.js/);
  assert.match(bondsHtml, /id="bond-search"/);
  assert.match(bondsHtml, /id="bond-archive-toggle"/);
  assert.match(bondsHtml, /id="bond-clear-filter"/);
  assert.match(bondsHtml, /id="bond-table-body"/);
  assert.match(bondsHtml, /id="bond-workbench"/);
  assert.match(bondsHtml, /data-detail-url-param="bond"/);
  assert.match(bondsHtml, /assets\/site-shell\.js/);
  assert.match(bondsHtml, /assets\/bonds-page\.js/);
  assert.doesNotMatch(bondsHtml, /href="\.\/methodology\.html"/);
  assert.match(bondsHtml, /aria-label="可轉債分頁"/);
  assert.match(bondsHtml, /data-sort-key="remainingRatio"/);
  assert.match(bondsHtml, /data-sort-key="nextEventDate"/);
  assert.doesNotMatch(bondsHtml, /data-sort-key="outstandingReductionRate"/);
  assert.doesNotMatch(bondsHtml, /data-sort-key="nextPutDate"/);
  assert.match(js, /URLSearchParams/);
  assert.match(js, /maturityDate/);
  assert.match(js, /daysToMaturity/);
  assert.match(js, /cbPriceDate/);
  assert.match(js, /value === null \|\| value === undefined/);
  assert.match(js, /bond/);
  assert.match(js, /bond-list-page/);
  assert.match(js, /bond-detail-page/);
  assert.match(js, /bondWorkbench/);
  assert.match(js, /direction/);
  assert.match(js, /page/);
  assert.match(js, /history\.(?:pushState|replaceState)/);
  assert.doesNotMatch(js, /location\.hash|hashchange/);
  assert.doesNotMatch(js, /資料來源|擷取版本/);
  assert.match(sortJs, /export function sortRows/);
  assert.match(css, /--clay:\s*#2456a6/);
  assert.match(css, /--clay-ink:\s*#194584/);
  assert.match(css, /--violet:\s*#7352b8/);
  assert.match(css, /color:\s*var\(--clay-ink\)/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.doesNotMatch(
    js,
    /const history =[\s\S]*history\.replaceState/,
    "區域資料變數不可遮蔽瀏覽器 history 物件",
  );
  assert.doesNotMatch(js, /function renderWorkbench|function drawHistoryChart/);
  assert.match(js, /bindBondDetail\(target, closeDetail, \{ history: state\.history\.filter/);
  assert.match(detailJs, /function noAdviceViolations/);
  assert.match(detailJs, /FORBIDDEN_UI_PATTERNS/);
  assert.match(detailJs, /data-bond-kline-host/);
  assert.match(detailJs, /noopener noreferrer/);
  assert.doesNotMatch(detailJs, /目前無核准公開資料／待確認/);
  assert.doesNotMatch(bondsHtml + js + detailJs, /資料品質|待補／待確認資料|CBAS 權利金|TCRI 信用評等/);
});

test("detail UI gate scans static presentation strings for prohibited public investment directions", async () => {
  const [html, listJs] = await Promise.all([
    readFile(new URL("bonds.html", root), "utf8"),
    readFile(new URL("assets/bonds-page.js", root), "utf8"),
  ]);
  const { noAdviceViolations } = await import("../static-showcase/assets/bond-detail-page.js");
  assert.deepEqual(noAdviceViolations(html + listJs), []);
  assert.deepEqual(noAdviceViolations("條件符合"), []);
  assert.deepEqual(noAdviceViolations("建議買進後下單"), ["recommendation", "buy-sell-short", "order"]);
});

test("static showcase keeps presentation out of generated runtime data", async () => {
  const runtime = await readFile(new URL("data/runtime.js", root), "utf8");
  assert.match(runtime, /window\.__OFFICIAL_SHOWCASE__/);
  assert.match(runtime, /generationPointerUrl/);
  assert.doesNotMatch(runtime, /manifestUrl/);
  assert.doesNotMatch(runtime, /document\.querySelector|innerHTML|const val =/);
});

test("bond list module round-trips only supported list URL state", async () => {
  const { parseBondListState, serializeBondListState } = await import("../static-showcase/assets/bond-list-page.js");
  const state = parseBondListState("?q=%E7%94%B2&archived=1&sort=cbClose&direction=desc&page=3");
  assert.deepEqual(state, {
    query: "甲", archived: true, sortKey: "cbClose", direction: "desc", page: 3,
    event: "", maturityBefore: "", remainingMax: null, secured: "", screener: "",
  });
  assert.equal(serializeBondListState(state), "?q=%E7%94%B2&archived=1&sort=cbClose&direction=desc&page=3");
});

test("bond list state round-trips composable public event conditions and filters a matching record", async () => {
  const { filterBondRecords, parseBondListState, serializeBondListState } = await import("../static-showcase/assets/bond-list-page.js");
  const state = parseBondListState("?event=rights90&quality=pending&remainingMax=25&secured=%E7%84%A1%E6%93%94%E4%BF%9D");
  assert.deepEqual(state, {
    query: "",
    archived: false,
    sortKey: "bondCode",
    direction: "asc",
    page: 1,
    event: "rights90",
    maturityBefore: "",
    remainingMax: 25,
    secured: "無擔保",
    screener: "",
  });
  assert.equal(
    serializeBondListState(state),
    "?event=rights90&remainingMax=25&secured=%E7%84%A1%E6%93%94%E4%BF%9D&sort=bondCode&direction=asc&page=1",
  );
  assert.deepEqual(filterBondRecords([{
    bondCode: "90001",
    daysToNextEvent: 90,
    daysToMaturity: 365,
    dataQuality: "partial",
    remainingRatio: "25",
    securedStatus: "無擔保",
  }], state).map((record) => record.bondCode), ["90001"]);
});

test("event filters reject records with missing or invalid day counts", async () => {
  const { filterBondRecords } = await import("../static-showcase/assets/bond-list-page.js");
  const records = [
    { bondCode: "rights-missing", daysToNextEvent: null, daysToMaturity: 30 },
    { bondCode: "rights-invalid", daysToNextEvent: "unknown", daysToMaturity: 30 },
    { bondCode: "rights-match", daysToNextEvent: 90, daysToMaturity: 30 },
    { bondCode: "maturity-missing", daysToNextEvent: 30, daysToMaturity: null },
    { bondCode: "maturity-invalid", daysToNextEvent: 30, daysToMaturity: "unknown" },
    { bondCode: "maturity-match", daysToNextEvent: 30, daysToMaturity: 365 },
  ];
  assert.deepEqual(filterBondRecords(records, { event: "rights90" }).map((record) => record.bondCode), [
    "rights-match", "maturity-missing", "maturity-invalid", "maturity-match",
  ]);
  assert.deepEqual(filterBondRecords(records, { event: "maturity365" }).map((record) => record.bondCode), [
    "rights-missing", "rights-invalid", "rights-match", "maturity-match",
  ]);
});

test("remaining-ratio upper bound rejects missing or invalid record values", async () => {
  const { filterBondRecords } = await import("../static-showcase/assets/bond-list-page.js");
  const records = [
    { bondCode: "missing", remainingRatio: null },
    { bondCode: "invalid", remainingRatio: "unknown" },
    { bondCode: "match", remainingRatio: "25" },
  ];
  assert.deepEqual(filterBondRecords(records, { remainingMax: 25 }).map((record) => record.bondCode), ["match"]);
});

test("public CB screeners derive only reproducible views from verified public fields", async () => {
  const { applyPublicBondScreener } = await import("../static-showcase/assets/bond-list-page.js");
  const records = [
    { bondCode: "recent", issueDate: "2026-08-01", daysToMaturity: 700, remainingRatio: "100", cbClose: "105", conversionValue: "85", premiumRate: "23" },
    { bondCode: "maturing", issueDate: "2024-06-01", daysToMaturity: 120, remainingRatio: "60", cbClose: "99", conversionValue: "104", premiumRate: "-5" },
    { bondCode: "converted", issueDate: "2023-06-01", daysToMaturity: 900, remainingRatio: "20", cbClose: "88", conversionValue: "99", premiumRate: "-1" },
    { bondCode: "missing", issueDate: null, daysToMaturity: null, remainingRatio: null, cbClose: null, conversionValue: null, premiumRate: null },
  ];

  assert.deepEqual(applyPublicBondScreener(records, "recent90", { asOfDate: "2026-08-24" }).map((item) => item.bondCode), ["recent"]);
  assert.deepEqual(applyPublicBondScreener(records, "maturity365", { asOfDate: "2026-08-24" }).map((item) => item.bondCode), ["maturing"]);
  assert.deepEqual(applyPublicBondScreener(records, "converted75", { asOfDate: "2026-08-24" }).map((item) => item.bondCode), ["converted"]);
  assert.deepEqual(applyPublicBondScreener(records, "cheap", { asOfDate: "2026-08-24" }).map((item) => item.bondCode), ["converted", "maturing", "recent", "missing"]);
  assert.deepEqual(applyPublicBondScreener(records, "conversion100", { asOfDate: "2026-08-24" }).map((item) => item.bondCode), ["converted", "maturing", "recent", "missing"]);
  assert.deepEqual(applyPublicBondScreener(records, "lowPremium", { asOfDate: "2026-08-24" }).map((item) => item.bondCode), ["maturing", "converted", "recent", "missing"]);
  assert.deepEqual(applyPublicBondScreener(records, "unknown", { asOfDate: "2026-08-24" }).map((item) => item.bondCode), records.map((item) => item.bondCode));
});

test("PDF CB screeners use the exact public numeric ranges", async () => {
  const { applyPublicBondScreener } = await import("../static-showcase/assets/bond-list-page.js");
  const records = [
    { bondCode: "issue", issueDate: "2026-08-01", daysToMaturity: 800, cbClose: "121", premiumRate: "25", conversionValue: "120", remainingRatio: "80", daysToNextEvent: 90 },
    { bondCode: "near", issueDate: "2025-01-01", daysToMaturity: 90, cbClose: "110", premiumRate: "10", conversionValue: "90", remainingRatio: "49", daysToNextEvent: 30 },
    { bondCode: "band", issueDate: "2025-01-01", daysToMaturity: 365, cbClose: "120", premiumRate: "20", conversionValue: "110", remainingRatio: "50", daysToNextEvent: 31 },
    { bondCode: "other", issueDate: "2025-01-01", daysToMaturity: 366, cbClose: "120.01", premiumRate: "20.01", conversionValue: "110.01", remainingRatio: "50.01", daysToNextEvent: 31 },
  ];
  const ids = (screener) => applyPublicBondScreener(records, screener, { asOfDate: "2026-08-24" }).map((record) => record.bondCode);

  assert.deepEqual(ids("issue90"), ["issue"]);
  assert.deepEqual(ids("maturity90"), ["near"]);
  assert.deepEqual(ids("maturity365"), ["near", "band"]);
  assert.deepEqual(ids("price110"), ["near"]);
  assert.deepEqual(ids("price120"), ["near", "band"]);
  assert.deepEqual(ids("premium0to10"), ["near"]);
  assert.deepEqual(ids("premium10to20"), ["near", "band"]);
  assert.deepEqual(ids("conversion90to110"), ["near", "band"]);
  assert.deepEqual(ids("remainingUnder50"), ["near"]);
  assert.deepEqual(ids("event30"), ["near"]);
});

test("bond page provides composable public event controls and a clear-all empty state", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("bonds.html", root), "utf8"),
    readFile(new URL("assets/bonds-page.js", root), "utf8"),
    readFile(new URL("assets/app.css", root), "utf8"),
  ]);
  assert.match(html, /data-bond-quick-observation/);
  assert.match(html, /<fieldset class="bond-event-shortcuts"/);
  assert.equal((html.match(/data-bond-shortcut=/g) ?? []).length, 7);
  for (const label of ["新發行", "低溢價", "接近轉換價值", "低 CB 收盤價", "90 日內權利事件"]) {
    assert.match(html, new RegExp(label));
  }
  for (const id of ["bond-maturity-before", "bond-remaining-max", "bond-secured"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /<details data-bond-advanced-filters>/);
  assert.match(html, /<summary>進階篩選<\/summary>/);
  assert.match(js, /aria-pressed/);
  assert.match(js, /清除所有條件/);
  assert.match(css, /\.bond-event-shortcuts/);
  assert.match(css, /\.bond-advanced-filter-grid/);
});

test("bond page keeps public screeners and official sources without unavailable licensed-data notices", async () => {
  const [html, detail] = await Promise.all([
    readFile(new URL("bonds.html", root), "utf8"),
    readFile(new URL("assets/bond-detail-page.js", root), "utf8"),
  ]);
  assert.match(html, /id="bond-public-screener"/);
  for (const label of ["資料來源與授權範圍", "TPEx 可轉債每日成交資訊", "TPEx 可轉債公開清單"]) {
    assert.match(detail, new RegExp(label));
  }
  assert.doesNotMatch(html + detail, /CBAS 權利金|TCRI 信用評等|未納入公開資料快照|資料品質|待補／待確認/);
});

test("page loader projects archived workbench identities into the searchable list by exact bond code", async () => {
  const { buildBondListRecords } = await import("../static-showcase/assets/bonds-page.js");
  const records = buildBondListRecords({
    views: [{ bondCode: "90001", issuerCode: "9000", bondName: "舊名稱", cbClose: "101" }],
    workbench: [
      {
        bondCode: "90001",
        status: "archived",
        archiveReason: "matured",
        archivedAt: "2026-08-12",
        term: { bondCode: "90001", issuerCode: "9000", issuerName: "公開發行人", bondName: "封存一" },
        view: { bondCode: "90001", issuerCode: "9000", bondName: "封存一", cbClose: "101" },
      },
      {
        bondCode: "90002",
        status: "active",
        archiveReason: null,
        archivedAt: null,
        term: { bondCode: "90002", issuerCode: "9000", issuerName: "公開發行人", bondName: "現行二" },
        view: { bondCode: "90002", issuerCode: "9000", bondName: "現行二", cbClose: null },
      },
    ],
  });

  assert.deepEqual(records.map(({ bondCode, issuerName, archived }) => ({ bondCode, issuerName, archived })), [
    { bondCode: "90001", issuerName: "公開發行人", archived: true },
    { bondCode: "90002", issuerName: "公開發行人", archived: false },
  ]);
});

test("market list projects verified trading and term fields without estimating turnover", async () => {
  const { buildBondListRecords } = await import("../static-showcase/assets/bonds-page.js");
  const [row] = buildBondListRecords({
    workbench: [{
      bondCode: "90001",
      status: "active",
      archiveReason: null,
      archivedAt: null,
      term: {
        bondCode: "90001", issuerCode: "9000", issuerName: "公開發行人", bondName: "公開一",
        issueAmount: "500000000", outstandingAmount: "400000000", outstandingDataDate: "2026-08-24",
        maturityDate: "2028-08-24",
      },
      view: { bondCode: "90001", issuerCode: "9000", bondName: "公開一", cbClose: "101", cbPriceDate: "2026-08-24", cbTradeUnits: "42" },
    }],
    history: [{ bondCode: "90001", date: "2026-08-24", cbTurnover: "4242000" }],
  });

  assert.deepEqual(
    {
      cbTradeUnits: row.cbTradeUnits,
      cbTurnoverAmount: row.cbTurnoverAmount,
      issueAmount: row.issueAmount,
      outstandingAmount: row.outstandingAmount,
      outstandingDataDate: row.outstandingDataDate,
      maturityDate: row.maturityDate,
    },
    {
      cbTradeUnits: "42",
      cbTurnoverAmount: "4242000",
      issueAmount: "500000000",
      outstandingAmount: "400000000",
      outstandingDataDate: "2026-08-24",
      maturityDate: "2028-08-24",
    },
  );
});

test("static CB market table presents all verified market and term columns", async () => {
  const html = await readFile(new URL("bonds.html", root), "utf8");
  for (const label of ["成交量", "成交金額", "流通餘額", "到期日", "發行總額"]) {
    assert.match(html, new RegExp(label));
  }
});

test("bond detail projects the neutral stock-to-conversion relationship only from matched public facts", async () => {
  const { projectCbMarketRelationship } = await import("../static-showcase/assets/bond-detail-page.js");
  assert.deepEqual(
    projectCbMarketRelationship({ stockClose: "110", currentConversionPrice: "100" }),
    { label: "標的股高於轉換價", distancePercent: "10.00%", state: "above" },
  );
  assert.equal(projectCbMarketRelationship({ stockClose: null, currentConversionPrice: "100" }), null);
  assert.equal(projectCbMarketRelationship({ stockClose: "110", currentConversionPrice: "0" }), null);
});

test("static CB detail and issuance pages surface public term facts without diagnostic metadata", async () => {
  const [detail, issuance] = await Promise.all([
    readFile(new URL("assets/bond-detail-page.js", root), "utf8"),
    readFile(new URL("bonds-issuance.html", root), "utf8"),
  ]);
  for (const label of ["承銷機構", "受託人", "最近餘額異動日", "最近餘額異動原因", "標的股相對轉換價"]) {
    assert.match(detail, new RegExp(label));
  }
  for (const label of ["目前進度", "擔保", "承銷機構", "受託人"]) {
    assert.match(issuance, new RegExp(label));
  }
  assert.doesNotMatch(detail + issuance, /來源 ID|缺漏原因|目前無核准公開資料／待確認/);
});

test("detail evidence selects the conversion-price version effective on its valuation date", async () => {
  const { detailWithValuationConversionEvidence } = await import("../static-showcase/assets/bonds-page.js");
  const record = {
    bondCode: "90001",
    view: { valuationDate: "2026-08-12", currentConversionPrice: "31" },
  };
  const enriched = detailWithValuationConversionEvidence(record, [
    { bondCode: "90001", currentConversionPrice: "35", effectiveDate: "2026-07-01" },
    { bondCode: "90001", currentConversionPrice: "31", effectiveDate: "2026-08-13" },
    { bondCode: "90001", currentConversionPrice: "36", effectiveDate: "2026-06-01" },
  ]);
  assert.equal(enriched.view.valuationConversionPrice, "35");
  assert.equal(enriched.view.valuationConversionPriceEffectiveDate, "2026-07-01");
  assert.deepEqual(enriched.view.conversionPriceHistory, [
    { effectiveDate: "2026-06-01", currentConversionPrice: "36" },
    { effectiveDate: "2026-07-01", currentConversionPrice: "35" },
    { effectiveDate: "2026-08-13", currentConversionPrice: "31" },
  ]);
  assert.equal(record.view.valuationConversionPrice, undefined);
});

test("page loader projects legacy market fields into canonical list fields until the next refresh", async () => {
  const { buildBondListRecords } = await import("../static-showcase/assets/bonds-page.js");
  const [record] = buildBondListRecords({
    views: [{
      bondCode: "90001",
      issuerCode: "9000",
      bondName: "舊格式一",
      cbClose: "101",
      missingReasons: [],
      outstandingReductionRate: "17.93",
      nextPutDate: "2027-09-21",
      daysToNextPut: 394,
      maturityDate: "2028-12-18",
      daysToMaturity: 848,
    }],
  });

  assert.deepEqual({
    remainingRatio: record.remainingRatio,
    nextEventType: record.nextEventType,
    nextEventDate: record.nextEventDate,
    daysToNextEvent: record.daysToNextEvent,
    dataQuality: record.dataQuality,
    marketStatus: record.marketStatus,
  }, {
    remainingRatio: "82.07",
    nextEventType: "put",
    nextEventDate: "2027-09-21",
    daysToNextEvent: 394,
    dataQuality: "complete",
    marketStatus: "ACTIVE",
  });
});

test("page loader preserves explicit canonical event nulls while filling only absent legacy fields", async () => {
  const { buildBondListRecords } = await import("../static-showcase/assets/bonds-page.js");
  const [record] = buildBondListRecords({
    views: [{
      bondCode: "90002",
      issuerCode: "9000",
      bondName: "混合格式二",
      nextEventType: null,
      nextPutDate: "2027-09-21",
      daysToNextPut: 394,
      maturityDate: "2028-12-18",
      daysToMaturity: 848,
    }],
  });

  assert.deepEqual({
    nextEventType: record.nextEventType,
    nextEventDate: record.nextEventDate,
    daysToNextEvent: record.daysToNextEvent,
  }, {
    nextEventType: null,
    nextEventDate: "2027-09-21",
    daysToNextEvent: 394,
  });
});

test("bond list presentation uses remaining ratio and canonical redemption event fields", async () => {
  const { bondListPresentation, bondMarketStatusPresentation } = await import("../static-showcase/assets/bonds-page.js");
  assert.deepEqual(bondListPresentation({
    remainingRatio: "82.07",
    nextEventType: "redemption",
    nextEventDate: "2026-09-21",
    daysToNextEvent: 53,
  }), {
    remainingRatio: "82.07%",
    eventLabel: "贖回 53 天",
    eventDate: "2026-09-21",
  });
  assert.equal(bondMarketStatusPresentation({ marketStatus: "REDEMPTION_PROCESS" }), "贖回程序");
  assert.equal(bondMarketStatusPresentation({ marketStatus: "DATA_CONFLICT" }), "");
});

test("public CB list uses plain dashes for unavailable values and labels earlier official closes", async () => {
  const js = await readFile(new URL("assets/bonds-page.js", root), "utf8");
  assert.match(js, /前次成交/);
  assert.doesNotMatch(js, /資料暫缺|尚無可用 CB 收盤|CB 與股票沒有共同估值日/);
  const { bondListPresentation } = await import("../static-showcase/assets/bonds-page.js");
  assert.deepEqual(bondListPresentation({ remainingRatio: null, nextEventType: null, nextEventDate: null }), {
    remainingRatio: "—",
    eventLabel: "—",
    eventDate: "—",
  });
});

test("detail disclosures align with the 900px CSS breakpoint and initialize the selected desktop tab only", async () => {
  const { syncBondDetailDisclosureMode } = await import("../static-showcase/assets/bond-detail-page.js");
  const disclosures = [{ open: false }, { open: true }];
  const panels = [
    { dataset: { detailPanel: "overview" }, hidden: true },
    { dataset: { detailPanel: "terms" }, hidden: false },
  ];
  const target = {
    querySelector(selector) {
      assert.equal(selector, "[data-detail-tab][aria-selected=\"true\"]");
      return { dataset: { detailTab: "overview" } };
    },
    querySelectorAll(selector) {
      if (selector === ".detail-mobile-area") return disclosures;
      if (selector === "[data-detail-panel]") return panels;
      assert.fail(`unexpected selector: ${selector}`);
    },
  };

  syncBondDetailDisclosureMode(target, { compact: false });
  assert.deepEqual(disclosures.map(({ open }) => open), [true, true]);
  assert.deepEqual(panels.map(({ hidden }) => hidden), [false, true]);

  syncBondDetailDisclosureMode(target, { compact: true });
  assert.deepEqual(disclosures.map(({ open }) => open), [false, false]);
  assert.deepEqual(panels.map(({ hidden }) => hidden), [false, false]);

  const [page, detail] = await Promise.all([
    readFile(new URL("assets/bonds-page.js", root), "utf8"),
    readFile(new URL("assets/bond-detail-page.js", root), "utf8"),
  ]);
  assert.match(detail, /matchMedia\?\.\("\(max-width: 900px\)"\)/);
  assert.doesNotMatch(page, /max-width: 760px/);
});

test("detail close button handles Enter as one keyboard activation", async () => {
  const { bindBondDetail } = await import("../static-showcase/assets/bond-detail-page.js");
  const listeners = new Map();
  const closeButton = {
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const target = {
    querySelector(selector) {
      if (selector === "[data-detail-close]") return closeButton;
      return null;
    },
    querySelectorAll() { return []; },
  };
  let closeCount = 0;
  bindBondDetail(target, () => { closeCount += 1; });
  let prevented = false;

  listeners.get("keydown")({
    key: "Enter",
    preventDefault() { prevented = true; },
  });

  assert.equal(prevented, true);
  assert.equal(closeCount, 1);
});

test("mobile bond cards keep public market fields without archive diagnostics", async () => {
  const js = await readFile(new URL("assets/bonds-page.js", root), "utf8");
  const card = js.slice(js.indexOf("function renderBondCard"), js.indexOf("function bindBondOpeners"));
  for (const label of ["CB 收盤", "轉換價值", "轉換溢價率", "標的股收盤", "目前轉換價", "流通餘額比例", "下一事件", "資料日期"]) {
    assert.match(card, new RegExp(label));
  }
  assert.doesNotMatch(card, /archiveReason|archiveDate|archivedAt|資料品質/);
});
