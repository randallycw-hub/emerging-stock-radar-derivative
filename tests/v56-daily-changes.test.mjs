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

test("emits IPO milestones and emerging turnover changes only from verified consecutive snapshots", () => {
  const before = {
    ...previous,
    ipoPipeline: { status: "verified", records: [{ stockCode: "3313", stage: "B", events: [] }] },
    emerging: { status: "verified", records: [{ stockCode: "7777", transactionAmount: 100 }] },
  };
  const after = {
    ...current,
    ipoPipeline: { status: "verified", records: [{ stockCode: "3313", stage: "C", events: [{ date: "2026-08-28", kind: "contract_approved", label: "契約核准", verified: true }] }] },
    emerging: { status: "verified", records: [{ stockCode: "7777", transactionAmount: 250 }] },
  };
  const changes = buildDailyChanges({ previous: before, current: after });
  assert.deepEqual(changes.filter((change) => change.entityType !== "cb").map((change) => [change.entityType, change.changeType, change.oldValue, change.newValue]), [
    ["emerging", "emerging_turnover_changed", 100, 250],
    ["ipo", "ipo_stage_changed", "B", "C"],
    ["ipo", "new_ipo_event", null, "契約核准"],
  ]);
});

test("emits only newly entered verified CB event windows", () => {
  const after = {
    ...current,
    cbEvents: {
      status: "verified",
      records: [
        { eventId: "event:23032:redemption", eventType: "early_redemption", cbCode: "23032", announcementDate: "2026-08-28" },
        { eventId: "event:23032:listing", eventType: "listing", cbCode: "23032", announcementDate: "2026-08-28" },
        { eventId: "event:23032:suspension", eventType: "conversion_suspension", cbCode: "23032", announcementDate: "2026-08-28" },
        { eventId: "event:23032:put", eventType: "put", cbCode: "23032", announcementDate: "2026-08-28" },
        { eventId: "event:23032:maturity", eventType: "maturity", cbCode: "23032", announcementDate: "2026-11-26" },
      ],
    },
  };
  const changes = buildDailyChanges({ previous, current: after });
  assert.deepEqual(changes.filter((change) => change.entityType === "cb").map((change) => change.changeType), [
    "conversion_price_changed",
    "outstanding_changed",
    "new_early_redemption",
    "new_listing",
    "conversion_suspension_added",
    "put_window_added",
    "maturity_window_entered",
  ]);
});
