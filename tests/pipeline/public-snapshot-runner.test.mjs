import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryPipelineRepository } from "../../lib/pipeline/repositories/in-memory.ts";
import { runPublicSnapshotIngestion } from "../../lib/pipeline/orchestration/public-snapshot-runner.ts";

const required = ["94025", "11406", "11586"];

function adapter(datasetId, overrides = {}) {
  const recordCount = overrides.recordCount ?? 1;
  const records = Array.from({ length: recordCount }, (_, index) => datasetId === "94025"
    ? { companyCode: `${datasetId}${index}`, companyName: `Company ${datasetId} ${index}`, yearMonth: "2026-06" }
    : datasetId === "11406"
      ? { bondId: `${datasetId}-${index}`, bondName: `Bond ${datasetId} ${index}` }
      : { sourceRecordId: `${datasetId}-${index}`, companyCode: `${datasetId}${index}` });
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
      rawRowCount: recordCount,
      normalizedRecordCount: recordCount,
      rejectedRecordCount: 0,
      integrityReport: { status: "valid", acceptedRecordCount: recordCount, rejectedRecordCount: 0, warningCount: 0, errors: [], warnings: [], identityConflicts: [], canPublishCandidate: true },
      records,
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
  adapters["11406"] = adapter("11406", { executionStatus: "failed_fetch", records: [], rawRowCount: 0, normalizedRecordCount: 0, diagnostics: [{ stage: "fetch", code: "NETWORK_ERROR", message: "network request failed" }] });
  const result = await runPublicSnapshotIngestion(options(repository, adapters));
  assert.equal(result.published, false);
  assert.match(result.reasons.join(","), /INGESTION_FAILED:11406:failed_fetch/);
  assert.equal(result.diagnostics["11406"][0].code, "NETWORK_ERROR");
  for (const datasetId of required) assert.equal(await repository.getPublishedSnapshotPointer(datasetId), undefined);
});

test("keeps the prior published pointer when a verified candidate has a material row-count collapse", async () => {
  const repository = new InMemoryPipelineRepository();
  const initialAdapters = Object.fromEntries(required.map((datasetId) => [datasetId, adapter(datasetId, { recordCount: 4 })]));
  const initial = await runPublicSnapshotIngestion(options(repository, initialAdapters));
  assert.equal(initial.published, true);
  const priorPointer = await repository.getPublishedSnapshotPointer("11406");

  const nextAdapters = Object.fromEntries(required.map((datasetId) => [datasetId, adapter(datasetId, {
    recordCount: datasetId === "11406" ? 2 : 4,
    responseHash: `sha256:next-${datasetId}`,
  })]));
  const result = await runPublicSnapshotIngestion({
    ...options(repository, nextAdapters),
    publicationRunId: "publication-2",
    clock: () => "2026-07-29T01:00:00.000Z",
  });

  assert.equal(result.published, false);
  assert.match(result.reasons.join(","), /QUALITY_GATE:11406:ROW_COUNT_COLLAPSE/);
  assert.equal((await repository.getPublishedSnapshotPointer("11406"))?.currentSnapshotId, priorPointer?.currentSnapshotId);
});
