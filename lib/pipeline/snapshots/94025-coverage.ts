import { getApprovedResource } from "../source-registry.ts";
import type { CoverageExecutionResult94025, CoverageRecord94025, CoverageSnapshotCandidate94025 } from "./types.ts";
import { evaluate94025SnapshotPublicationEligibility } from "./publication.ts";

export function build94025CoverageSnapshotCandidate(result: CoverageExecutionResult94025, options: { createdAt: string }): CoverageSnapshotCandidate94025 {
  if (result.executionStatus !== "succeeded") throw new Error("ADAPTER_NOT_SUCCEEDED");
  if (result.integrityReport.status === "invalid" || !result.integrityReport.canPublishCandidate) throw new Error("INTEGRITY_NOT_PUBLISHABLE");
  if (!result.responseHash || !result.fetchedAt || !Number.isFinite(result.responseBytes)) throw new Error("PROVENANCE_INCOMPLETE");
  if (result.sourceId !== "94025" || result.resourceId !== "94025-csv") throw new Error("SOURCE_MISMATCH");
  if (getApprovedResource("94025", "94025-csv").approvalStatus !== "APPROVED_FOR_PRODUCTION") throw new Error("RESOURCE_NOT_APPROVED");
  if (result.rawRowCount !== result.records.length || result.normalizedRecordCount !== result.records.length || result.rejectedRecordCount !== 0) throw new Error("ROW_COUNT_MISMATCH");
  const identities = new Set<string>();
  const months = new Set(result.records.map((r) => r.yearMonth));
  if (months.size !== 1) throw new Error("MIXED_REVENUE_MONTH");
  const records: CoverageRecord94025[] = result.records.map((r) => {
    const code = r.companyCode.trim(); if (!code || identities.has(code)) throw new Error("DUPLICATE_IDENTITY"); identities.add(code);
    return { companyCode: code, companyName: r.companyName, industry: r.industryName, revenueYearMonth: r.yearMonth, sourceDatasetId: "94025" as const, sourceId: "94025" as const, resourceId: "94025-csv" as const, sourceRecordIdentity: `94025:${code}:${r.yearMonth}`, fetchedAt: result.fetchedAt!, responseHash: result.responseHash! };
  }).sort((a, b) => a.companyCode.localeCompare(b.companyCode));
  const seed = [result.runId, result.sourceId, result.resourceId, result.responseHash, result.adapterVersion, result.rawSchemaVersion, result.domainSchemaVersion, [...months][0]].join("|");
  const snapshotId = `94025:${Buffer.from(seed).toString("base64url")}`;
  const candidate: CoverageSnapshotCandidate94025 = { snapshotId, runId: result.runId, sourceId: "94025", resourceId: "94025-csv", adapterVersion: result.adapterVersion, rawSchemaVersion: result.rawSchemaVersion, domainSchemaVersion: result.domainSchemaVersion, revenueYearMonth: [...months][0], fetchedAt: result.fetchedAt!, responseHash: result.responseHash!, responseBytes: result.responseBytes!, rawRowCount: result.rawRowCount, acceptedRecordCount: result.integrityReport.acceptedRecordCount, rejectedRecordCount: 0, warningCount: result.integrityReport.warningCount, coverageCount: records.length, records, createdAt: options.createdAt, validationStatus: result.integrityReport.status, publicationEligibility: "eligible" };
  const decision = evaluate94025SnapshotPublicationEligibility(candidate);
  return { ...candidate, publicationEligibility: decision.eligible ? "eligible" : "ineligible" };
}
