import type { SourceAdapter, AdapterExecutionContext, AdapterDiagnostic } from "../adapters/types.ts";
import type { PipelineRepository, } from "../repositories/contracts.ts";
import type { DatasetId } from "../repositories/types.ts";
import { ingestDataset } from "./ingest-dataset.ts";
import { publishPublicSnapshot, type PublicationDecision } from "./publication-gate.ts";
import { evaluateSnapshotCandidate } from "../quality-gates.ts";

const REQUIRED_DATASETS: readonly DatasetId[] = ["94025", "11406", "11586"];

export type PublicSnapshotRunnerOptions = {
  repository: PipelineRepository;
  adapters: Partial<Record<DatasetId, SourceAdapter<unknown, unknown>>>;
  clock: () => string;
  publicationRunId: string;
  executionMode: AdapterExecutionContext["executionMode"];
  approvedHttpClient: AdapterExecutionContext["approvedHttpClient"];
};

export type PublicSnapshotIngestionDecision = PublicationDecision & { diagnostics: Partial<Record<DatasetId, readonly AdapterDiagnostic[]>> };

export async function runPublicSnapshotIngestion(options: PublicSnapshotRunnerOptions): Promise<PublicSnapshotIngestionDecision> {
  const candidates: Partial<Record<DatasetId, { datasetId: DatasetId; snapshot?: { snapshotId: string; sourceId: string; resourceId: string; runId: string } }>> = {};
  const failures = new Map<DatasetId, string>();
  const qualityFailures = new Map<DatasetId, readonly string[]>();
  const diagnostics: Partial<Record<DatasetId, readonly AdapterDiagnostic[]>> = {};
  for (const datasetId of REQUIRED_DATASETS) {
    const adapter = options.adapters[datasetId];
    if (!adapter) continue;
    const output = await ingestDataset({
      datasetId,
      adapter,
      repository: options.repository,
      clock: options.clock,
      executionMode: options.executionMode,
      approvedHttpClient: options.approvedHttpClient,
      runId: `${options.publicationRunId}:${datasetId}`,
    });
    if (output.run.status !== "succeeded") failures.set(datasetId, output.run.failureCode ?? "UNKNOWN");
    diagnostics[datasetId] = output.diagnostics;
    let qualityEligible = true;
    if (output.snapshot) {
      const pointer = await options.repository.getPublishedSnapshotPointer(datasetId);
      const previous = pointer
        ? await options.repository.getSnapshot(pointer.currentSnapshotId)
        : undefined;
      const quality = evaluateSnapshotCandidate({
        previous: previous
          ? {
            acceptedRecordCount: previous.acceptedRecordCount,
            rejectedRecordCount: previous.rejectedRecordCount,
            fetchedAt: previous.fetchedAt,
          }
          : null,
        candidate: {
          acceptedRecordCount: output.snapshot.acceptedRecordCount,
          rejectedRecordCount: output.snapshot.rejectedRecordCount,
          fetchedAt: output.snapshot.fetchedAt,
        },
      });
      qualityEligible = quality.eligible;
      if (!quality.eligible) qualityFailures.set(datasetId, quality.reasons);
    }
    candidates[datasetId] = {
      datasetId,
      snapshot: output.snapshot && qualityEligible
        ? {
          snapshotId: output.snapshot.snapshotId,
          sourceId: output.snapshot.sourceId,
          resourceId: output.snapshot.resourceId,
          runId: output.snapshot.runId,
        }
        : undefined,
    };
  }
  const decision = await publishPublicSnapshot(candidates, { repository: options.repository, clock: options.clock, publicationRunId: options.publicationRunId });
  return { ...decision, diagnostics, reasons: decision.reasons.map((reason) => {
    const match = /^MISSING_DATASET:(.+)$/.exec(reason);
    const datasetId = match?.[1] as DatasetId | undefined;
    if (!datasetId) return reason;
    if (failures.has(datasetId)) return `INGESTION_FAILED:${datasetId}:${failures.get(datasetId)}`;
    const qualityReasons = qualityFailures.get(datasetId);
    if (qualityReasons) return qualityReasons
      .map((code) => `QUALITY_GATE:${datasetId}:${code}`)
      .join("|");
    return reason;
  }) };
}
