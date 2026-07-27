import { getApprovedResource } from "../source-registry.ts";
import { BaseSourceAdapter } from "./base.ts";
import type { AdapterDiagnostic, AdapterExecutionContext, IntegrityReport } from "./types.ts";
import { assertUnique28567Identities, normalize28567Row, parse28567Csv, type NormalizedCompany28567, type Source28567Row } from "../../source-verification/source-28567.ts";

export class Source28567CsvAdapter extends BaseSourceAdapter<Source28567Row, NormalizedCompany28567> {
  readonly sourceId = "28567"; readonly resourceId = "28567-csv"; readonly adapterVersion = "28567-csv-adapter-v1"; readonly rawSchemaVersion = "dataset-28567-raw-v1"; readonly domainSchemaVersion = "public-company-28567-v1";
  async fetchRaw(context: AdapterExecutionContext) { return context.approvedHttpClient({ resource: getApprovedResource("28567", "28567-csv"), now: context.clock }); }
  parseRaw(response: { body: Uint8Array; contentType: string }): readonly Source28567Row[] { if (response.contentType !== "text/csv") throw new Error("CONTENT_TYPE_MISMATCH"); return parse28567Csv(new TextDecoder("utf-8", { fatal: true }).decode(response.body)); }
  normalize(rows: readonly Source28567Row[]): readonly NormalizedCompany28567[] { return rows.map(normalize28567Row); }
  validateIntegrity(raw: readonly Source28567Row[], records: readonly NormalizedCompany28567[]): IntegrityReport { const errors: AdapterDiagnostic[] = []; const conflicts: string[] = []; try { assertUnique28567Identities(records); } catch (e) { conflicts.push(e instanceof Error ? e.message : String(e)); errors.push({ stage: "integrity", code: "DUPLICATE_IDENTITY", message: conflicts[0] }); } if (raw.length !== records.length) errors.push({ stage: "integrity", code: "ROW_COUNT_MISMATCH", message: "raw and normalized row counts differ" }); const ok = errors.length === 0 && records.length > 0; return { status: ok ? "valid" : "invalid", acceptedRecordCount: records.length, rejectedRecordCount: Math.max(0, raw.length - records.length), warningCount: 0, errors, warnings: [], identityConflicts: conflicts, canPublishCandidate: ok }; }
}
export function create28567CsvAdapter(): Source28567CsvAdapter { return new Source28567CsvAdapter(); }
