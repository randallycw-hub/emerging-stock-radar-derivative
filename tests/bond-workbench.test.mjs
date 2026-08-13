import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBondWorkbenchSnapshot,
  parseBondWorkbenchSnapshot,
} from "../lib/market-data/bond-workbench.ts";

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

test("builds a sorted, defensive active snapshot keyed only by bond code", () => {
  const result = buildBondWorkbenchSnapshot(input({
    currentTerms: [term("35222"), term("35221")],
    currentViews: [view("35222"), view("35221")],
  }));

  assert.deepEqual(result.records.map((record) => record.bondCode), ["35221", "35222"]);
  assert.deepEqual(result.records.map((record) => record.status), ["active", "active"]);
  assert.equal(result.records[0].fieldStates.price, "complete");
  assert.equal(result.records[0].fieldStates.history, "accumulating");
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.records));
  assert.ok(Object.isFrozen(result.records[0].term));
  assert.throws(() => { result.records[0].term.bondName = "mutated"; }, TypeError);
});

test("archives by verified redemption, maturity, zero balance, then complete roster removal", () => {
  const previous = buildBondWorkbenchSnapshot(input({
    currentTerms: [term("35221"), term("35222"), term("35223"), term("35224")],
    currentViews: [
      view("35221", { redemptionEvent: { delistingDate: asOfDate } }),
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
      view("35221", { redemptionEvent: { delistingDate: asOfDate } }),
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
