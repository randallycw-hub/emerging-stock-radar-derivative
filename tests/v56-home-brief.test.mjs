import assert from "node:assert/strict";
import test from "node:test";

import { buildV56HomeBrief } from "../static-showcase/assets/home-page.js";

const model = Object.freeze({
  schemaVersion: 3,
  dataDate: "2026-08-28",
  dailyChanges: {
    records: [
      { entityType: "cb", entityId: "23032", changeType: "conversion_price_changed", oldValue: 135.2, newValue: 130.7, effectiveDate: "2026-08-28" },
      { entityType: "cb", entityId: "23032", changeType: "put_window_added", oldValue: null, newValue: "賣回窗口", effectiveDate: "2026-08-28" },
      { entityType: "ipo", entityId: "3313", changeType: "new_ipo_event", oldValue: null, newValue: "審議完成", effectiveDate: "2026-09-02" },
      { entityType: "emerging", entityId: "7777", changeType: "emerging_turnover_rank_changed", oldValue: 2, newValue: 1, effectiveDate: "2026-08-28" },
    ],
  },
  performance: {
    records: [
      { entityType: "cb", entityId: "23032", cbCode: "23032", periods: { "1D": 0.03, "1W": null } },
    ],
  },
  cbMaster: {
    records: [{ cbCode: "23032", cbName: "聯電二", stockCode: "2303", companyName: "聯電" }],
  },
  cbEvents: {
    records: [{ eventId: "e1", cbCode: "23032", eventType: "early_redemption", announcementDate: "2026-08-28", deadlineDate: "2026-09-10", title: "提前贖回公告", status: "active" }],
  },
  ipoPipeline: {
    records: [{ stockCode: "3313", companyName: "斐成", stage: "review", reviewDate: "2026-09-02", listingDate: null }],
  },
  emerging: {
    records: [{ stockCode: "7777", companyName: "測試興櫃", dailyVolume: 1000, transactionAmount: 500000, tradingDate: "2026-08-28" }],
  },
});

test("V5.6 homepage brief prioritizes validated changes, performance, and dated official events", () => {
  const brief = buildV56HomeBrief(model);
  assert.equal(brief.dataDate, "2026-08-28");
  assert.deepEqual(brief.cbChanges.map((entry) => entry.label), ["轉換價調整", "賣回窗口"]);
  assert.equal(brief.ipoChanges[0].label, "審議完成");
  assert.equal(brief.emergingChanges[0].stockCode, "7777");
  assert.equal(brief.cbPerformance[0].cbCode, "23032");
  assert.equal(brief.ipoMilestones[0].date, "2026-09-02");
  assert.equal(brief.importantEvents[0].date, "2026-09-10");
  assert.equal(brief.emergingTurnover[0].stockCode, "7777");
});

test("V5.6 homepage brief preserves unavailable values instead of inventing zeros", () => {
  const brief = buildV56HomeBrief({ schemaVersion: 3, dataDate: "2026-08-28" });
  assert.deepEqual(brief.cbChanges, []);
  assert.deepEqual(brief.ipoChanges, []);
  assert.deepEqual(brief.emergingChanges, []);
  assert.deepEqual(brief.cbPerformance, []);
  assert.deepEqual(brief.importantEvents, []);
});
