import assert from "node:assert/strict";
import type { AdapterExecutionContext, SourceAdapter } from "./types.ts";

export async function runSourceAdapterContractTests<TRawRecord, TDomainRecord>(factory: () => SourceAdapter<TRawRecord, TDomainRecord>): Promise<void> {
  const adapter = factory();
  assert.ok(adapter.sourceId);
  assert.ok(adapter.resourceId);
  assert.ok(adapter.adapterVersion);
  assert.ok(adapter.rawSchemaVersion);
  assert.ok(adapter.domainSchemaVersion);
  const context: AdapterExecutionContext = {
    runId: "contract-run-1", executionMode: "offline_fixture", clock: () => "2026-07-26T00:00:00.000Z",
    approvedHttpClient: async ({ resource }) => ({ sourceId: resource.sourceId, resourceId: resource.resourceId, requestedUrl: resource.exactUrl, finalUrl: resource.exactUrl, fetchedAt: "2026-07-26T00:00:00.000Z", httpStatus: 200, contentType: "text/csv", responseBytes: 1, sha256: "sha256:contract" as `sha256:${string}`, body: new Uint8Array([1]), attemptCount: 1 }),
  };
  const result = await adapter.execute(context);
  assert.equal(result.runId, context.runId);
  assert.equal(result.sourceId, adapter.sourceId);
  assert.equal(result.resourceId, adapter.resourceId);
  assert.equal(result.executionStatus, "succeeded");
  assert.equal(result.integrityReport.canPublishCandidate, true);
  assert.equal(result.records.length, result.normalizedRecordCount);
  assert.equal(result.rawRowCount, result.normalizedRecordCount);
}
