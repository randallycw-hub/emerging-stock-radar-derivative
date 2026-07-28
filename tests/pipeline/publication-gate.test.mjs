import test from "node:test";
import assert from "node:assert/strict";
import { publishPublicSnapshot } from "../../lib/pipeline/orchestration/publication-gate.ts";
import { InMemoryPipelineRepository } from "../../lib/pipeline/repositories/in-memory.ts";

const required = ["94025", "11406", "11586"];
async function seed(repository, datasetId, snapshotId, eligible = true) {
  await repository.createIngestionRun({ runId: `run-${datasetId}`, datasetId, sourceId: datasetId, resourceId: `${datasetId}-csv`, executionMode: "offline_fixture", status: "succeeded", startedAt: "2026-07-28T00:00:00.000Z", adapterVersion: "v1", rawSchemaVersion: "raw", domainSchemaVersion: "domain", createdAt: "2026-07-28T00:00:00.000Z", updatedAt: "2026-07-28T00:00:00.000Z" });
  await repository.createSnapshot({ snapshotId, runId: `run-${datasetId}`, datasetId, sourceId: datasetId, resourceId: `${datasetId}-csv`, adapterVersion: "v1", rawSchemaVersion: "raw", domainSchemaVersion: "domain", fetchedAt: "2026-07-28T00:00:00.000Z", responseHash: `sha256:${datasetId}`, responseBytes: 1, rawRowCount: 1, acceptedRecordCount: 1, rejectedRecordCount: 0, warningCount: 0, validationStatus: eligible ? "valid" : "invalid", publicationEligibility: eligible ? "eligible" : "ineligible", createdAt: "2026-07-28T00:00:00.000Z" });
}
function candidate(datasetId, snapshotId) { return { datasetId, snapshot: { snapshotId, sourceId: datasetId, resourceId: `${datasetId}-csv`, runId: `run-${datasetId}` } }; }

test("publishes one coherent pointer set only when all three datasets are eligible", async () => {
  const repository = new InMemoryPipelineRepository();
  for (const datasetId of required) await seed(repository, datasetId, `${datasetId}-snapshot`);
  const decision = await publishPublicSnapshot({ "94025": candidate("94025", "94025-snapshot"), "11406": candidate("11406", "11406-snapshot"), "11586": candidate("11586", "11586-snapshot") }, { repository, clock: () => "2026-07-28T01:00:00.000Z", publicationRunId: "publish-1" });
  assert.equal(decision.published, true);
  assert.equal((await repository.getPublishedSnapshotPointer("94025")).currentSnapshotId, "94025-snapshot");
});

test("blocks missing or ineligible datasets without moving any pointer", async () => {
  const repository = new InMemoryPipelineRepository();
  await seed(repository, "94025", "old-94025");
  const decision = await publishPublicSnapshot({ "94025": candidate("94025", "old-94025"), "11406": undefined, "11586": undefined }, { repository, clock: () => "2026-07-28T01:00:00.000Z", publicationRunId: "publish-2" });
  assert.equal(decision.published, false);
  assert.deepEqual(await repository.getPublishedSnapshotPointer("94025"), undefined);
});

test("reports a compare-and-set conflict as unpublished", async () => {
  const repository = new InMemoryPipelineRepository();
  for (const datasetId of required) await seed(repository, datasetId, `${datasetId}-snapshot`);
  const conflicting = {
    getSnapshot: repository.getSnapshot.bind(repository),
    getPublishedSnapshotPointer: repository.getPublishedSnapshotPointer.bind(repository),
    withTransaction: async (operation) => operation({ publishPointersAtomically: async () => false }),
  };
  const decision = await publishPublicSnapshot({ "94025": candidate("94025", "94025-snapshot"), "11406": candidate("11406", "11406-snapshot"), "11586": candidate("11586", "11586-snapshot") }, { repository: conflicting, clock: () => "2026-07-28T01:00:00.000Z", publicationRunId: "publish-3" });
  assert.equal(decision.published, false);
  assert.match(decision.reasons.join(","), /POINTER_CONFLICT/);
});
