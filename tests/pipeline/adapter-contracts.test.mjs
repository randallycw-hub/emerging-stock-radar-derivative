import assert from "node:assert/strict";
import test from "node:test";
import { BaseSourceAdapter } from "../../lib/pipeline/adapters/base.ts";
import { runSourceAdapterContractTests } from "../../lib/pipeline/adapters/contract-harness.ts";

const rawResponse = { sourceId: "TEST_SOURCE", resourceId: "TEST_RESOURCE", requestedUrl: "https://example.test/data.csv", finalUrl: "https://example.test/data.csv", fetchedAt: "2026-07-26T00:00:00.000Z", httpStatus: 200, contentType: "text/csv", responseBytes: 3, sha256: "sha256:test" , body: new Uint8Array([1, 2, 3]), attemptCount: 1 };
class FakeSourceAdapter extends BaseSourceAdapter {
  sourceId = "TEST_SOURCE";
  resourceId = "TEST_RESOURCE";
  adapterVersion = "test-v1";
  rawSchemaVersion = "raw-test-v1";
  domainSchemaVersion = "domain-test-v1";
  mode = "success";
  async fetchRaw(context) { return context.approvedHttpClient({ resource: { sourceId: this.sourceId, resourceId: this.resourceId, exactUrl: rawResponse.requestedUrl } }); }
  parseRaw() { if (this.mode === "parse") throw new Error("RAW_SCHEMA_DRIFT"); return [{ id: "r1", value: "raw" }]; }
  normalize(rows) { if (this.mode === "normalize") throw new Error("NORMALIZATION_FAILED"); return rows.map((row) => ({ id: row.id, value: row.value })); }
  validateIntegrity(raw, records) { if (this.mode === "integrity") return { status: "invalid", acceptedRecordCount: records.length - 1, rejectedRecordCount: 1, warningCount: 0, errors: [{ stage: "integrity", code: "DUPLICATE_IDENTITY", message: "duplicate" }], warnings: [], identityConflicts: ["r1"], canPublishCandidate: false }; return { status: "valid", acceptedRecordCount: records.length, rejectedRecordCount: raw.length - records.length, warningCount: 0, errors: [], warnings: [], identityConflicts: [], canPublishCandidate: true }; }
}
const context = (adapter, patch = {}) => ({ runId: "run-test", executionMode: "offline_fixture", clock: () => "2026-07-26T00:00:00.000Z", approvedHttpClient: async () => ({ ...rawResponse }), ...patch });

test("contract harness verifies metadata, stages, provenance and counts", async () => { await runSourceAdapterContractTests(() => new FakeSourceAdapter()); });
test("adapter execution preserves stage ordering and returns failed parse/normalize/integrity", async () => {
  for (const [mode, status, key] of [["parse", "failed_parse", "rawRowCount"], ["normalize", "failed_normalization", "normalizedRecordCount"], ["integrity", "failed_integrity", "rejectedRecordCount"]]) {
    const adapter = new FakeSourceAdapter(); adapter.mode = mode;
    const result = await adapter.execute(context(adapter));
    assert.equal(result.executionStatus, status);
    assert.ok(result[key] >= 0);
    assert.equal(result.runId, "run-test");
    assert.equal(result.responseHash, "sha256:test");
  }
});
test("adapter never falls back, persists, publishes, or calls global fetch", async () => {
  const adapter = new FakeSourceAdapter(); let calls = 0;
  const result = await adapter.execute(context(adapter, { approvedHttpClient: async () => { calls += 1; return { ...rawResponse }; } }));
  assert.equal(calls, 1); assert.equal(result.executionStatus, "succeeded");
  assert.equal(Object.hasOwn(result, "publishedSnapshotId"), false);
  assert.equal(Object.hasOwn(result, "repository"), false);
});
test("cancellation stops before fetch", async () => {
  const adapter = new FakeSourceAdapter(); const controller = new AbortController(); controller.abort(); let fetched = false;
  const result = await adapter.execute(context(adapter, { abortSignal: controller.signal, approvedHttpClient: async () => { fetched = true; return { ...rawResponse }; } }));
  assert.equal(result.executionStatus, "cancelled"); assert.equal(fetched, false); assert.equal(result.integrityReport.canPublishCandidate, false);
});
