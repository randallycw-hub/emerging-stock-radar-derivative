import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIpoEventSnapshot,
  taipeiCalendarDistance,
} from "../lib/ipo-events/snapshot.ts";

const sourceManifest = [{
  sourceId: "tpex-applications",
  sourceUrl: "https://example.test/tpex-applications",
  downloadedAt: "2026-08-01T22:00:00+08:00",
  sha256: "sha256:abc",
  rawBytes: 1,
  rowCount: 1,
}];

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

test("does not merge records with the same code in different markets", () => {
  const snapshot = buildIpoEventSnapshot(snapshotInput({
    tpexListings: [],
    twseApplications: [{ ...application, market: "上市", companyName: "另一市場公司" }],
  }));

  assert.deepEqual(snapshot.records.map((record) => record.market), ["上市", "上櫃"]);
});
