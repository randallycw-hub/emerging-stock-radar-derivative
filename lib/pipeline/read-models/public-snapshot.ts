import type { PipelineRepository } from "../repositories/contracts.ts";
import type { DatasetId, DatasetRecord } from "../repositories/types.ts";

type PublicDatasetId = "94025" | "11406" | "11586";
const REQUIRED_DATASETS: readonly PublicDatasetId[] = ["94025", "11406", "11586"];
const SOURCE_SCOPE: Record<DatasetId, { sourceId: string; resourceId: string }> = {
  "94025": { sourceId: "94025", resourceId: "94025-csv" },
  "11406": { sourceId: "11406", resourceId: "11406-csv" },
  "11586": { sourceId: "11586", resourceId: "11586-csv" },
  "28567": { sourceId: "28567", resourceId: "28567-csv" },
};

export type PublishedDatasetRead = { snapshotId: string; sourceId: string; resourceId: string; records: readonly DatasetRecord[] };
export type PublishedPublicSnapshot = { status: "published"; publicationRunId: string; publishedAt: string; datasets: Record<PublicDatasetId, PublishedDatasetRead>; enrichmentStatus: "published" | "unavailable"; enrichment?: PublishedDatasetRead };
export type UnavailablePublicSnapshot = { status: "unavailable"; reasons: readonly string[] };
export type PublicSnapshotReadModel = PublishedPublicSnapshot | UnavailablePublicSnapshot;

export async function readPublishedPublicSnapshot(repository: PipelineRepository): Promise<PublicSnapshotReadModel> {
  const reasons: string[] = [];
  const pointers = new Map<DatasetId, NonNullable<Awaited<ReturnType<PipelineRepository["getPublishedSnapshotPointer"]>>>>();
  for (const datasetId of REQUIRED_DATASETS) {
    const pointer = await repository.getPublishedSnapshotPointer(datasetId);
    if (!pointer) reasons.push(`MISSING_POINTER:${datasetId}`);
    else pointers.set(datasetId, pointer);
  }
  if (reasons.length) return { status: "unavailable", reasons };

  const firstPointer = pointers.get(REQUIRED_DATASETS[0]);
  if (!firstPointer) return { status: "unavailable", reasons: ["MISSING_POINTER:94025"] };
  const datasets = {} as PublishedPublicSnapshot["datasets"];
  for (const datasetId of REQUIRED_DATASETS) {
    const pointer = pointers.get(datasetId)!;
    const scope = SOURCE_SCOPE[datasetId];
    if (pointer.datasetId !== datasetId || pointer.sourceId !== scope.sourceId || pointer.resourceId !== scope.resourceId) reasons.push(`POINTER_SCOPE_MISMATCH:${datasetId}`);
    if (pointer.publicationRunId !== firstPointer.publicationRunId || pointer.publishedAt !== firstPointer.publishedAt) reasons.push(`PUBLICATION_RUN_MISMATCH:${datasetId}`);
    const snapshot = await repository.getSnapshot(pointer.currentSnapshotId);
    if (!snapshot || snapshot.datasetId !== datasetId || snapshot.snapshotId !== pointer.currentSnapshotId || snapshot.sourceId !== scope.sourceId || snapshot.resourceId !== scope.resourceId) reasons.push(`SNAPSHOT_SCOPE_MISMATCH:${datasetId}`);
    else if (snapshot.publicationEligibility !== "eligible" || snapshot.validationStatus === "invalid" || snapshot.rejectedRecordCount !== 0) reasons.push(`SNAPSHOT_NOT_ELIGIBLE:${datasetId}`);
    if (snapshot) {
      try {
        const records = await repository.readDatasetRecords(datasetId, pointer.currentSnapshotId);
        datasets[datasetId] = { snapshotId: pointer.currentSnapshotId, sourceId: pointer.sourceId, resourceId: pointer.resourceId, records: structuredClone(records) };
      } catch {
        reasons.push(`DATASET_READ_FAILED:${datasetId}`);
      }
    }
  }
  if (reasons.length) return { status: "unavailable", reasons };
  let enrichmentStatus: PublishedPublicSnapshot["enrichmentStatus"] = "unavailable";
  let enrichment: PublishedDatasetRead | undefined;
  const profilePointer = await repository.getPublishedSnapshotPointer("28567");
  if (profilePointer && profilePointer.publicationRunId === firstPointer.publicationRunId && profilePointer.publishedAt === firstPointer.publishedAt && profilePointer.sourceId === SOURCE_SCOPE["28567"].sourceId && profilePointer.resourceId === SOURCE_SCOPE["28567"].resourceId) {
    const profileSnapshot = await repository.getSnapshot(profilePointer.currentSnapshotId);
    if (profileSnapshot && profileSnapshot.datasetId === "28567" && profileSnapshot.publicationEligibility === "eligible" && profileSnapshot.validationStatus !== "invalid" && profileSnapshot.rejectedRecordCount === 0) {
      try {
        enrichment = { snapshotId: profilePointer.currentSnapshotId, sourceId: profilePointer.sourceId, resourceId: profilePointer.resourceId, records: structuredClone(await repository.readDatasetRecords("28567", profilePointer.currentSnapshotId)) };
        enrichmentStatus = "published";
      } catch {
        enrichmentStatus = "unavailable";
      }
    }
  }
  return { status: "published", publicationRunId: firstPointer.publicationRunId, publishedAt: firstPointer.publishedAt, datasets, enrichmentStatus, ...(enrichment ? { enrichment } : {}) };
}
