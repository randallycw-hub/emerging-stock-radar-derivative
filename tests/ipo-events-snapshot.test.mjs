import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIpoEventSnapshot,
  taipeiCalendarDistance,
} from "../lib/ipo-events/snapshot.ts";

const downloadedAt = "2026-08-01T22:00:00+08:00";
const sha256 = `sha256:${"0".repeat(64)}`;
const sourceManifest = [
  { sourceId: "twse-applications", sourceUrl: "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data", downloadedAt, sha256, rawBytes: 1, rowCount: 1 },
  { sourceId: "tpex-applications", sourceUrl: "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies", downloadedAt, sha256, rawBytes: 1, rowCount: 1 },
  { sourceId: "tpex-ipo-listings", sourceUrl: "https://www.tpex.org.tw/openapi/v1/tpex_ipo_no_limit", downloadedAt, sha256, rawBytes: 1, rowCount: 1 },
  { sourceId: "twse-auctions", sourceUrl: "https://www.twse.com.tw/announcement/auction?response=json&yy=2026", downloadedAt, sha256, rawBytes: 1, rowCount: 1 },
  { sourceId: "twse-public-offerings", sourceUrl: "https://www.twse.com.tw/announcement/publicForm?response=json&yy=2026", downloadedAt, sha256, rawBytes: 1, rowCount: 1 },
];

const application = {
  companyCode: "7819",
  companyName: "測試公司",
  market: "上櫃",
  applicationDate: "2026-04-01",
  reviewDate: "2026-04-30",
  boardDate: "2026-05-07",
  contractDate: "2026-05-10",
  listingDate: "2026-08-05",
  underwriter: "測試承銷商",
  note: "",
  sourceRecordId: "TPEx:7819:2026-04-01",
};

const listing = {
  companyCode: "7819",
  companyName: "測試公司",
  market: "上櫃",
  listingDate: "2026-08-05",
  finalUnderwritingPrice: "50",
  underwriter: "測試承銷商",
  sourceRecordId: "TPEx:ipo-no-limit:7819:2026-08-05",
};

const snapshotInput = (patch = {}) => ({
  twseApplications: [],
  tpexApplications: [application],
  tpexListings: [listing],
  auctions: [],
  publicOfferings: [],
  generatedAt: "2026-08-01T22:30:00+08:00",
  dataDate: "2026-08-01",
  sourceManifest,
  ...patch,
});

test("aggregates a company into sorted, deduplicated official IPO events", () => {
  const snapshot = buildIpoEventSnapshot(snapshotInput());
  const record = snapshot.records.find((row) => row.companyCode === "7819");

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(record.stage, "D");
  assert.equal(record.events.filter((event) => event.kind === "listing_date").length, 1);
  assert.deepEqual(record.events.map((event) => event.kind), [
    "application_submitted",
    "review_completed",
    "board_approved",
    "contract_approved",
    "listing_date",
  ]);
  assert.deepEqual(
    record.events.find((event) => event.kind === "listing_date").sourceRecordIds,
    ["TPEx:7819:2026-04-01", "TPEx:ipo-no-limit:7819:2026-08-05"],
  );
  assert.equal(taipeiCalendarDistance("2026-08-01", "2026-08-05"), 4);
});

test("snapshot construction rejects invalid snapshot dates and incomplete source manifests", () => {
  assert.throws(
    () => buildIpoEventSnapshot(snapshotInput({ dataDate: "zzzz" })),
    /IPO snapshot/,
  );
  assert.throws(
    () => buildIpoEventSnapshot(snapshotInput({ generatedAt: "x" })),
    /IPO snapshot/,
  );
  assert.throws(
    () => buildIpoEventSnapshot(snapshotInput({ sourceManifest: sourceManifest.slice(0, 4) })),
    /IPO snapshot/,
  );
});

test("rejects conflicting verified values instead of choosing a source", () => {
  assert.throws(
    () => buildIpoEventSnapshot(snapshotInput({
      tpexListings: [{ ...listing, listingDate: "2026-08-06" }],
    })),
    /IPO_SOURCE_CONFLICT:listingDate/,
  );
});

test("preserves explicit exception states and null missing underwriting prices", () => {
  const withdrawn = buildIpoEventSnapshot(snapshotInput({
    tpexListings: [],
    tpexApplications: [{ ...application, note: "已撤銷申請" }],
  }));
  const cancelled = buildIpoEventSnapshot(snapshotInput({
    tpexListings: [],
    tpexApplications: [],
    auctions: [{
      companyCode: "7819",
      companyName: "測試公司",
      market: "上櫃",
      bidStartDate: "2026-08-02",
      bidEndDate: "2026-08-03",
      auctionOpenDate: "2026-08-04",
      listingDate: null,
      minimumBidPrice: null,
      finalUnderwritingPrice: null,
      underwriter: "測試承銷商",
      cancelled: true,
      sourceRecordId: "TWSE:auction:7819:2026-08-04",
    }],
  }));

  assert.equal(withdrawn.records[0].stage, "withdrawn");
  assert.equal(cancelled.records[0].stage, "cancelled");
  assert.equal(cancelled.records[0].finalUnderwritingPrice, null);
});

test("does not invent a cancellation event date from an auction or draw date", () => {
  const auction = buildIpoEventSnapshot(snapshotInput({
    tpexListings: [],
    auctions: [{
      companyCode: "7819",
      companyName: "測試公司",
      market: "上櫃",
      bidStartDate: "2026-08-02",
      bidEndDate: "2026-08-03",
      auctionOpenDate: "2026-08-04",
      listingDate: null,
      minimumBidPrice: null,
      finalUnderwritingPrice: null,
      underwriter: "測試承銷商",
      cancelled: true,
      sourceRecordId: "TWSE:auction:7819:2026-08-04",
    }],
  }));
  const publicOffering = buildIpoEventSnapshot(snapshotInput({
    tpexListings: [],
    publicOfferings: [{
      companyCode: "7819",
      companyName: "測試公司",
      market: "上櫃",
      subscriptionStartDate: "2026-08-05",
      subscriptionEndDate: "2026-08-06",
      drawDate: "2026-08-07",
      listingDate: null,
      provisionalUnderwritingPrice: null,
      finalUnderwritingPrice: null,
      underwriter: "測試承銷商",
      cancelled: true,
      sourceRecordId: "TWSE:public:7819:2026-08-07",
    }],
  }));

  assert.equal(auction.records[0].stage, "cancelled");
  assert.equal(publicOffering.records[0].stage, "cancelled");
  assert.equal(auction.records[0].events.some((event) => event.kind === "cancelled"), false);
  assert.equal(publicOffering.records[0].events.some((event) => event.kind === "cancelled"), false);
});

test("does not invent a withdrawal or delay event date from an application date", () => {
  const withdrawn = buildIpoEventSnapshot(snapshotInput({
    tpexListings: [],
    tpexApplications: [{ ...application, note: "已撤銷申請" }],
  }));
  const delayed = buildIpoEventSnapshot(snapshotInput({
    tpexListings: [],
    tpexApplications: [{ ...application, note: "延期處理" }],
  }));

  assert.equal(withdrawn.records[0].stage, "withdrawn");
  assert.equal(delayed.records[0].stage, "delayed");
  assert.equal(withdrawn.records[0].events.some((event) => event.kind === "withdrawn"), false);
  assert.equal(delayed.records[0].events.some((event) => event.kind === "delayed"), false);
});

test("fills missing auction and public-offering fields from duplicate official rows", () => {
  const auction = {
    companyCode: "7819",
    companyName: "測試公司",
    market: "上櫃",
    bidStartDate: "2026-08-02",
    bidEndDate: "2026-08-03",
    auctionOpenDate: "2026-08-04",
    listingDate: null,
    minimumBidPrice: null,
    finalUnderwritingPrice: null,
    underwriter: "",
    cancelled: false,
    sourceRecordId: "TWSE:auction:7819:2026-08-04:a",
  };
  const publicOffering = {
    companyCode: "7819",
    companyName: "測試公司",
    market: "上櫃",
    subscriptionStartDate: "2026-08-05",
    subscriptionEndDate: "2026-08-06",
    drawDate: "2026-08-07",
    listingDate: null,
    provisionalUnderwritingPrice: null,
    finalUnderwritingPrice: null,
    underwriter: "",
    cancelled: false,
    sourceRecordId: "TWSE:public:7819:2026-08-07:a",
  };
  const record = buildIpoEventSnapshot(snapshotInput({
    tpexListings: [],
    auctions: [auction, {
      ...auction,
      minimumBidPrice: "42.8",
      finalUnderwritingPrice: "50",
      underwriter: "測試承銷商",
      sourceRecordId: "TWSE:auction:7819:2026-08-04:b",
    }],
    publicOfferings: [publicOffering, {
      ...publicOffering,
      provisionalUnderwritingPrice: "48",
      finalUnderwritingPrice: "50",
      underwriter: "測試承銷商",
      sourceRecordId: "TWSE:public:7819:2026-08-07:b",
    }],
  })).records[0];

  assert.equal(record.auction.minimumBidPrice, "42.8");
  assert.equal(record.publicOffering.provisionalUnderwritingPrice, "48");
  assert.equal(record.finalUnderwritingPrice, "50");
  assert.deepEqual(
    record.events.find((event) => event.kind === "auction_open").sourceRecordIds,
    ["TWSE:auction:7819:2026-08-04:a", "TWSE:auction:7819:2026-08-04:b"],
  );
});

test("represents a missing application date with the approved display placeholder", () => {
  const listingOnly = { ...listing, companyCode: "7001", sourceRecordId: "TPEx:ipo-no-limit:7001:2026-08-05" };
  const auctionOnly = {
    companyCode: "7002",
    companyName: "競拍公司",
    market: "上櫃",
    bidStartDate: "2026-08-02",
    bidEndDate: "2026-08-03",
    auctionOpenDate: "2026-08-04",
    listingDate: null,
    minimumBidPrice: null,
    finalUnderwritingPrice: null,
    underwriter: "",
    cancelled: false,
    sourceRecordId: "TWSE:auction:7002:2026-08-04",
  };
  const publicOfferingOnly = {
    companyCode: "7003",
    companyName: "申購公司",
    market: "上櫃",
    subscriptionStartDate: "2026-08-05",
    subscriptionEndDate: "2026-08-06",
    drawDate: "2026-08-07",
    listingDate: null,
    provisionalUnderwritingPrice: null,
    finalUnderwritingPrice: null,
    underwriter: "",
    cancelled: false,
    sourceRecordId: "TWSE:public:7003:2026-08-07",
  };
  const records = buildIpoEventSnapshot(snapshotInput({
    tpexApplications: [],
    tpexListings: [listingOnly],
    auctions: [auctionOnly],
    publicOfferings: [publicOfferingOnly],
  })).records;

  assert.deepEqual(records.map((record) => record.applicationDate), ["—", "—", "—"]);
  assert.throws(() => taipeiCalendarDistance("—", "2026-08-05"), /valid ISO dates/);
});

test("does not merge records with the same code in different markets", () => {
  const snapshot = buildIpoEventSnapshot(snapshotInput({
    tpexListings: [],
    twseApplications: [{ ...application, market: "上市", companyName: "另一市場公司" }],
  }));

  assert.deepEqual(snapshot.records.map((record) => record.market), ["上市", "上櫃"]);
});

test("selects the latest application attempt without leaking an older attempt", () => {
  const oldAttempt = {
    ...application,
    companyCode: "1623",
    companyName: "測試再申請公司",
    applicationDate: "2024-12-24",
    reviewDate: "2025-01-10",
    boardDate: "2025-01-20",
    contractDate: "2025-01-30",
    listingDate: null,
    note: "已撤銷申請",
    sourceRecordId: "TWSE:1623:1131224",
  };
  const latestAttempt = {
    ...oldAttempt,
    applicationDate: "2025-09-30",
    reviewDate: null,
    boardDate: null,
    contractDate: null,
    note: "",
    sourceRecordId: "TWSE:1623:1140930",
  };

  const [record] = buildIpoEventSnapshot(snapshotInput({
    tpexApplications: [latestAttempt, oldAttempt],
    tpexListings: [],
  })).records;

  assert.equal(record.applicationDate, "2025-09-30");
  assert.equal(record.stage, "A");
  assert.equal(record.exceptionStatus, null);
  assert.equal(record.reviewDate, null);
  assert.deepEqual(record.events, [{
    companyCode: "1623",
    market: "上櫃",
    kind: "application_submitted",
    date: "2025-09-30",
    label: "申請送件",
    sourceRecordIds: ["TWSE:1623:1140930"],
  }]);
});

test("rejects conflicting non-empty fields within the same latest application date", () => {
  const latestAttempt = {
    ...application,
    companyCode: "1623",
    companyName: "測試再申請公司",
    applicationDate: "2025-09-30",
    reviewDate: "2025-10-10",
    boardDate: null,
    contractDate: null,
    listingDate: null,
    note: "科技事業",
    sourceRecordId: "TWSE:1623:1140930:a",
  };

  assert.throws(
    () => buildIpoEventSnapshot(snapshotInput({
      tpexApplications: [latestAttempt, {
        ...latestAttempt,
        reviewDate: "2025-10-11",
        sourceRecordId: "TWSE:1623:1140930:b",
      }],
      tpexListings: [],
    })),
    /IPO_SOURCE_CONFLICT:reviewDate/,
  );
  assert.throws(
    () => buildIpoEventSnapshot(snapshotInput({
      tpexApplications: [latestAttempt, {
        ...latestAttempt,
        note: "延期處理",
        sourceRecordId: "TWSE:1623:1140930:c",
      }],
      tpexListings: [],
    })),
    /IPO_SOURCE_CONFLICT:note/,
  );
});

test("does not attach pre-application evidence to a newer application attempt", () => {
  const latestAttempt = {
    ...application,
    companyCode: "1623",
    companyName: "測試再申請公司",
    applicationDate: "2025-09-30",
    reviewDate: null,
    boardDate: null,
    contractDate: null,
    listingDate: null,
    sourceRecordId: "TWSE:1623:1140930",
  };
  const staleListing = {
    ...listing,
    companyCode: "1623",
    companyName: "測試再申請公司",
    listingDate: "2025-08-20",
    sourceRecordId: "TPEx:ipo-no-limit:1623:2025-08-20",
  };
  const staleAuction = {
    companyCode: "1623",
    companyName: "測試再申請公司",
    market: "上櫃",
    bidStartDate: "2025-08-01",
    bidEndDate: "2025-08-02",
    auctionOpenDate: "2025-08-04",
    listingDate: "2025-08-20",
    minimumBidPrice: "42.8",
    finalUnderwritingPrice: "50",
    underwriter: "舊承銷商",
    cancelled: false,
    sourceRecordId: "TWSE:auction:1623:2025-08-04",
  };
  const stalePublicOffering = {
    companyCode: "1623",
    companyName: "測試再申請公司",
    market: "上櫃",
    subscriptionStartDate: "2025-08-05",
    subscriptionEndDate: "2025-08-06",
    drawDate: "2025-08-07",
    listingDate: "2025-08-20",
    provisionalUnderwritingPrice: "50",
    finalUnderwritingPrice: "50",
    underwriter: "舊承銷商",
    cancelled: false,
    sourceRecordId: "TWSE:public:1623:2025-08-07",
  };

  const [record] = buildIpoEventSnapshot(snapshotInput({
    tpexApplications: [latestAttempt],
    tpexListings: [staleListing],
    auctions: [staleAuction],
    publicOfferings: [stalePublicOffering],
  })).records;

  assert.equal(record.stage, "A");
  assert.equal(record.listingDate, null);
  assert.equal(record.auction, null);
  assert.equal(record.publicOffering, null);
  assert.equal(record.finalUnderwritingPrice, null);
  assert.deepEqual(record.events.map((event) => event.sourceRecordIds), [[latestAttempt.sourceRecordId]]);
});

test("selects the latest auction and public-offering flows without leaking cancelled history", () => {
  const currentAuction = {
    companyCode: "7814",
    companyName: "海昌生技",
    market: "上櫃",
    bidStartDate: "2026-06-30",
    bidEndDate: "2026-07-02",
    auctionOpenDate: "2026-07-06",
    listingDate: "2026-07-16",
    minimumBidPrice: "25",
    finalUnderwritingPrice: "28.4700",
    underwriter: "永豐金",
    cancelled: false,
    sourceRecordId: "TWSE:auction:7814:2026-07-06",
  };
  const oldAuction = {
    ...currentAuction,
    bidStartDate: "2026-06-10",
    bidEndDate: "2026-06-12",
    auctionOpenDate: "2026-06-16",
    listingDate: "2026-06-26",
    minimumBidPrice: "26.67",
    finalUnderwritingPrice: "0",
    cancelled: true,
    sourceRecordId: "TWSE:auction:7814:2026-06-16",
  };
  const currentPublicOffering = {
    companyCode: "7814",
    companyName: "海昌生技",
    market: "上櫃",
    subscriptionStartDate: "2026-07-03",
    subscriptionEndDate: "2026-07-07",
    drawDate: "2026-07-09",
    listingDate: "2026-07-16",
    provisionalUnderwritingPrice: "32",
    finalUnderwritingPrice: "28.47",
    underwriter: "永豐金",
    cancelled: false,
    sourceRecordId: "TWSE:public-offering:7814:2026-07-09",
  };
  const oldPublicOffering = {
    ...currentPublicOffering,
    subscriptionStartDate: "2026-06-15",
    subscriptionEndDate: "2026-06-17",
    drawDate: "2026-06-22",
    listingDate: "2026-06-26",
    finalUnderwritingPrice: null,
    cancelled: true,
    sourceRecordId: "TWSE:public-offering:7814:2026-06-22",
  };
  const currentApplication = {
    ...application,
    companyCode: "7814",
    companyName: "海昌生技",
    listingDate: "2026-07-16",
    underwriter: "永豐金",
    sourceRecordId: "TPEx:7814:2025-12-15",
  };

  const [record] = buildIpoEventSnapshot(snapshotInput({
    tpexApplications: [currentApplication],
    tpexListings: [],
    auctions: [currentAuction, oldAuction],
    publicOfferings: [currentPublicOffering, oldPublicOffering],
  })).records;

  assert.equal(record.exceptionStatus, null);
  assert.equal(record.auction.sourceRecordId, currentAuction.sourceRecordId);
  assert.equal(record.publicOffering.sourceRecordId, currentPublicOffering.sourceRecordId);
  assert.equal(record.events.some((event) => event.date === "2026-06-26"), false);
});

test("aggregates exact code and market evidence without fuzzy company-name matching", () => {
  const applicationVariant = {
    ...application,
    companyCode: "6423",
    companyName: "億而得-創",
    applicationDate: "2025-10-16",
    listingDate: "2026-01-22",
    underwriter: "兆豐",
    sourceRecordId: "TPEx:6423:2025-10-16",
  };
  const auctionVariant = {
    companyCode: "6423",
    companyName: "億而得",
    market: "上櫃",
    bidStartDate: "2026-01-07",
    bidEndDate: "2026-01-09",
    auctionOpenDate: "2026-01-13",
    listingDate: "2026-01-22",
    minimumBidPrice: "50",
    finalUnderwritingPrice: "60.0000",
    underwriter: "兆豐",
    cancelled: false,
    sourceRecordId: "TWSE:auction:6423:2026-01-13",
  };

  const [record] = buildIpoEventSnapshot(snapshotInput({
    tpexApplications: [applicationVariant],
    tpexListings: [],
    auctions: [auctionVariant],
  })).records;

  assert.equal(record.companyName, "億而得-創");
  assert.equal(record.underwriter, "兆豐");
  assert.equal(record.auction.sourceRecordId, auctionVariant.sourceRecordId);
});

test("fails closed when application, auction, or public-offering underwriters conflict", () => {
  const baseApplication = {
    ...application,
    listingDate: null,
    underwriter: "承銷商甲",
  };
  const baseAuction = {
    companyCode: application.companyCode,
    companyName: application.companyName,
    market: application.market,
    bidStartDate: "2026-08-02",
    bidEndDate: "2026-08-03",
    auctionOpenDate: "2026-08-04",
    listingDate: null,
    minimumBidPrice: null,
    finalUnderwritingPrice: null,
    underwriter: "承銷商甲",
    cancelled: false,
    sourceRecordId: "TWSE:auction:7819:2026-08-04",
  };
  const basePublicOffering = {
    companyCode: application.companyCode,
    companyName: application.companyName,
    market: application.market,
    subscriptionStartDate: "2026-08-05",
    subscriptionEndDate: "2026-08-06",
    drawDate: "2026-08-07",
    listingDate: null,
    provisionalUnderwritingPrice: null,
    finalUnderwritingPrice: null,
    underwriter: "承銷商甲",
    cancelled: false,
    sourceRecordId: "TWSE:public:7819:2026-08-07",
  };

  for (const patch of [
    { tpexApplications: [baseApplication], auctions: [{ ...baseAuction, underwriter: "承銷商乙" }], publicOfferings: [] },
    { tpexApplications: [baseApplication], auctions: [], publicOfferings: [{ ...basePublicOffering, underwriter: "承銷商乙" }] },
    { tpexApplications: [], auctions: [baseAuction], publicOfferings: [{ ...basePublicOffering, underwriter: "承銷商乙" }] },
  ]) {
    assert.throws(
      () => buildIpoEventSnapshot(snapshotInput({ tpexListings: [], ...patch })),
      /IPO_SOURCE_CONFLICT:underwriter/,
    );
  }
});

test("accepts numerically equal official underwriting prices without rewriting them", () => {
  const auctionWithPrice = {
    companyCode: "7819",
    companyName: "測試公司",
    market: "上櫃",
    bidStartDate: "2026-08-02",
    bidEndDate: "2026-08-03",
    auctionOpenDate: "2026-08-04",
    listingDate: "2026-08-05",
    minimumBidPrice: "42.8",
    finalUnderwritingPrice: "50.0000",
    underwriter: "測試承銷商",
    cancelled: false,
    sourceRecordId: "TWSE:auction:7819:2026-08-04",
  };
  const publicOfferingWithPrice = {
    companyCode: "7819",
    companyName: "測試公司",
    market: "上櫃",
    subscriptionStartDate: "2026-08-05",
    subscriptionEndDate: "2026-08-06",
    drawDate: "2026-08-07",
    listingDate: "2026-08-05",
    provisionalUnderwritingPrice: "50",
    finalUnderwritingPrice: "50",
    underwriter: "測試承銷商",
    cancelled: false,
    sourceRecordId: "TWSE:public:7819:2026-08-07",
  };

  const [record] = buildIpoEventSnapshot(snapshotInput({
    tpexListings: [{ ...listing, finalUnderwritingPrice: "50.00" }],
    auctions: [auctionWithPrice, {
      ...auctionWithPrice,
      minimumBidPrice: "42.80",
      finalUnderwritingPrice: "50",
      sourceRecordId: "TWSE:auction:7819:2026-08-04:b",
    }],
    publicOfferings: [publicOfferingWithPrice, {
      ...publicOfferingWithPrice,
      provisionalUnderwritingPrice: "50.00",
      finalUnderwritingPrice: "50.000",
      sourceRecordId: "TWSE:public:7819:2026-08-07:b",
    }],
  })).records;

  assert.equal(record.finalUnderwritingPrice, "50.00");
  assert.equal(record.auction.minimumBidPrice, "42.8");
  assert.equal(record.publicOffering.provisionalUnderwritingPrice, "50");
});

test("fails closed on downstream identity text conflicts when no application exists", () => {
  const auctionOnly = {
    companyCode: "7001",
    companyName: "證據名稱甲",
    market: "上櫃",
    bidStartDate: "2026-08-01",
    bidEndDate: "2026-08-02",
    auctionOpenDate: "2026-08-03",
    listingDate: "2026-08-10",
    minimumBidPrice: null,
    finalUnderwritingPrice: null,
    underwriter: "承銷商甲",
    cancelled: false,
    sourceRecordId: "TWSE:auction:7001:2026-08-03",
  };
  const publicOnly = {
    companyCode: "7001",
    companyName: "證據名稱乙",
    market: "上櫃",
    subscriptionStartDate: "2026-08-04",
    subscriptionEndDate: "2026-08-05",
    drawDate: "2026-08-06",
    listingDate: "2026-08-10",
    provisionalUnderwritingPrice: null,
    finalUnderwritingPrice: null,
    underwriter: "承銷商甲",
    cancelled: false,
    sourceRecordId: "TWSE:public:7001:2026-08-06",
  };

  assert.throws(
    () => buildIpoEventSnapshot(snapshotInput({
      tpexApplications: [],
      tpexListings: [],
      auctions: [auctionOnly],
      publicOfferings: [publicOnly],
    })),
    /IPO_SOURCE_CONFLICT:companyName/,
  );
  assert.throws(
    () => buildIpoEventSnapshot(snapshotInput({
      tpexApplications: [],
      tpexListings: [],
      auctions: [auctionOnly],
      publicOfferings: [{ ...publicOnly, companyName: auctionOnly.companyName, underwriter: "承銷商乙" }],
    })),
    /IPO_SOURCE_CONFLICT:underwriter/,
  );
});

test("fails closed on downstream underwriter conflicts when the application has no underwriter", () => {
  const listingUnderwriter = { ...listing, underwriter: "承銷商甲" };
  const auctionUnderwriter = {
    companyCode: application.companyCode,
    companyName: application.companyName,
    market: application.market,
    bidStartDate: "2026-08-02",
    bidEndDate: "2026-08-03",
    auctionOpenDate: "2026-08-04",
    listingDate: application.listingDate,
    minimumBidPrice: null,
    finalUnderwritingPrice: listing.finalUnderwritingPrice,
    underwriter: "承銷商乙",
    cancelled: false,
    sourceRecordId: "TWSE:auction:7819:2026-08-04",
  };

  for (const missingUnderwriter of ["", "—"]) {
    assert.throws(
      () => buildIpoEventSnapshot(snapshotInput({
        tpexApplications: [{ ...application, underwriter: missingUnderwriter }],
        tpexListings: [listingUnderwriter],
        auctions: [auctionUnderwriter],
      })),
      /IPO_SOURCE_CONFLICT:underwriter/,
    );
  }
});
