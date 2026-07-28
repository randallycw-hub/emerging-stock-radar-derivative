import test from "node:test";
import assert from "node:assert/strict";
import { readPublishedPublicSnapshot } from "../../lib/pipeline/read-models/public-snapshot.ts";
import { InMemoryPipelineRepository } from "../../lib/pipeline/repositories/in-memory.ts";

const required = ["94025", "11406", "11586"];
async function seed(repository, datasetId, snapshotId, publicationRunId = "publish-1", eligible = true) {
  await repository.createIngestionRun({ runId: `run-${datasetId}-${snapshotId}`, datasetId, sourceId: datasetId, resourceId: `${datasetId}-csv`, executionMode: "offline_fixture", status: "succeeded", startedAt: "2026-07-28T00:00:00.000Z", adapterVersion: "v1", rawSchemaVersion: "raw", domainSchemaVersion: "domain", createdAt: "2026-07-28T00:00:00.000Z", updatedAt: "2026-07-28T00:00:00.000Z" });
  await repository.createSnapshot({ snapshotId, runId: `run-${datasetId}-${snapshotId}`, datasetId, sourceId: datasetId, resourceId: `${datasetId}-csv`, adapterVersion: "v1", rawSchemaVersion: "raw", domainSchemaVersion: "domain", fetchedAt: "2026-07-28T00:00:00.000Z", responseHash: `sha256:${snapshotId}`, responseBytes: 1, rawRowCount: 1, acceptedRecordCount: 1, rejectedRecordCount: 0, warningCount: 0, validationStatus: eligible ? "valid" : "invalid", publicationEligibility: eligible ? "eligible" : "ineligible", createdAt: "2026-07-28T00:00:00.000Z" });
  await repository.writeDatasetRecords(datasetId, snapshotId, [{ datasetId, snapshotId, naturalIdentity: `${datasetId}:row`, value: { datasetId } }]);
  return { datasetId, sourceId: datasetId, resourceId: `${datasetId}-csv`, currentSnapshotId: snapshotId, previousSnapshotId: null, publicationRunId, publishedAt: "2026-07-28T01:00:00.000Z" };
}
async function publish(repository, pointers) { return repository.publishPointersAtomically(pointers.map((pointer) => ({ datasetId: pointer.datasetId, expectedCurrentSnapshotId: null, pointer }))); }

test("reads one complete published public snapshot", async () => {
  const repository = new InMemoryPipelineRepository();
  const pointers = [];
  for (const datasetId of required) pointers.push(await seed(repository, datasetId, `${datasetId}-snapshot`));
  await publish(repository, pointers);
  const result = await readPublishedPublicSnapshot(repository);
  assert.equal(result.status, "published");
  assert.equal(result.publicationRunId, "publish-1");
  assert.deepEqual(Object.keys(result.datasets).sort(), [...required].sort());
  assert.equal(result.datasets["94025"].records[0].naturalIdentity, "94025:row");
});

test("returns unavailable and never exposes partial datasets", async () => {
  const repository = new InMemoryPipelineRepository();
  const pointer = await seed(repository, "94025", "94025-snapshot");
  await publish(repository, [pointer]);
  const result = await readPublishedPublicSnapshot(repository);
  assert.equal(result.status, "unavailable");
  assert.equal(Object.hasOwn(result, "datasets"), false);
  assert.match(result.reasons.join(","), /MISSING_POINTER:11406/);
});

test("rejects publication pointers with mismatched run or ineligible snapshots", async () => {
  const repository = new InMemoryPipelineRepository();
  const pointers = [];
  for (const datasetId of required) pointers.push(await seed(repository, datasetId, `${datasetId}-snapshot`, datasetId === "11586" ? "publish-2" : "publish-1", datasetId !== "11406"));
  await publish(repository, pointers);
  const result = await readPublishedPublicSnapshot(repository);
  assert.equal(result.status, "unavailable");
  assert.match(result.reasons.join(","), /PUBLICATION_RUN_MISMATCH|SNAPSHOT_NOT_ELIGIBLE:11406/);
});

test("attaches optional company profiles only when their publication run aligns", async () => {
  const repository = new InMemoryPipelineRepository();
  const pointers = [];
  for (const datasetId of required) pointers.push(await seed(repository, datasetId, `${datasetId}-snapshot`));
  await publish(repository, pointers);
  const profilePointer = await seed(repository, "28567", "28567-snapshot", "publish-1");
  await publish(repository, [profilePointer]);
  const withProfile = await readPublishedPublicSnapshot(repository);
  assert.equal(withProfile.status, "published");
  assert.equal(withProfile.enrichmentStatus, "published");
  assert.equal(withProfile.enrichment.records.length, 1);
  const otherProfilePointer = await seed(repository, "28567", "28567-other", "publish-2");
  await repository.publishPointersAtomically([{ datasetId: "28567", expectedCurrentSnapshotId: "28567-snapshot", pointer: otherProfilePointer }]);
  const withoutAlignedProfile = await readPublishedPublicSnapshot(repository);
  assert.equal(withoutAlignedProfile.status, "published");
  assert.equal(withoutAlignedProfile.enrichmentStatus, "unavailable");
});
