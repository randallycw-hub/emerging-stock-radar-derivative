import { getApprovedResource } from "../source-registry.ts";
import { BaseSourceAdapter } from "./base.ts";
import type { AdapterDiagnostic, AdapterExecutionContext, IntegrityReport } from "./types.ts";
import { normalize11406Row, parse11406Csv, type NormalizedBondIssue11406, type Source11406Row } from "../../source-verification/source-11406.ts";

export class Source11406CsvAdapter extends BaseSourceAdapter<Source11406Row, NormalizedBondIssue11406> {
  readonly sourceId = "11406"; readonly resourceId = "11406-csv"; readonly adapterVersion = "11406-csv-adapter-v1"; readonly rawSchemaVersion = "dataset-11406-raw-v1"; readonly domainSchemaVersion = "bond-issuance-11406-v1";
  private readonly fixtureResponse?: { body: Uint8Array; contentType: string; fetchedAt: string; sha256: `sha256:${string}`; responseBytes: number };
  constructor(fixtureResponse?: { body: Uint8Array; contentType: string; fetchedAt: string; sha256: `sha256:${string}`; responseBytes: number }) { super(); this.fixtureResponse = fixtureResponse; }
  async fetchRaw(context: AdapterExecutionContext) { if (this.fixtureResponse) return { sourceId: this.sourceId, resourceId: this.resourceId, requestedUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv", finalUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv", ...this.fixtureResponse, httpStatus: 200, attemptCount: 1 }; return context.approvedHttpClient({ resource: getApprovedResource("11406", "11406-csv"), now: context.clock }); }
  parseRaw(response: { body: Uint8Array; contentType: string }): readonly Source11406Row[] { if (response.contentType !== "text/csv") throw new Error("CONTENT_TYPE_MISMATCH"); return parse11406Csv(new TextDecoder("utf-8", { fatal: true }).decode(response.body)); }
  normalize(rows: readonly Source11406Row[]): readonly NormalizedBondIssue11406[] {
    return rows.map((row) => {
      // The live export occasionally sends only one half of an outstanding
      // balance-change pair.  Keep the v1 contract fail-closed by omitting the
      // incomplete pair while retaining the bond record.
      const hasDate = row.outstandingChangeDate.trim() !== "" && row.outstandingChangeDate.trim() !== "-";
      const hasReason = row.outstandingChangeReason.trim() !== "" && row.outstandingChangeReason.trim() !== "-";
      const candidate = hasDate === hasReason ? row : { ...row, outstandingChangeDate: "", outstandingChangeReason: "" };
      try {
        return normalize11406Row(candidate);
      } catch (error) {
        if (error instanceof Error && error.message === "outstanding change date and reason must be present as a pair") {
          return normalize11406Row({ ...row, outstandingChangeDate: "", outstandingChangeReason: "" });
        }
        throw error;
      }
    });
  }
  validateIntegrity(raw: readonly Source11406Row[], records: readonly NormalizedBondIssue11406[]): IntegrityReport { const errors: AdapterDiagnostic[] = []; const conflicts: string[] = []; const seen = new Set<string>(); for (const record of records) { const identity = record.bondCode ?? record.bondId; if (seen.has(identity)) { conflicts.push(identity); errors.push({ stage: "integrity", code: "DUPLICATE_IDENTITY", message: `duplicate bond identity: ${identity}`, recordIdentity: identity }); } seen.add(identity); } if (raw.length !== records.length) errors.push({ stage: "integrity", code: "ROW_COUNT_MISMATCH", message: "raw and normalized row counts differ" }); const ok = errors.length === 0 && records.length > 0; return { status: ok ? "valid" : "invalid", acceptedRecordCount: records.length, rejectedRecordCount: Math.max(0, raw.length - records.length), warningCount: 0, errors, warnings: [], identityConflicts: conflicts, canPublishCandidate: ok }; }
}
export function create11406CsvAdapter(fixtureResponse?: ConstructorParameters<typeof Source11406CsvAdapter>[0]): Source11406CsvAdapter { return new Source11406CsvAdapter(fixtureResponse); }
