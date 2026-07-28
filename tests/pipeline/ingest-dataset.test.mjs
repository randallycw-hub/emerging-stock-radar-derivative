import test from "node:test";
import assert from "node:assert/strict";
import { ingestDataset } from "../../lib/pipeline/orchestration/ingest-dataset.ts";
import { InMemoryPipelineRepository } from "../../lib/pipeline/repositories/in-memory.ts";

function adapter(result) {
  return { sourceId: result.sourceId, resourceId: result.resourceId, adapterVersion: "adapter-v1", rawSchemaVersion: "raw-v1", domainSchemaVersion: "domain-v1", execute: async () => result };
}

function result(overrides = {}) {
  return {
    runId: "run-1", sourceId: "94025", resourceId: "94025-csv", adapterVersion: "adapter-v1", rawSchemaVersion: "raw-v1", domainSchemaVersion: "domain-v1", fetchedAt: "2026-07-28T00:00:00.000Z", responseHash: "sha256:one", responseBytes: 10, rawRowCount: 1, normalizedRecordCount: 1, rejectedRecordCount: 0, integrityReport: { status: "valid", acceptedRecordCount: 1, rejectedRecordCount: 0, warningCount: 0, errors: [], warnings: [], identityConflicts: [], canPublishCandidate: true }, records: [{ companyCode: "A1", companyName: "Alpha", industryName: "Tech", yearMonth: "2026-06", sourcePublishedOn: "2026-07-01", revenueUnit: "仟元", currentMonthRevenue: "10" }], executionStatus: "succeeded", diagnostics: [], ...overrides,
  };
}

test("persists a successful adapter result as an immutable snapshot and records", async () => {
  const repository = new InMemoryPipelineRepository();
  const output = await ingestDataset({ datasetId: "94025", adapter: adapter(result()), repository, clock: () => "2026-07-28T01:00:00.000Z", executionMode: "offline_fixture", approvedHttpClient: async () => { throw new Error("unused"); } });
  assert.equal(output.snapshot.snapshotId, "94025:sha256:one");
  assert.equal((await repository.getSnapshot(output.snapshot.snapshotId))?.publicationEligibility, "eligible");
  assert.equal((await repository.readDatasetRecords("94025", output.snapshot.snapshotId)).length, 1);
  assert.equal(await repository.getPublishedSnapshotPointer("94025"), undefined);
});

test("persists an invalid result as an ineligible snapshot without publishing", async () => {
  const repository = new InMemoryPipelineRepository();
  const output = await ingestDataset({ datasetId: "94025", adapter: adapter(result({ integrityReport: { ...result().integrityReport, status: "invalid", canPublishCandidate: false, rejectedRecordCount: 1 }, rejectedRecordCount: 1 })), repository, clock: () => "2026-07-28T01:00:00.000Z", executionMode: "offline_fixture", approvedHttpClient: async () => { throw new Error("unused"); } });
  assert.equal(output.snapshot.publicationEligibility, "ineligible");
  assert.equal(await repository.getPublishedSnapshotPointer("94025"), undefined);
});

test("records adapter failure and leaves prior data untouched", async () => {
  const repository = new InMemoryPipelineRepository();
  const output = await ingestDataset({ datasetId: "94025", adapter: adapter(result({ executionStatus: "failed_parse", records: [], rawRowCount: 0, normalizedRecordCount: 0 })), repository, clock: () => "2026-07-28T01:00:00.000Z", executionMode: "offline_fixture", approvedHttpClient: async () => { throw new Error("unused"); } });
  assert.equal(output.snapshot, undefined);
  assert.equal(output.run.status, "failed");
  assert.equal((await repository.getIngestionRun("run-1"))?.failureCode, "failed_parse");
});
