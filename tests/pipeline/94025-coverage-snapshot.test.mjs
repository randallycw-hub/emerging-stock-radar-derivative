import assert from "node:assert/strict";
import test from "node:test";
import { build94025CoverageSnapshotCandidate } from "../../lib/pipeline/snapshots/94025-coverage.ts";
import { evaluate94025SnapshotPublicationEligibility, promoteSnapshotPointer } from "../../lib/pipeline/snapshots/publication.ts";

const record = (code, month = "11506") => ({ companyCode: code, companyName: `Company ${code}`, industryName: "Industry", yearMonth: month, sourcePublishedOn: "2026-07-17", revenueUnit: "隞?", currentMonthRevenue: "100" });
const result = (overrides = {}) => ({ runId: "run-1", sourceId: "94025", resourceId: "94025-csv", adapterVersion: "94025-csv-v1", rawSchemaVersion: "94025-csv-v1", domainSchemaVersion: "monthly-revenue-94025-v1", fetchedAt: "2026-07-26T00:00:00.000Z", responseHash: "sha256:abc", responseBytes: 42, rawRowCount: 2, normalizedRecordCount: 2, rejectedRecordCount: 0, records: [record("1260"), record("2245")], executionStatus: "succeeded", diagnostics: [], integrityReport: { status: "valid", acceptedRecordCount: 2, rejectedRecordCount: 0, warningCount: 0, errors: [], warnings: [], identityConflicts: [], canPublishCandidate: true }, ...overrides });

test("builds deterministic sorted coverage snapshot", () => {
  const a = build94025CoverageSnapshotCandidate(result({ records: [record("2245"), record("1260")] }), { createdAt: "2026-07-26T00:00:01.000Z" });
  const b = build94025CoverageSnapshotCandidate(result(), { createdAt: "2026-07-26T00:00:01.000Z" });
  assert.deepEqual(a.records.map((r) => r.companyCode), ["1260", "2245"]);
  assert.equal(a.snapshotId, b.snapshotId);
  assert.equal(a.publicationEligibility, "eligible");
});

test("rejects missing or duplicate identity and mixed months", () => {
  for (const records of [[record(" "), record("2245")], [record("1260"), record("1260")], [record("1260"), record("2245", "11507")]]) {
    assert.throws(() => build94025CoverageSnapshotCandidate(result({ records, normalizedRecordCount: records.length, rawRowCount: records.length }), { createdAt: "2026-07-26T00:00:01.000Z" }));
  }
});

test("requires complete provenance, counts, integrity and approved resource", () => {
  assert.throws(() => build94025CoverageSnapshotCandidate(result({ responseHash: undefined }), { createdAt: "2026-07-26T00:00:01.000Z" }));
  assert.throws(() => build94025CoverageSnapshotCandidate(result({ integrityReport: { ...result().integrityReport, status: "invalid", canPublishCandidate: false } }), { createdAt: "2026-07-26T00:00:01.000Z" }));
  assert.throws(() => build94025CoverageSnapshotCandidate(result({ rejectedRecordCount: 1 }), { createdAt: "2026-07-26T00:00:01.000Z" }));
});

test("valid_with_warnings remains eligible and preserves warning count", () => {
  const candidate = build94025CoverageSnapshotCandidate(result({ integrityReport: { ...result().integrityReport, status: "valid_with_warnings", warningCount: 2, canPublishCandidate: true } }), { createdAt: "2026-07-26T00:00:01.000Z" });
  const decision = evaluate94025SnapshotPublicationEligibility(candidate);
  assert.equal(decision.eligible, true); assert.equal(decision.warningCount, 2);
});

test("promotes pointer immutably for first and next snapshots, rejects ineligible", () => {
  const candidate = build94025CoverageSnapshotCandidate(result(), { createdAt: "2026-07-26T00:00:01.000Z" });
  assert.throws(() => promoteSnapshotPointer(null, candidate, { publishedAt: "2026-07-26T00:00:02.000Z", resourceApprovalStatus: "VERIFIED_FOR_IMPLEMENTATION" }));
  const first = promoteSnapshotPointer(null, candidate, { publishedAt: "2026-07-26T00:00:02.000Z", resourceApprovalStatus: "APPROVED_FOR_PRODUCTION" });
  assert.equal(first.previousSnapshotId, null); assert.equal(first.currentSnapshotId, candidate.snapshotId);
  const next = promoteSnapshotPointer(first, { ...candidate, snapshotId: "94025:next" }, { publishedAt: "2026-07-26T00:00:03.000Z", resourceApprovalStatus: "APPROVED_FOR_PRODUCTION" });
  assert.equal(next.previousSnapshotId, candidate.snapshotId); assert.equal(next.currentSnapshotId, "94025:next");
  assert.throws(() => promoteSnapshotPointer(first, { ...candidate, publicationEligibility: "ineligible" }, { publishedAt: "2026-07-26T00:00:03.000Z", resourceApprovalStatus: "APPROVED_FOR_PRODUCTION" }));
  const invalid = { ...candidate, validationStatus: "invalid", publicationEligibility: "eligible" };
  assert.equal(evaluate94025SnapshotPublicationEligibility(invalid).eligible, false);
});
