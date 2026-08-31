import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyChanges } from "../lib/market-data/v56-daily-changes.ts";

const previous = Object.freeze({
  schemaVersion: 3,
  dataDate: "2026-08-27",
  securityMaster: { status: "verified", records: [{ stockCode: "2303", relatedCbCodes: ["23032"] }] },
  cbMaster: { status: "verified", records: [{ cbCode: "23032", currentConversionPrice: 135.2, outstandingAmount: 820000000 }] },
  cbEvents: { status: "verified", records: [] },
  ipoPipeline: { status: "verified", records: [] },
  emerging: { status: "verified", records: [] },
});

const current = Object.freeze({
  ...previous,
  dataDate: "2026-08-28",
  cbMaster: { status: "verified", records: [{ cbCode: "23032", currentConversionPrice: 130.7, outstandingAmount: 590000000 }] },
  cbEvents: { status: "verified", records: [{ eventId: "event:23032:2026-08-28", eventType: "early_redemption", cbCode: "23032", announcementDate: "2026-08-28" }] },
});

test("emits stable Old-to-New CB changes and newly announced official events", () => {
  const changes = buildDailyChanges({ previous, current });
  assert.deepEqual(changes.map((change) => [change.changeType, change.oldValue, change.newValue]), [
    ["conversion_price_changed", 135.2, 130.7],
    ["outstanding_changed", 820000000, 590000000],
    ["new_early_redemption", null, "提前贖回"],
  ]);
  assert.equal(changes[0].changeId, "cb:23032:conversion_price_changed:2026-08-28");
});

test("does not manufacture a change after an invalid replacement snapshot", () => {
  const invalid = { ...current, cbMaster: { status: "failed", records: [] } };
  assert.deepEqual(buildDailyChanges({ previous, current: invalid }), []);
});
