import assert from "node:assert/strict";
import test from "node:test";

import { buildV56CbMarketSections } from "../static-showcase/assets/bonds-page.js";

test("V5.6 CB market sections use the common daily-change and performance datasets", () => {
  const sections = buildV56CbMarketSections({
    schemaVersion: 3,
    dataDate: "2026-08-28",
    cbMaster: { records: [{ cbCode: "23032", cbName: "聯電二", stockCode: "2303", companyName: "聯電" }] },
    dailyChanges: { records: [{ entityType: "cb", entityId: "23032", changeType: "outstanding_changed", oldValue: 820, newValue: 590, effectiveDate: "2026-08-28" }] },
    performance: { records: [{ entityType: "cb", cbCode: "23032", periods: { "1D": 0.03, "1W": 0.05, "1M": null } }] },
  });
  assert.equal(sections.dataDate, "2026-08-28");
  assert.equal(sections.changes[0].label, "流通餘額異動");
  assert.deepEqual(sections.performance[0].periods, { "1D": 0.03, "1W": 0.05, "1M": null, "3M": null, "6M": null, YTD: null });
});

test("V5.6 CB market sections reject an unrecognised model rather than fabricating market rows", () => {
  assert.deepEqual(buildV56CbMarketSections({ schemaVersion: 2, dataDate: "2026-08-28" }), {
    dataDate: null,
    changes: [],
    performance: [],
  });
});
