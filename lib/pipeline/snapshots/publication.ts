import type { CoverageSnapshotCandidate94025, PublishedSnapshotPointer, SnapshotPublicationDecision } from "./types.ts";
export function evaluate94025SnapshotPublicationEligibility(candidate: CoverageSnapshotCandidate94025, now = new Date().toISOString()): SnapshotPublicationDecision {
  const reasons: string[] = [];
  if (candidate.validationStatus === "invalid") reasons.push("INTEGRITY_INVALID");
  if (candidate.coverageCount === 0) reasons.push("EMPTY_COVERAGE");
  if (candidate.rejectedRecordCount !== 0) reasons.push("REJECTED_RECORDS_PRESENT");
  if (candidate.rawRowCount !== candidate.acceptedRecordCount) reasons.push("ROW_COUNT_MISMATCH");
  return { eligible: reasons.length === 0 && candidate.publicationEligibility !== "ineligible", decisionCode: reasons[0] ?? "ELIGIBLE", reasons, warningCount: candidate.warningCount, evaluatedAt: now };
}
export function promoteSnapshotPointer(current: PublishedSnapshotPointer | null, candidate: CoverageSnapshotCandidate94025, context: { publishedAt: string; resourceApprovalStatus: "VERIFIED_FOR_IMPLEMENTATION" | "APPROVED_FOR_PRODUCTION" }): PublishedSnapshotPointer {
  if (context.resourceApprovalStatus !== "APPROVED_FOR_PRODUCTION") throw new Error("RESOURCE_NOT_APPROVED_FOR_PRODUCTION");
  const decision = evaluate94025SnapshotPublicationEligibility(candidate, context.publishedAt);
  if (!decision.eligible) throw new Error(`SNAPSHOT_NOT_ELIGIBLE:${decision.decisionCode}`);
  return { datasetId: "94025", sourceId: "94025", resourceId: "94025-csv", currentSnapshotId: candidate.snapshotId, previousSnapshotId: current?.currentSnapshotId ?? null, publishedAt: context.publishedAt, publicationRunId: candidate.runId };
}
