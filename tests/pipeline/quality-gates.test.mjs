import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSnapshotCandidate,
  evaluateIpoStageProgress,
} from "../../lib/pipeline/quality-gates.ts";

const snapshot = (overrides = {}) => ({
  acceptedRecordCount: 400,
  rejectedRecordCount: 0,
  fetchedAt: "2026-08-24T17:45:00+08:00",
  ...overrides,
});

test("rejects a candidate whose verified row count collapses relative to the published snapshot", () => {
  assert.deepEqual(evaluateSnapshotCandidate({
    previous: snapshot(),
    candidate: snapshot({ acceptedRecordCount: 120 }),
  }), {
    eligible: false,
    reasons: ["ROW_COUNT_COLLAPSE"],
  });
});

test("rejects rejected rows and a candidate fetched before the published snapshot", () => {
  assert.deepEqual(evaluateSnapshotCandidate({
    previous: snapshot(),
    candidate: snapshot({
      acceptedRecordCount: 400,
      rejectedRecordCount: 1,
      fetchedAt: "2026-08-23T17:45:00+08:00",
    }),
  }), {
    eligible: false,
    reasons: ["REJECTED_RECORDS", "FETCH_TIME_REGRESSION"],
  });
});

test("allows a complete candidate that meets its adaptive row-count threshold", () => {
  assert.deepEqual(evaluateSnapshotCandidate({
    previous: snapshot(),
    candidate: snapshot({ acceptedRecordCount: 300 }),
  }), {
    eligible: true,
    reasons: [],
  });
});

test("prevents IPO stage regression unless the record has a terminal official event", () => {
  const previous = [{ companyCode: "1234", market: "上市", stage: "D", exceptionStatus: null }];
  const regressed = [{ companyCode: "1234", market: "上市", stage: "A", exceptionStatus: null }];
  const withdrawn = [{ companyCode: "1234", market: "上市", stage: "withdrawn", exceptionStatus: "withdrawn" }];

  assert.deepEqual(evaluateIpoStageProgress(previous, regressed), {
    eligible: false,
    reasons: ["IPO_STAGE_REGRESSION:1234:上市"],
  });
  assert.deepEqual(evaluateIpoStageProgress(previous, withdrawn), {
    eligible: true,
    reasons: [],
  });
});
