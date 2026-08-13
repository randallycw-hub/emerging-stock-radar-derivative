import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBondWorkbenchSnapshot,
  parseBondWorkbenchSnapshot,
} from "../lib/market-data/bond-workbench.ts";
import { evaluateBondAssessment } from "../lib/market-data/bond-strategy-assessment.ts";
import { bondTermSummariesFrom11406Rows } from "../scripts/lib/bond-inputs-from-11406.mjs";

const generatedAt = "2026-08-13T01:00:00.000Z";
const dataDate = "2026-08-12";
const asOfDate = "2026-08-13";

function term(bondCode = "35221", patch = {}) {
  return {
    bondCode,
    issuerCode: "3522",
    bondName: "御嵿一",
    issuerName: "御嵿",
    issueDate: "2023-12-18",
    listingDate: "2023-12-18",
    maturityDate: "2028-07-29",
    issueAmount: "500000000",
    outstandingAmount: "400000000",
    outstandingDataDate: dataDate,
    initialConversionPrice: "40",
    conversionStartDate: "2024-03-19",
    conversionEndDate: "2028-07-29",
    putDates: ["2027-08-30"],
    putPrice: "101",
    securedStatus: "無擔保",
    underwriter: "兆豐證券",
    trustee: "彰化銀行",
    unitFaceValueTwd: null,
    ...patch,
  };
}

function view(bondCode = "35221", patch = {}) {
  return {
    bondCode,
    issuerCode: "3522",
    bondName: "御嵿一",
    issuerResearch: null,
    cbClose: "103.5",
    cbPriceDate: dataDate,
    cbTradeUnits: "10",
    stockClose: "38.25",
    stockPriceDate: dataDate,
    currentConversionPrice: "35.1",
    conversionPriceEffectiveDate: "2025-11-09",
    valuationDate: dataDate,
    valuationCbClose: "103.5",
    valuationStockClose: "38.25",
    conversionValue: "108.97",
    premiumRate: "-5.02",
    outstandingAmount: "400000000",
    outstandingDataDate: dataDate,
    outstandingReductionRate: "20",
    remainingUnits: "4000",
    remainingRatio: "80",
    dailyTurnoverRate: "0.25",
    institutionDataDate: null,
    institutionNetUnits: null,
    institutionNet5dUnits: null,
    institutionNet20dUnits: null,
    redemptionEvent: null,
    maturityDate: "2028-07-29",
    daysToMaturity: 715,
    nextPutDate: "2027-08-30",
    daysToNextPut: 382,
    nextEventType: "put",
    nextEventDate: "2027-08-30",
    daysToNextEvent: 382,
    dataQuality: "partial",
    staleCbPrice: false,
    missingReasons: [],
    ...patch,
  };
}

function input(patch = {}) {
  return {
    generatedAt,
    dataDate,
    asOfDate,
    currentTerms: [term()],
    currentViews: [view()],
    currentEvents: [],
    ...patch,
  };
}

function event(bondCode, eventId = "put-1", patch = {}) {
  return {
    bondCode,
    eventId,
    type: "put",
    date: "2027-08-30",
    title: "賣回權日",
    sourceId: "11406",
    sourceUrl: null,
    ...patch,
  };
}

function redemptionEvent(patch = {}) {
  return {
    issuerCode: "3522",
    issuerName: "御嵿",
    bondCode: "35221",
    bondName: "御嵿一",
    announcementDate: "2026-08-01",
    delistingDate: asOfDate,
    subject: "公告御嵿股份有限公司國內轉換公司債(簡稱：御嵿一，代碼：35221)發行公司行使債券贖回權暨訂於115年08月13日終止櫃檯買賣等相關事宜。",
    detailUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3522&date1=20260801&seq_no=1&pub_class=0&firstin=1",
    ...patch,
  };
}

test("builds a sorted, defensive active snapshot keyed only by bond code", () => {
  const result = buildBondWorkbenchSnapshot(input({
    currentTerms: [term("35222"), term("35221")],
    currentViews: [view("35222"), view("35221")],
  }));

  assert.deepEqual(result.records.map((record) => record.bondCode), ["35221", "35222"]);
  assert.deepEqual(result.records.map((record) => record.status), ["active", "active"]);
  assert.equal(result.records[0].fieldStates.price, "complete");
  assert.equal(result.records[0].fieldStates.history, "accumulating");
  assert.equal(result.records[0].assessment.dimensions.length, 6);
  assert.equal(result.records[0].assessment.strategies.length, 6);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.records));
  assert.ok(Object.isFrozen(result.records[0].term));
  assert.throws(() => { result.records[0].term.bondName = "mutated"; }, TypeError);
});

test("preserves a supplied strict assessment and rejects unmarked cross-date strategy checks", () => {
  const verified = evaluateBondAssessment({
    view: view(), history: [], spreadPercent: "0.8", spreadDataDate: dataDate,
    borrowability: "available", conversionSuspended: false,
    publicFinancials: { ttmProfitState: "unknown", revenueTrendState: "unknown", psPercentile: null, dataDate: null },
  });
  const result = buildBondWorkbenchSnapshot(input({
    currentAssessments: [{ bondCode: "35221", assessment: verified }],
  }));
  assert.deepEqual(result.records[0].assessment, verified);

  const invalid = structuredClone(verified);
  const equivalentSpread = invalid.strategies
    .find((item) => item.code === "stock_equivalent")
    .checks.find((item) => item.code === "spread_percent");
  equivalentSpread.dataDate = "2026-08-11";
  equivalentSpread.state = "met";
  equivalentSpread.missingReason = null;
  assert.throws(
    () => buildBondWorkbenchSnapshot(input({
      currentAssessments: [{ bondCode: "35221", assessment: invalid }],
    })),
    /DATE_MISMATCH|assessment/i,
  );
});

test("archives by verified redemption, maturity, zero balance, then complete roster removal", () => {
  const previous = buildBondWorkbenchSnapshot(input({
    currentTerms: [term("35221"), term("35222"), term("35223"), term("35224")],
    currentViews: [
      view("35221", { redemptionEvent: redemptionEvent() }),
      view("35222"),
      view("35223"),
      view("35224"),
    ],
  }));
  const result = buildBondWorkbenchSnapshot(input({
    previous,
    currentTerms: [
      term("35221"),
      term("35222", { maturityDate: "2026-08-12" }),
      term("35223", { outstandingAmount: "0" }),
    ],
    currentViews: [
      view("35221", { redemptionEvent: redemptionEvent() }),
      view("35222", { maturityDate: "2026-08-12" }),
      view("35223", { outstandingAmount: "0" }),
    ],
  }));

  assert.deepEqual(result.records.map(({ bondCode, archiveReason }) => [bondCode, archiveReason]), [
    ["35221", "redeemed"],
    ["35222", "matured"],
    ["35223", "balance_exhausted"],
    ["35224", "removed_from_official_roster"],
  ]);
  assert.ok(result.records.every((record) => record.status === "archived"));
});

test("rejects forged redemption evidence before it can archive a workbench record", async (t) => {
  for (const [name, patch] of [
    ["host", { detailUrl: redemptionEvent().detailUrl.replace("mopsov.twse.com.tw", "forged.example") }],
    ["path", { detailUrl: redemptionEvent().detailUrl.replace("ajax_t120sb23", "forged") }],
    ["query", { detailUrl: redemptionEvent().detailUrl.replace("co_id=3522", "co_id=9999") }],
    ["subject", { subject: redemptionEvent().subject.replace("御嵿一", "偽造一") }],
  ]) {
    await t.test(name, () => {
      assert.throws(
        () => buildBondWorkbenchSnapshot(input({
          currentViews: [view("35221", { redemptionEvent: redemptionEvent(patch) })],
        })),
        /redemption|detailUrl|subject/i,
      );
    });
  }
});

test("archives every canonical decimal spelling of a zero outstanding balance", async (t) => {
  for (const zero of ["0", "0.0", "0.00"]) {
    await t.test(zero, () => {
      const snapshot = buildBondWorkbenchSnapshot(input({
        currentTerms: [term("35221", { outstandingAmount: zero })],
        currentViews: [view("35221", { outstandingAmount: zero })],
      }));
      assert.equal(snapshot.records[0].archiveReason, "balance_exhausted");
    });
  }
});

test("keeps archived records archived and does not archive a zero-trade active record", () => {
  const archived = buildBondWorkbenchSnapshot(input({
    currentTerms: [term()],
    currentViews: [view("35221", { outstandingAmount: "0" })],
  }));
  const result = buildBondWorkbenchSnapshot(input({
    previous: archived,
    currentViews: [view("35221", { cbTradeUnits: "0", outstandingAmount: "400000000" })],
  }));
  assert.equal(result.records[0].status, "archived");
  assert.equal(result.records[0].archiveReason, "balance_exhausted");
});

test("fails closed for duplicates, malformed previous snapshots, and hidden, symbol, or sparse schema drift", () => {
  assert.throws(() => buildBondWorkbenchSnapshot(input({ currentTerms: [term(), term()] })), /duplicate bond code/i);
  assert.doesNotThrow(() => buildBondWorkbenchSnapshot(input({
    currentTerms: [term("35221"), term("123456")],
    currentViews: [view("35221"), view("123456")],
  })));
  assert.throws(() => buildBondWorkbenchSnapshot(input({ previous: { schemaVersion: 2 } })), /verified contract/i);

  const malformed = structuredClone(buildBondWorkbenchSnapshot(input()));
  Object.defineProperty(malformed.records[0], "hidden", { value: true });
  assert.throws(() => parseBondWorkbenchSnapshot(malformed), /keys/i);
  const symbolic = structuredClone(buildBondWorkbenchSnapshot(input()));
  symbolic.records[0][Symbol("drift")] = true;
  assert.throws(() => parseBondWorkbenchSnapshot(symbolic), /keys/i);
  const sparse = structuredClone(buildBondWorkbenchSnapshot(input()));
  sparse.records.length = 2;
  assert.throws(() => parseBondWorkbenchSnapshot(sparse), /dense array/i);
});

test("rejects a malformed previous snapshot before it can be merged", () => {
  const previous = structuredClone(buildBondWorkbenchSnapshot(input()));
  previous.records[0].term.putDates[0] = "not-a-date";
  assert.throws(
    () => buildBondWorkbenchSnapshot(input({ previous })),
    /putDates/i,
  );
});

test("uses the full strict BondMarketView parser before accepting current or previous records", async (t) => {
  const invalidFields = [
    ["bondCode", "bad"], ["issuerCode", ""], ["bondName", ""],
    ["cbClose", {}], ["cbPriceDate", "2026-02-30"], ["cbTradeUnits", "-1"],
    ["stockClose", {}], ["stockPriceDate", "2026-02-30"],
    ["currentConversionPrice", {}], ["conversionPriceEffectiveDate", "2026-02-30"],
    ["valuationDate", "2026-02-30"], ["valuationCbClose", {}],
    ["valuationStockClose", {}], ["conversionValue", {}], ["premiumRate", { unexpected: true }],
    ["outstandingAmount", {}], ["outstandingDataDate", "2026-02-30"],
    ["outstandingReductionRate", {}], ["remainingUnits", {}], ["remainingRatio", {}],
    ["dailyTurnoverRate", {}], ["institutionDataDate", "2026-02-30"],
    ["institutionNetUnits", {}], ["institutionNet5dUnits", {}], ["institutionNet20dUnits", {}],
    ["redemptionEvent", {}], ["maturityDate", "2026-02-30"], ["daysToMaturity", 1.5],
    ["nextPutDate", "2026-02-30"], ["daysToNextPut", 1.5], ["nextEventType", "unknown"],
    ["nextEventDate", "2026-02-30"], ["daysToNextEvent", 1.5], ["dataQuality", "unknown"],
    ["staleCbPrice", "false"], ["missingReasons", [1]],
  ];
  for (const [field, value] of invalidFields) {
    await t.test(field, () => {
      assert.throws(
        () => buildBondWorkbenchSnapshot(input({ currentViews: [view("35221", { [field]: value })] })),
        /current view/i,
      );
    });
  }
  for (const [name, value] of [
    ["issuer research", { market: "otc" }],
    ["issuer research decimal", {
      market: "otc", industryName: "資訊服務", revenueMonth: "2026-07",
      sourcePublishedOn: "2026-08-08", revenueUnit: "仟元", currentMonthRevenue: {},
      monthOverMonthPercent: null, yearOverYearPercent: null, cumulativeRevenue: null,
      cumulativeYearOverYearPercent: null,
    }],
    ["redemption event", {
      issuerCode: "3522", issuerName: "御嵿", bondCode: "35221", bondName: "御嵿一",
      announcementDate: "2026-08-01", delistingDate: "2026-08-12", subject: "公告",
      detailUrl: {},
    }],
  ]) {
    await t.test(name, () => {
      assert.throws(
        () => buildBondWorkbenchSnapshot(input({ currentViews: [view("35221", { issuerResearch: name.startsWith("issuer") ? value : null, redemptionEvent: name === "redemption event" ? value : null })] })),
        /current view/i,
      );
    });
  }
  assert.throws(
    () => buildBondWorkbenchSnapshot(input({
      currentViews: [view("35221", { redemptionEvent: redemptionEvent({
        bondCode: "35222",
        bondName: "御嵿二",
        subject: "公告御嵿股份有限公司國內轉換公司債(簡稱：御嵿二，代碼：35222)發行公司行使債券贖回權暨訂於115年08月13日終止櫃檯買賣等相關事宜。",
      }) })],
    })),
    /redemptionEvent\.bondCode does not match view/i,
  );
  const previous = structuredClone(buildBondWorkbenchSnapshot(input()));
  previous.records[0].view.premiumRate = { unexpected: true };
  assert.throws(() => buildBondWorkbenchSnapshot(input({ previous })), /bond workbench record 0\.view\.premiumRate/i);
});

test("accepts 11406 term projections through the strict workbench term parser", () => {
  const terms = bondTermSummariesFrom11406Rows([{
    債券代碼: "35221", 機構代碼: "3522", 機構名稱: "御嵿", 債券簡稱: "御嵿一",
    到期日期: "1170729", 發行總額: "2000000", 目前餘額: "1500000", 賣回權日期: "",
  }]);
  assert.doesNotThrow(() => buildBondWorkbenchSnapshot(input({ currentTerms: terms })));
});

test("joins workbench events to only their exact bond code", () => {
  const snapshot = buildBondWorkbenchSnapshot(input({
    currentTerms: [term("35221"), term("35222")],
    currentViews: [view("35221"), view("35222")],
    currentEvents: [event("35221"), event("35222", "listing-1", { type: "listing" })],
  }));
  assert.deepEqual(snapshot.records.map((record) => record.events.map((item) => item.eventId)), [
    ["put-1"],
    ["listing-1"],
  ]);
});

test("fails closed for an event without a current bond and conflicting duplicate event ids", () => {
  assert.throws(
    () => buildBondWorkbenchSnapshot(input({ currentEvents: [event("99999")] })),
    /unknown bond code/i,
  );
  assert.throws(
    () => buildBondWorkbenchSnapshot(input({ currentEvents: [
      event("35221"),
      event("35221", "put-1", { title: "conflict" }),
    ] })),
    /duplicate bond workbench event/i,
  );
});
