import assert from "node:assert/strict";
import test from "node:test";

import { snapshotFromV56Model } from "../static-showcase/assets/ipo-data.js";

test("V5.6 IPO loader converts the shared verified pipeline into the public IPO snapshot shape", () => {
  const snapshot = snapshotFromV56Model({
    schemaVersion: 3,
    dataDate: "2026-08-28",
    generatedAt: "2026-08-28T16:30:00+08:00",
    ipoPipeline: { records: [{
      stockCode: "3313", companyName: "斐成", market: "上市", stage: "C", exceptionStatus: null,
      applicationDate: "2026-07-01", reviewDate: "2026-09-02", boardDate: null, contractDate: null, listingDate: null,
      offerPrice: null, events: [{ date: "2026-09-02", kind: "review_completed", label: "審議完成", verified: true }],
    }] },
  });
  assert.deepEqual(snapshot, {
    schemaVersion: 1,
    dataDate: "2026-08-28",
    generatedAt: "2026-08-28T16:30:00+08:00",
    sourceManifest: [],
    records: [{
      companyCode: "3313", companyName: "斐成", market: "上市", stage: "C", exceptionStatus: null,
      applicationDate: "2026-07-01", reviewDate: "2026-09-02", boardDate: null, contractDate: null, listingDate: null,
      provisionalUnderwritingPrice: null, finalUnderwritingPrice: null, underwriter: null, auction: null, publicOffering: null,
      events: [{ date: "2026-09-02", kind: "review_completed", label: "審議完成", verified: true }],
    }],
  });
});

test("V5.6 IPO loader refuses an invalid common model", () => {
  assert.equal(snapshotFromV56Model({ schemaVersion: 2 }), null);
});

test("V5.6 IPO loader retains verified offering fields required by the public offering desk", () => {
  const snapshot = snapshotFromV56Model({
    schemaVersion: 3,
    dataDate: "2026-08-28",
    ipoPipeline: { records: [{
      stockCode: "7825", companyName: "和亞智慧", market: "興櫃", stage: "D", exceptionStatus: null,
      applicationDate: null, reviewDate: null, boardDate: null, contractDate: null, listingDate: "2026-09-10", offerPrice: 56,
      underwriter: "測試承銷商",
      auction: { bidStartDate: "2026-08-26", bidEndDate: "2026-08-28", auctionOpenDate: "2026-09-01", listingDate: "2026-09-10", minimumBidPrice: 50, finalUnderwritingPrice: 56, verified: true },
      publicOffering: { subscriptionStartDate: "2026-08-31", subscriptionEndDate: "2026-09-02", drawDate: "2026-09-03", listingDate: "2026-09-10", provisionalUnderwritingPrice: 52, finalUnderwritingPrice: 56, verified: true },
      events: [],
    }] },
  });

  assert.deepEqual(snapshot.records[0].auction, {
    bidStartDate: "2026-08-26", bidEndDate: "2026-08-28", auctionOpenDate: "2026-09-01", listingDate: "2026-09-10", minimumBidPrice: 50, finalUnderwritingPrice: 56, verified: true,
  });
  assert.deepEqual(snapshot.records[0].publicOffering, {
    subscriptionStartDate: "2026-08-31", subscriptionEndDate: "2026-09-02", drawDate: "2026-09-03", listingDate: "2026-09-10", provisionalUnderwritingPrice: 52, finalUnderwritingPrice: 56, verified: true,
  });
  assert.equal(snapshot.records[0].underwriter, "測試承銷商");
});
