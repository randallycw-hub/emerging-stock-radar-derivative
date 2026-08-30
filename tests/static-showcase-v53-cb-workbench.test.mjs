import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCbWorkbenchV53,
  selectV53QaSamples,
  validateCbWorkbenchV53,
} from "../static-showcase/assets/cb-workbench-v53.js";

const OFFICIAL_11406 = "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv";

function record({
  bondCode = "90001",
  issuerCode = "9000",
  cbPriceDate = "2026-08-28",
  stockPriceDate = "2026-08-28",
  cbTradeUnits = "20",
  cbClose = "110",
  stockClose = "120",
  conversionPrice = "100",
} = {}) {
  return {
    bondCode,
    status: "active",
    archiveReason: null,
    archivedAt: null,
    term: {
      bondCode,
      issuerCode,
      bondName: "測試一",
      issuerName: "測試公司",
      issueDate: "2025-08-28",
      listingDate: "2025-08-28",
      maturityDate: "2028-08-28",
      issueAmount: "500000000",
      outstandingAmount: "400000000",
      outstandingDataDate: "2026-08-28",
      securedStatus: "2",
      underwriter: "測試承銷商",
      putDates: ["2027-08-28"],
      putPrice: "100",
    },
    view: {
      bondCode,
      issuerCode,
      bondName: "測試一",
      cbClose,
      cbPriceDate,
      cbTradeUnits,
      stockClose,
      stockPriceDate,
      currentConversionPrice: conversionPrice,
      conversionPriceEffectiveDate: "2026-07-01",
      maturityDate: "2028-08-28",
      daysToMaturity: 730,
      marketStatus: cbTradeUnits === "0" ? "NO_TRADE" : "ACTIVE",
    },
    events: [
      {
        bondCode,
        eventId: `11406:listing:${bondCode}`,
        type: "listing",
        date: "2025-08-28",
        title: "測試一掛牌日",
        sourceId: "11406",
        sourceUrl: OFFICIAL_11406,
      },
      {
        bondCode,
        eventId: `11406:maturity:${bondCode}`,
        type: "maturity",
        date: "2028-08-28",
        title: "測試一到期日",
        sourceId: "11406",
        sourceUrl: OFFICIAL_11406,
      },
    ],
  };
}

function buildModel(records, history = []) {
  return buildCbWorkbenchV53({
    workbench: { schemaVersion: 1, dataDate: "2026-08-28", records },
    history,
    cbMaster: records.map((item) => ({
      bondCode: item.bondCode,
      bondName: item.term.bondName,
      stockCode: item.term.issuerCode,
      companyName: item.term.issuerName,
      market: "上市",
      dataDate: "2026-08-28",
    })),
    companyMaster: records.map((item) => ({
      stockCode: item.term.issuerCode,
      companyName: item.term.issuerName,
      market: "上市",
      industry: "測試業",
      dataDate: "2026-08-28",
    })),
  });
}

test("V5.3 read model computes conversion facts only from a same-date public quote", () => {
  const sameDay = buildModel([record()]);
  const crossDay = buildModel([record({ stockPriceDate: "2026-08-27" })]);

  assert.equal(sameDay.records[0].quote.conversionValue, 120);
  assert.equal(sameDay.records[0].quote.premiumRate, -8.33);
  assert.equal(crossDay.records[0].quote.conversionValue, null);
  assert.equal(crossDay.records[0].quote.premiumRate, null);
});

test("V5.3 read model retains official event URLs and leaves unknown issuance stages unpublished", () => {
  const model = buildModel([record()]);

  assert.deepEqual(model.events.map((event) => ({ type: event.type, sourceUrl: event.sourceUrl })), [
    { type: "listing", sourceUrl: OFFICIAL_11406 },
    { type: "maturity", sourceUrl: OFFICIAL_11406 },
  ]);
  assert.deepEqual(model.issuance[0].stages, {
    announcementDate: null,
    filingDate: null,
    effectiveDate: null,
    auctionOrBookbuildingDate: null,
    pricingDate: null,
    listingDate: "2025-08-28",
    asoDate: null,
  });
  assert.deepEqual(model.issuance[0].terms, {
    issueDate: "2025-08-28",
    maturityDate: "2028-08-28",
    issueAmount: 500000000,
    securedStatus: "無擔保",
    underwriter: "測試承銷商",
  });
});

test("V5.3 market summary preserves official zero-trade state instead of collapsing unavailable data to zero", () => {
  const model = buildModel([
    record({ bondCode: "90001", cbTradeUnits: "0", cbClose: null, stockClose: null, conversionPrice: null }),
    record({ bondCode: "90002", issuerCode: "9001", cbTradeUnits: null, cbClose: null, stockClose: null, conversionPrice: null }),
  ]);

  assert.equal(model.summary.activeCount, 2);
  assert.equal(model.summary.tradedCount, null);
  assert.equal(model.summary.turnoverAmount, null);
  assert.equal(model.records[0].quote.tradeState, "no_trade");
  assert.equal(model.records[1].quote.tradeState, "unavailable");
});

test("V5.3 market summary never labels trading units as turnover amount", () => {
  const model = buildModel([record()], [
    { bondCode: "90001", date: "2026-08-28", cbTradingUnits: "20", cbTurnover: "22000" },
  ]);

  assert.equal(model.records[0].liquidity.weekVolume, 20);
  assert.equal(model.records[0].liquidity.weekTurnover, 22000);
  assert.equal(model.summary.weekTurnoverAmount, 22000);
});

test("V5.3 QA selection covers up to twenty active CBs and only official event samples", () => {
  const records = Array.from({ length: 24 }, (_, index) => record({
    bondCode: `9${String(index).padStart(4, "0")}`,
    issuerCode: String(9000 + index),
  }));
  const model = buildModel(records);
  const samples = selectV53QaSamples(model);

  assert.equal(samples.active.length, 20);
  assert.equal(samples.issuance.length, 5);
  assert.equal(samples.events.length, 5);
  assert.ok(samples.events.every((event) => new URL(event.sourceUrl).host === "www.tpex.org.tw"));
});

test("V5.3 validation rejects an active-code collision before a snapshot can publish", () => {
  const model = buildModel([record()]);
  const invalid = structuredClone(model);
  invalid.records.push(structuredClone(invalid.records[0]));

  assert.throws(() => validateCbWorkbenchV53(invalid), /active CB codes must be unique/);
});
