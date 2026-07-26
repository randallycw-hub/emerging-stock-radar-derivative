import type { ApprovedHttpError, RawHttpResponse } from "../http-client.ts";

export type AdapterExecutionMode = "offline_fixture" | "live_smoke" | "production";
export type IntegrityStatus = "valid" | "valid_with_warnings" | "invalid";
export type AdapterExecutionStatus = "succeeded" | "failed_fetch" | "failed_parse" | "failed_normalization" | "failed_integrity" | "cancelled";

export interface AdapterDiagnostic {
  stage: "fetch" | "parse" | "normalize" | "integrity" | "execute";
  code: string;
  message: string;
  rowIndex?: number;
  recordIdentity?: string;
}

export interface IntegrityReport {
  status: IntegrityStatus;
  acceptedRecordCount: number;
  rejectedRecordCount: number;
  warningCount: number;
  errors: readonly AdapterDiagnostic[];
  warnings: readonly AdapterDiagnostic[];
  identityConflicts: readonly string[];
  canPublishCandidate: boolean;
}

export interface AdapterExecutionContext {
  runId: string;
  approvedHttpClient: (request: { resource: { sourceId: string; resourceId: string; exactUrl: string }; requestedUrl?: string; transport?: typeof fetch; now?: () => string }) => Promise<RawHttpResponse>;
  clock: () => string;
  logger?: (diagnostic: AdapterDiagnostic) => void;
  abortSignal?: AbortSignal;
  executionMode: AdapterExecutionMode;
}

export interface AdapterExecutionResult<TDomainRecord> {
  runId: string;
  sourceId: string;
  resourceId: string;
  adapterVersion: string;
  rawSchemaVersion: string;
  domainSchemaVersion: string;
  fetchedAt?: string;
  responseHash?: string;
  responseBytes?: number;
  rawRowCount: number;
  normalizedRecordCount: number;
  rejectedRecordCount: number;
  integrityReport: IntegrityReport;
  records: readonly TDomainRecord[];
  executionStatus: AdapterExecutionStatus;
  diagnostics: readonly AdapterDiagnostic[];
}

export interface SourceAdapter<TRawRecord, TDomainRecord> {
  readonly sourceId: string;
  readonly resourceId: string;
  readonly adapterVersion: string;
  readonly rawSchemaVersion: string;
  readonly domainSchemaVersion: string;
  fetchRaw(context: AdapterExecutionContext): Promise<RawHttpResponse>;
  parseRaw(response: RawHttpResponse): readonly TRawRecord[];
  normalize(rawRecords: readonly TRawRecord[], context: AdapterExecutionContext): readonly TDomainRecord[];
  validateIntegrity(rawRecords: readonly TRawRecord[], records: readonly TDomainRecord[]): IntegrityReport;
  execute(context: AdapterExecutionContext): Promise<AdapterExecutionResult<TDomainRecord>>;
}

export type AdapterFailure = ApprovedHttpError | Error;
