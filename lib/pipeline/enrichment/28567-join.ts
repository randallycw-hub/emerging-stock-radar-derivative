import type { AdapterExecutionResult } from "../adapters/types.ts";
import type { CoverageRecord94025 } from "../snapshots/types.ts";
import type { NormalizedCompany28567 } from "../../source-verification/source-28567.ts";

export type EnrichmentMatchStatus = "matched" | "unmatched" | "ambiguous";
export interface EnrichmentRecord28567 { coverage: CoverageRecord94025; profile: NormalizedCompany28567 | null; matchStatus: EnrichmentMatchStatus; }
export interface EmergingCompanyProfileEnrichmentResult { coverageCount: number; profileRecordCount: number; matchedCount: number; unmatchedCount: number; ambiguousCount: number; records: readonly EnrichmentRecord28567[]; unmatchedCompanyCodes: readonly string[]; ambiguousCompanyCodes: readonly string[]; diagnostics: readonly string[]; sourceCoverageSnapshotId: string; source94025ResponseHash: string; source28567ResponseHash: string; createdAt: string; }

export function enrich94025CoverageWith28567(coverage: readonly CoverageRecord94025[], result: AdapterExecutionResult<NormalizedCompany28567>, context: { sourceCoverageSnapshotId: string; createdAt: string }): EmergingCompanyProfileEnrichmentResult {
  if (result.executionStatus !== "succeeded" || result.integrityReport.status === "invalid" || !result.responseHash || !result.fetchedAt) throw new Error("PROFILE_SOURCE_NOT_PUBLISHABLE");
  const byCode = new Map<string, NormalizedCompany28567[]>(); for (const profile of result.records) { const list = byCode.get(profile.companyCode) ?? []; list.push(profile); byCode.set(profile.companyCode, list); }
  const unmatched: string[] = []; const ambiguous: string[] = []; const records = coverage.map((item) => { const matches = byCode.get(item.companyCode) ?? []; if (matches.length === 1) return { coverage: item, profile: matches[0], matchStatus: "matched" as const }; if (matches.length === 0) { unmatched.push(item.companyCode); return { coverage: item, profile: null, matchStatus: "unmatched" as const }; } ambiguous.push(item.companyCode); return { coverage: item, profile: null, matchStatus: "ambiguous" as const }; });
  return { coverageCount: coverage.length, profileRecordCount: result.records.length, matchedCount: records.filter((r) => r.matchStatus === "matched").length, unmatchedCount: unmatched.length, ambiguousCount: ambiguous.length, records, unmatchedCompanyCodes: unmatched, ambiguousCompanyCodes: ambiguous, diagnostics: [], sourceCoverageSnapshotId: context.sourceCoverageSnapshotId, source94025ResponseHash: coverage[0]?.responseHash ?? "", source28567ResponseHash: result.responseHash, createdAt: context.createdAt };
}
