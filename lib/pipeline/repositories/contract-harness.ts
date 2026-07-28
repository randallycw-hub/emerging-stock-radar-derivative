import assert from "node:assert/strict";
import type { PipelineRepository } from "./contracts.ts";
export async function runPipelineRepositoryContractTests(createRepository: () => PipelineRepository): Promise<void> {
  const repo = createRepository();
  assert.ok(repo.withTransaction); assert.ok(repo.createIngestionRun); assert.ok(repo.createSnapshot); assert.ok(repo.writeDatasetRecords); assert.ok(repo.persistIngestionCandidate); assert.ok(repo.compareAndSetPublishedSnapshotPointer); assert.ok(repo.publishPointersAtomically);
}
