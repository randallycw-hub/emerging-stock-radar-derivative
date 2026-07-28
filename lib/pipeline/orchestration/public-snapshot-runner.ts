import type { SourceAdapter, AdapterExecutionContext } from "../adapters/types.ts";
import type { PipelineRepository, } from "../repositories/contracts.ts";
import type { DatasetId } from "../repositories/types.ts";
import { ingestDataset } from "./ingest-dataset.ts";
import { publishPublicSnapshot, type PublicationDecision } from "./publication-gate.ts";

const REQUIRED_DATASETS: readonly DatasetId[] = ["94025", "11406", "11586"];

export type PublicSnapshotRunnerOptions = {
  repository: PipelineRepository;
  adapters: Partial<Record<DatasetId, SourceAdapter<unknown, unknown>>>;
  clock: () => string;
  publicationRunId: string;
  executionMode: AdapterExecutionContext["executionMode"];
  approvedHttpClient: AdapterExecutionContext["approvedHttpClient"];
};

export async function runPublicSnapshotIngestion(options: PublicSnapshotRunnerOptions): Promise<PublicationDecision> {
  const candidates: Partial<Record<DatasetId, { datasetId: DatasetId; snapshot?: { snapshotId: string; sourceId: string; resourceId: string; runId: string } }>> = {};
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
    candidates[datasetId] = { datasetId, snapshot: output.snapshot && { snapshotId: output.snapshot.snapshotId, sourceId: output.snapshot.sourceId, resourceId: output.snapshot.resourceId, runId: output.snapshot.runId } };
  }
  return publishPublicSnapshot(candidates, { repository: options.repository, clock: options.clock, publicationRunId: options.publicationRunId });
}
