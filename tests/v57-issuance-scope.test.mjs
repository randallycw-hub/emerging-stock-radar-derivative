import assert from "node:assert/strict";
import test from "node:test";

import {
  buildV53IssuancePipeline,
  selectV57IssuanceRecords,
} from "../static-showcase/assets/bond-issuance-page.js";

const asOfDate = "2026-08-28";

test("V5.7 issuance page keeps only official in-progress, upcoming, and recent listing cases", () => {
  const records = [
    { cbCode: "90001", cbName: "進行中一", stockCode: "9000", companyName: "甲", stages: { filingDate: "2026-08-20" } },
    { cbCode: "90002", cbName: "即將掛牌一", stockCode: "9001", companyName: "乙", stages: { listingDate: "2026-09-04" } },
    { cbCode: "90003", cbName: "近期掛牌一", stockCode: "9002", companyName: "丙", stages: { listingDate: "2026-08-07" } },
    { cbCode: "90004", cbName: "舊掛牌一", stockCode: "9003", companyName: "丁", stages: { listingDate: "2024-08-07" } },
  ];

  const rows = selectV57IssuanceRecords(records, { status: "all" }, asOfDate);

  assert.deepEqual(rows.map((row) => [row.cbCode, row.category]), [
    ["90001", "in_progress"],
    ["90002", "upcoming"],
    ["90003", "recent_listing"],
  ]);
  assert.deepEqual(selectV57IssuanceRecords(records, { status: "recent_listing" }, asOfDate).map((row) => row.cbCode), ["90003"]);
});

test("V5.7 issuance pipeline exposes only official stages and never renders CBAS decomposition", () => {
  assert.deepEqual(buildV53IssuancePipeline({
    stages: { announcementDate: null, filingDate: "2026-08-20", effectiveDate: null, listingDate: "2026-09-03", asoDate: "2026-10-01" },
  }).map((node) => ({ stage: node.stage, label: node.label })), [
    { stage: "filingDate", label: "2026/08/20" },
    { stage: "listingDate", label: "2026/09/03" },
  ]);
});
