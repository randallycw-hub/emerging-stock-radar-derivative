import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryPipelineRepository } from "../../lib/pipeline/repositories/in-memory.ts";
import { runPublicSnapshotIngestion } from "../../lib/pipeline/orchestration/public-snapshot-runner.ts";

const required = ["94025", "11406", "11586"];

function adapter(datasetId, overrides = {}) {
  return {
    sourceId: datasetId,
    resourceId: `${datasetId}-csv`,
    adapterVersion: "adapter-v1",
    rawSchemaVersion: "raw-v1",
    domainSchemaVersion: "domain-v1",
    execute: async ({ runId }) => ({
      runId,
      sourceId: datasetId,
      resourceId: `${datasetId}-csv`,
      adapterVersion: "adapter-v1",
      rawSchemaVersion: "raw-v1",
      domainSchemaVersion: "domain-v1",
      fetchedAt: "2026-07-28T00:00:00.000Z",
      responseHash: `sha256:${datasetId}`,
      responseBytes: 10,
      rawRowCount: 1,
      normalizedRecordCount: 1,
      rejectedRecordCount: 0,
      integrityReport: { status: "valid", acceptedRecordCount: 1, rejectedRecordCount: 0, warningCount: 0, errors: [], warnings: [], identityConflicts: [], canPublishCandidate: true },
      records: [datasetId === "94025"
        ? { companyCode: datasetId, companyName: `Company ${datasetId}`, yearMonth: "2026-06" }
        : datasetId === "11406"
          ? { bondId: datasetId, bondName: `Bond ${datasetId}` }
          : { sourceRecordId: datasetId, companyCode: datasetId }],
      executionStatus: "succeeded",
      diagnostics: [],
      ...overrides,
    }),
  };
}

function options(repository, adapters) {
  return {
    repository,
    adapters,
    clock: () => "2026-07-28T01:00:00.000Z",
    publicationRunId: "publication-1",
    executionMode: "offline_fixture",
    approvedHttpClient: async () => { throw new Error("unused"); },
  };
}

test("publishes the required datasets atomically after all ingestions succeed", async () => {
  const repository = new InMemoryPipelineRepository();
  const result = await runPublicSnapshotIngestion(options(repository, Object.fromEntries(required.map((datasetId) => [datasetId, adapter(datasetId)]))));
  assert.equal(result.published, true);
  for (const datasetId of required) assert.equal((await repository.getPublishedSnapshotPointer(datasetId))?.publicationRunId, "publication-1");
});

test("does not move any pointer when one required ingestion fails", async () => {
  const repository = new InMemoryPipelineRepository();
  const adapters = Object.fromEntries(required.map((datasetId) => [datasetId, adapter(datasetId)]));
  adapters["11406"] = adapter("11406", { executionStatus: "failed_fetch", records: [], rawRowCount: 0, normalizedRecordCount: 0 });
  const result = await runPublicSnapshotIngestion(options(repository, adapters));
  assert.equal(result.published, false);
  assert.match(result.reasons.join(","), /INGESTION_FAILED:11406:failed_fetch/);
  for (const datasetId of required) assert.equal(await repository.getPublishedSnapshotPointer(datasetId), undefined);
});
