import type { AdapterExecutionResult } from "../adapters/types.ts";
import type { NormalizedMonthlyRevenue94025 } from "../../source-verification/source-94025.ts";

export interface CoverageRecord94025 {
  companyCode: string; companyName: string; industry: string; revenueYearMonth: string;
  sourceDatasetId: "94025"; sourceId: "94025"; resourceId: "94025-csv";
  sourceRecordIdentity: string; fetchedAt: string; responseHash: string;
}
export type CoverageExecutionResult94025 = AdapterExecutionResult<NormalizedMonthlyRevenue94025>;
export interface CoverageSnapshotCandidate94025 {
  snapshotId: string; runId: string; sourceId: "94025"; resourceId: "94025-csv";
  adapterVersion: string; rawSchemaVersion: string; domainSchemaVersion: string;
  revenueYearMonth: string; fetchedAt: string; responseHash: string; responseBytes: number;
  rawRowCount: number; acceptedRecordCount: number; rejectedRecordCount: number; warningCount: number; coverageCount: number;
  records: readonly CoverageRecord94025[]; createdAt: string; validationStatus: "valid" | "valid_with_warnings" | "invalid";
  publicationEligibility: "eligible" | "ineligible";
}
export interface SnapshotPublicationDecision { eligible: boolean; decisionCode: string; reasons: readonly string[]; warningCount: number; evaluatedAt: string; }
export interface PublishedSnapshotPointer { datasetId: "94025"; sourceId: "94025"; resourceId: "94025-csv"; currentSnapshotId: string; previousSnapshotId: string | null; publishedAt: string; publicationRunId: string; }
