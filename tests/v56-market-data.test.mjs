import assert from "node:assert/strict";
import test from "node:test";

import {
  buildV56MarketData,
  displayFinancialValue,
} from "../static-showcase/assets/v56-market-data.js";

const manifest = Object.freeze({
  market: { dataDate: "2026-08-28", generatedAt: "2026-08-28T16:30:00+08:00" },
});

const masters = Object.freeze({
  companyMaster: [{
    stockCode: "2303",
    companyName: "聯電",
    market: "上市",
    industry: "半導體業",
    cbCodes: ["23032"],
    cbNames: ["聯電二"],
  }],
  cbMaster: [{
    bondCode: "23032",
    bondName: "聯電二",
    stockCode: "2303",
    companyName: "聯電",
    market: "上市",
  }],
  searchIndex: [{ id: "cb:23032", type: "cb", cbCode: "23032", stockCode: "2303" }],
});

const workbench = Object.freeze({ records: [{
  bondCode: "23032",
  status: "active",
  term: {
    bondCode: "23032",
    bondName: "聯電二",
    issuerCode: "2303",
    issuerName: "聯電",
    currentConversionPrice: null,
    issueDate: "2026-08-20",
    maturityDate: "2031-08-20",
  },
  view: { cbClose: "101.5", currentConversionPrice: null },
  events: [],
}] });

test("V5.6 model preserves missing values and emits a canonical stock-to-CB relation", () => {
  const model = buildV56MarketData({
    manifest,
    masters,
    history: [],
    workbench,
    emerging: { records: [] },
    ipo: { records: [] },
    rightsEvents: { events: [] },
    previous: null,
  });

  assert.equal(model.schemaVersion, 3);
  assert.equal(model.dataDate, "2026-08-28");
  assert.equal(model.cbMaster.records[0].currentConversionPrice, null);
  assert.deepEqual(model.securityMaster.records[0].relatedCbCodes, ["23032"]);
  assert.equal(model.searchIndex.records[0].cbCode, "23032");
  assert.equal(model.searchIndex.records[0].url, "./bonds.html?bond=23032");
  assert.equal(displayFinancialValue(null, "undetermined"), "待定");
  assert.equal(displayFinancialValue(null, "no_trade"), "今日無成交");
  assert.equal(displayFinancialValue(0, "numeric"), "0");
});

test("V5.6 model retains published emerging ranking fields without raw source metadata", () => {
  const model = buildV56MarketData({
    manifest,
    masters,
    history: [],
    workbench,
    emerging: { records: [{
      companyCode: "7777", companyName: "測試興櫃", industryName: "半導體業", tradingDate: "2026-08-28",
      dailyAveragePrice: "102", previousAveragePrice: "100", dailyHighPrice: "103", dailyLowPrice: "99",
      averageChange: "2", averageChangePercent: "2", direction: "up", transactionVolume: "150", estimatedTransactionAmount: "15300",
      applyingDate: null, applyingStatus: null, rawSourceId: "do-not-publish",
    }] },
    ipo: { records: [] },
    rightsEvents: { events: [] },
  });
  assert.deepEqual(model.emerging.records[0], {
    stockCode: "7777", companyName: "測試興櫃", industryName: "半導體業", tradingDate: "2026-08-28",
    dailyAveragePrice: 102, previousAveragePrice: 100, dailyHighPrice: 103, dailyLowPrice: 99,
    averageChange: 2, averageChangePercent: 2, direction: "up", dailyVolume: 150, transactionAmount: 15300,
    applyingDate: null, applyingStatus: null, dataDate: "2026-08-28",
  });
});

test("V5.6 IPO pipeline retains only verified public milestone facts and no source identifiers", () => {
  const model = buildV56MarketData({
    manifest,
    masters,
    history: [],
    workbench,
    emerging: { records: [] },
    ipo: { records: [{
      companyCode: "3313", companyName: "斐成", market: "上市", stage: "C", exceptionStatus: null,
      applicationDate: "2026-07-01", reviewDate: "2026-07-20", boardDate: null, contractDate: null, listingDate: null,
      finalUnderwritingPrice: null,
      events: [{ date: "2026-09-02", kind: "review_completed", label: "審議完成", sourceRecordIds: ["private"] }],
    }] },
    rightsEvents: { events: [] },
  });
  assert.deepEqual(model.ipoPipeline.records[0].events, [{ date: "2026-09-02", kind: "review_completed", label: "審議完成", verified: true }]);
  assert.equal(model.ipoPipeline.records[0].exceptionStatus, null);
  assert.doesNotMatch(JSON.stringify(model.ipoPipeline), /sourceRecordId|sourceId|rawTextHash/);
});

test("V5.6 IPO pipeline preserves verified auction and subscription facts for the offering desk", () => {
  const model = buildV56MarketData({
    manifest,
    masters,
    history: [],
    workbench,
    emerging: { records: [] },
    ipo: { records: [{
      companyCode: "7825", companyName: "和亞智慧", market: "興櫃", stage: "D", exceptionStatus: null,
      applicationDate: "2026-06-01", reviewDate: null, boardDate: null, contractDate: "2026-08-01", listingDate: "2026-09-10",
      provisionalUnderwritingPrice: "52", finalUnderwritingPrice: "56", underwriter: "測試承銷商",
      auction: {
        bidStartDate: "2026-08-26", bidEndDate: "2026-08-28", auctionOpenDate: "2026-09-01", listingDate: "2026-09-10",
        minimumBidPrice: "50", finalUnderwritingPrice: "56", verified: true, sourceRecordId: "private",
      },
      publicOffering: {
        subscriptionStartDate: "2026-08-31", subscriptionEndDate: "2026-09-02", drawDate: "2026-09-03", listingDate: "2026-09-10",
        provisionalUnderwritingPrice: "52", finalUnderwritingPrice: "56", verified: true, sourceRecordId: "private",
      },
      events: [],
    }] },
    rightsEvents: { events: [] },
  });

  assert.deepEqual(model.ipoPipeline.records[0].auction, {
    bidStartDate: "2026-08-26", bidEndDate: "2026-08-28", auctionOpenDate: "2026-09-01", listingDate: "2026-09-10",
    minimumBidPrice: 50, finalUnderwritingPrice: 56, verified: true,
  });
  assert.deepEqual(model.ipoPipeline.records[0].publicOffering, {
    subscriptionStartDate: "2026-08-31", subscriptionEndDate: "2026-09-02", drawDate: "2026-09-03", listingDate: "2026-09-10",
    provisionalUnderwritingPrice: 52, finalUnderwritingPrice: 56, verified: true,
  });
  assert.equal(model.ipoPipeline.records[0].underwriter, "測試承銷商");
  assert.doesNotMatch(JSON.stringify(model.ipoPipeline.records[0]), /sourceRecordId|sourceId/);
});

test("V5.6 CB event feed projects official lifecycle events without internal source fields", () => {
  const model = buildV56MarketData({
    manifest,
    masters,
    history: [],
    workbench: {
      records: [{
        ...workbench.records[0],
        events: [{
          eventId: "11406:put:2027-12-10",
          type: "put",
          date: "2027-12-10",
          title: "聯電二賣回權日期",
          sourceId: "11406",
          sourceUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
        }],
      }],
    },
    emerging: { records: [] },
    ipo: { records: [] },
    rightsEvents: { events: [] },
  });
  assert.deepEqual(model.cbEvents.records, [{
    eventId: "cb:23032:put:2027-12-10",
    eventType: "put",
    cbCode: "23032",
    stockCode: "2303",
    announcementDate: "2027-12-10",
    startDate: null,
    endDate: null,
    deadlineDate: "2027-12-10",
    effectiveDate: "2027-12-10",
    title: "聯電二賣回權日期",
    status: "upcoming",
    dataDate: "2026-08-28",
  }]);
  assert.doesNotMatch(JSON.stringify(model.cbEvents), /sourceId|sourceUrl|rawTextHash/);
});

test("V5.6 model rejects mismatched company and CB identities instead of joining by name", () => {
  assert.throws(() => buildV56MarketData({
    manifest,
    masters: { ...masters, cbMaster: [{ ...masters.cbMaster[0], stockCode: "3313" }] },
    history: [],
    workbench,
    emerging: { records: [] },
    ipo: { records: [] },
    rightsEvents: { events: [] },
    previous: null,
  }), /CB identity/i);
});
