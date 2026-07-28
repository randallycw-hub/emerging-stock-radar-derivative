import type { PipelineRepository } from "../repositories/contracts.ts";
import type { DatasetId, PublishedSnapshotPointer } from "../repositories/types.ts";

const REQUIRED_DATASETS: readonly DatasetId[] = ["94025", "11406", "11586"];
type Candidate = { datasetId: DatasetId; snapshot?: { snapshotId: string; sourceId: string; resourceId: string; runId: string } } | undefined;
export type PublicationDecision = { published: boolean; publicationRunId: string; snapshotIds: Partial<Record<DatasetId, string>>; reasons: readonly string[]; publishedAt: string };

export async function publishPublicSnapshot(candidates: Partial<Record<DatasetId, Candidate>>, options: { repository: PipelineRepository; clock: () => string; publicationRunId: string }): Promise<PublicationDecision> {
  const publishedAt = options.clock();
  const snapshotIds: Partial<Record<DatasetId, string>> = {};
  const reasons: string[] = [];
  const updates: Array<{ datasetId: DatasetId; expectedCurrentSnapshotId: string | null; pointer: PublishedSnapshotPointer }> = [];
  for (const datasetId of REQUIRED_DATASETS) {
    const candidate = candidates[datasetId];
    if (!candidate?.snapshot) { reasons.push(`MISSING_DATASET:${datasetId}`); continue; }
    const snapshot = await options.repository.getSnapshot(candidate.snapshot.snapshotId);
    if (!snapshot || snapshot.datasetId !== datasetId || snapshot.sourceId !== candidate.snapshot.sourceId || snapshot.resourceId !== candidate.snapshot.resourceId) { reasons.push(`SNAPSHOT_SCOPE_MISMATCH:${datasetId}`); continue; }
    if (snapshot.publicationEligibility !== "eligible" || snapshot.validationStatus === "invalid" || snapshot.rejectedRecordCount !== 0) { reasons.push(`SNAPSHOT_NOT_ELIGIBLE:${datasetId}`); continue; }
    const current = await options.repository.getPublishedSnapshotPointer(datasetId);
    snapshotIds[datasetId] = snapshot.snapshotId;
    updates.push({ datasetId, expectedCurrentSnapshotId: current?.currentSnapshotId ?? null, pointer: { datasetId, sourceId: snapshot.sourceId, resourceId: snapshot.resourceId, currentSnapshotId: snapshot.snapshotId, previousSnapshotId: current?.currentSnapshotId ?? null, publicationRunId: options.publicationRunId, publishedAt } });
  }
  if (reasons.length > 0) return { published: false, publicationRunId: options.publicationRunId, snapshotIds, reasons, publishedAt };
  const published = await options.repository.withTransaction((tx) => tx.publishPointersAtomically(updates));
  return { published, publicationRunId: options.publicationRunId, snapshotIds, reasons: published ? [] : ["POINTER_CONFLICT"], publishedAt };
}
