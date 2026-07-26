import { getApprovedResource } from "../source-registry.ts";
import { BaseSourceAdapter } from "./base.ts";
import type { AdapterDiagnostic, AdapterExecutionContext, IntegrityReport } from "./types.ts";
import { assertUnique94025CompanyCodes, normalize94025Row, parse94025Csv, type NormalizedMonthlyRevenue94025, type Source94025Row } from "../../source-verification/source-94025.ts";

export class Source94025CsvAdapter extends BaseSourceAdapter<Source94025Row, NormalizedMonthlyRevenue94025> {
  private readonly fixtureResponse?: { body: Uint8Array; contentType: string; fetchedAt: string; sha256: `sha256:${string}`; responseBytes: number; };
  constructor(fixtureResponse?: { body: Uint8Array; contentType: string; fetchedAt: string; sha256: `sha256:${string}`; responseBytes: number; }) { super(); this.fixtureResponse = fixtureResponse; }
  readonly sourceId = "94025";
  readonly resourceId = "94025-csv";
  readonly adapterVersion = "94025-csv-adapter-v1";
  readonly rawSchemaVersion = "dataset-94025-raw-v1";
  readonly domainSchemaVersion = "monthly-revenue-94025-v1";

  async fetchRaw(context: AdapterExecutionContext) {
    if (this.fixtureResponse) return { sourceId: this.sourceId, resourceId: this.resourceId, requestedUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv", finalUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv", ...this.fixtureResponse, httpStatus: 200, attemptCount: 1 };
    const resource = getApprovedResource("94025", "94025-csv");
    return context.approvedHttpClient({ resource, now: context.clock });
  }

  parseRaw(response: { body: Uint8Array; contentType: string }): readonly Source94025Row[] {
    if (response.contentType !== "text/csv") { const error = new Error("CONTENT_TYPE_MISMATCH"); Object.assign(error, { code: "CONTENT_TYPE_MISMATCH" }); throw error; }
    return parse94025Csv(new TextDecoder("utf-8", { fatal: true }).decode(response.body));
  }

  normalize(rawRecords: readonly Source94025Row[]): readonly NormalizedMonthlyRevenue94025[] {
    return rawRecords.map(normalize94025Row);
  }

  validateIntegrity(rawRecords: readonly Source94025Row[], records: readonly NormalizedMonthlyRevenue94025[]): IntegrityReport {
    const errors: AdapterDiagnostic[] = [];
    const warnings: AdapterDiagnostic[] = [];
    const identityConflicts: string[] = [];
    try { assertUnique94025CompanyCodes(records); } catch (error) { identityConflicts.push(error instanceof Error ? error.message : String(error)); errors.push({ stage: "integrity", code: "DUPLICATE_IDENTITY", message: identityConflicts[0] }); }
    if (rawRecords.length !== records.length) errors.push({ stage: "integrity", code: "ROW_COUNT_MISMATCH", message: "raw and normalized row counts differ" });
    const canPublishCandidate = errors.length === 0 && records.length > 0;
    return { status: canPublishCandidate ? (warnings.length ? "valid_with_warnings" : "valid") : "invalid", acceptedRecordCount: records.length, rejectedRecordCount: Math.max(0, rawRecords.length - records.length), warningCount: warnings.length, errors, warnings, identityConflicts, canPublishCandidate };
  }
}

export function create94025CsvAdapter(fixtureResponse?: ConstructorParameters<typeof Source94025CsvAdapter>[0]): Source94025CsvAdapter { return new Source94025CsvAdapter(fixtureResponse); }
