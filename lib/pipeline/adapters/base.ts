import type { RawHttpResponse } from "../http-client.ts";
import type { AdapterDiagnostic, AdapterExecutionContext, AdapterExecutionResult, IntegrityReport, SourceAdapter } from "./types.ts";

export abstract class BaseSourceAdapter<TRawRecord, TDomainRecord> implements SourceAdapter<TRawRecord, TDomainRecord> {
  abstract readonly sourceId: string;
  abstract readonly resourceId: string;
  abstract readonly adapterVersion: string;
  abstract readonly rawSchemaVersion: string;
  abstract readonly domainSchemaVersion: string;
  abstract fetchRaw(context: AdapterExecutionContext): Promise<RawHttpResponse>;
  abstract parseRaw(response: RawHttpResponse): readonly TRawRecord[];
  abstract normalize(rawRecords: readonly TRawRecord[], context: AdapterExecutionContext): readonly TDomainRecord[];
  abstract validateIntegrity(rawRecords: readonly TRawRecord[], records: readonly TDomainRecord[]): IntegrityReport;

  async execute(context: AdapterExecutionContext): Promise<AdapterExecutionResult<TDomainRecord>> {
    const diagnostics: AdapterDiagnostic[] = [];
    const base = { runId: context.runId, sourceId: this.sourceId, resourceId: this.resourceId, adapterVersion: this.adapterVersion, rawSchemaVersion: this.rawSchemaVersion, domainSchemaVersion: this.domainSchemaVersion };
    if (context.abortSignal?.aborted) return { ...base, rawRowCount: 0, normalizedRecordCount: 0, rejectedRecordCount: 0, integrityReport: invalidReport("EXECUTION_CANCELLED", "adapter cancelled"), records: [], executionStatus: "cancelled", diagnostics: [{ stage: "execute", code: "EXECUTION_CANCELLED", message: "adapter cancelled" }] };
    let response: RawHttpResponse;
    try { response = await this.fetchRaw(context); } catch (error) { const diagnostic = toDiagnostic("fetch", error); diagnostics.push(diagnostic); return { ...base, rawRowCount: 0, normalizedRecordCount: 0, rejectedRecordCount: 0, integrityReport: invalidReport(diagnostic.code, diagnostic.message), records: [], executionStatus: "failed_fetch", diagnostics }; }
    let rawRecords: readonly TRawRecord[];
    try { rawRecords = this.parseRaw(response); } catch (error) { const diagnostic = toDiagnostic("parse", error); diagnostics.push(diagnostic); return { ...base, fetchedAt: response.fetchedAt, responseHash: response.sha256, responseBytes: response.responseBytes, rawRowCount: 0, normalizedRecordCount: 0, rejectedRecordCount: 0, integrityReport: invalidReport(diagnostic.code, diagnostic.message), records: [], executionStatus: "failed_parse", diagnostics }; }
    let records: readonly TDomainRecord[];
    try { records = this.normalize(rawRecords, context); } catch (error) { const diagnostic = toDiagnostic("normalize", error); diagnostics.push(diagnostic); return { ...base, fetchedAt: response.fetchedAt, responseHash: response.sha256, responseBytes: response.responseBytes, rawRowCount: rawRecords.length, normalizedRecordCount: 0, rejectedRecordCount: rawRecords.length, integrityReport: invalidReport(diagnostic.code, diagnostic.message), records: [], executionStatus: "failed_normalization", diagnostics }; }
    const integrity = this.validateIntegrity(rawRecords, records);
    if (!integrity.canPublishCandidate) diagnostics.push(...integrity.errors);
    return { ...base, fetchedAt: response.fetchedAt, responseHash: response.sha256, responseBytes: response.responseBytes, rawRowCount: rawRecords.length, normalizedRecordCount: records.length, rejectedRecordCount: integrity.rejectedRecordCount, integrityReport: integrity, records, executionStatus: integrity.canPublishCandidate ? "succeeded" : "failed_integrity", diagnostics };
  }
}

function invalidReport(code: string, message: string): IntegrityReport { return { status: "invalid", acceptedRecordCount: 0, rejectedRecordCount: 0, warningCount: 0, errors: [{ stage: "execute", code, message }], warnings: [], identityConflicts: [], canPublishCandidate: false }; }
function toDiagnostic(stage: AdapterDiagnostic["stage"], error: unknown): AdapterDiagnostic { return { stage, code: error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code) : `${stage.toUpperCase()}_FAILED`, message: error instanceof Error ? error.message : String(error) }; }
