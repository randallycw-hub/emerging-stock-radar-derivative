import type { SourceAdapter, AdapterExecutionContext, AdapterExecutionResult, AdapterDiagnostic } from "../adapters/types.ts";
import type { PipelineRepository } from "../repositories/contracts.ts";
import type { DatasetId, IngestionRunRecord, SourceSnapshotRecord } from "../repositories/types.ts";
import { RepositoryError } from "../repositories/errors.ts";
import { toDatasetRecords } from "./record-converters.ts";

type IngestOptions = {
  datasetId: DatasetId;
  adapter: SourceAdapter<unknown, unknown>;
  repository: PipelineRepository;
  clock: () => string;
  executionMode: AdapterExecutionContext["executionMode"];
  approvedHttpClient: AdapterExecutionContext["approvedHttpClient"];
  runId?: string;
};

export type IngestDatasetOutput = {
  run: IngestionRunRecord;
  snapshot?: SourceSnapshotRecord;
  records: readonly ReturnType<typeof toDatasetRecords>[number][];
  diagnostics: readonly AdapterDiagnostic[];
};

function makeRun(options: IngestOptions, result: Partial<AdapterExecutionResult<unknown>>, runId: string, now: string, status: IngestionRunRecord["status"], failureCode?: string): IngestionRunRecord {
  return {
    runId, datasetId: options.datasetId, sourceId: options.adapter.sourceId, resourceId: options.adapter.resourceId,
    executionMode: options.executionMode, status, startedAt: now, completedAt: now,
    adapterVersion: options.adapter.adapterVersion, rawSchemaVersion: options.adapter.rawSchemaVersion, domainSchemaVersion: options.adapter.domainSchemaVersion,
    fetchedAt: result.fetchedAt, responseHash: result.responseHash, responseBytes: result.responseBytes,
    rawRowCount: result.rawRowCount, normalizedRecordCount: result.normalizedRecordCount, rejectedRecordCount: result.rejectedRecordCount,
    warningCount: result.integrityReport?.warningCount, failureCode, createdAt: now, updatedAt: now,
  };
}

export async function ingestDataset(options: IngestOptions): Promise<IngestDatasetOutput> {
  const now = options.clock();
  const runId = options.runId ?? `${options.datasetId}:${now}`;
  let result: AdapterExecutionResult<unknown>;
  try {
    result = await options.adapter.execute({ runId, executionMode: options.executionMode, clock: options.clock, approvedHttpClient: options.approvedHttpClient });
  } catch (error) {
    const run = makeRun(options, {}, runId, now, "failed", error instanceof Error ? error.message : String(error));
    await options.repository.withTransaction((tx) => tx.createIngestionRun(run));
    return { run, records: [], diagnostics: [{ stage: "execute", code: "EXECUTION_ERROR", message: error instanceof Error ? error.message : String(error) }] };
  }

  if (result.runId !== runId) throw new RepositoryError("RUN_ID_MISMATCH");
  const effectiveRunId = runId;
  const successful = result.executionStatus === "succeeded";
  const run = makeRun(options, result, effectiveRunId, now, successful ? "succeeded" : "failed", successful ? undefined : result.executionStatus);
  if (!successful) {
    await options.repository.withTransaction((tx) => tx.createIngestionRun(run));
    return { run, records: [], diagnostics: result.diagnostics };
  }
  if (!result.fetchedAt || !result.responseHash || result.responseBytes === undefined) throw new RepositoryError("SNAPSHOT_METADATA_INCOMPLETE");
  if (result.records.length !== result.normalizedRecordCount || result.normalizedRecordCount !== result.integrityReport.acceptedRecordCount || result.rawRowCount !== result.normalizedRecordCount + result.integrityReport.rejectedRecordCount || result.rejectedRecordCount !== result.integrityReport.rejectedRecordCount) throw new RepositoryError("RESULT_COUNT_MISMATCH");
  const snapshotId = `${options.datasetId}:${result.responseHash}`;
  const records = toDatasetRecords(options.datasetId, snapshotId, result);
  const snapshot: SourceSnapshotRecord = {
    snapshotId, runId: effectiveRunId, datasetId: options.datasetId, sourceId: result.sourceId, resourceId: result.resourceId,
    adapterVersion: result.adapterVersion, rawSchemaVersion: result.rawSchemaVersion, domainSchemaVersion: result.domainSchemaVersion,
    fetchedAt: result.fetchedAt, responseHash: result.responseHash, responseBytes: result.responseBytes, rawRowCount: result.rawRowCount,
    acceptedRecordCount: result.integrityReport.acceptedRecordCount, rejectedRecordCount: result.integrityReport.rejectedRecordCount,
    warningCount: result.integrityReport.warningCount, validationStatus: result.integrityReport.status,
    publicationEligibility: result.integrityReport.canPublishCandidate ? "eligible" : "ineligible", createdAt: now,
  };
  await options.repository.withTransaction((tx) => tx.persistIngestionCandidate(run, snapshot, records));
  return { run, snapshot, records, diagnostics: result.diagnostics };
}
