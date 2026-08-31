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
      finalUnderwritingPrice: null, events: [{ date: "2026-09-02", kind: "review_completed", label: "審議完成", verified: true }],
    }],
  });
});

test("V5.6 IPO loader refuses an invalid common model", () => {
  assert.equal(snapshotFromV56Model({ schemaVersion: 2 }), null);
});
