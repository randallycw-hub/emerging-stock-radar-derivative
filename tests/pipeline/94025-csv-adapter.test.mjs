import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { create94025CsvAdapter } from "../../lib/pipeline/adapters/94025-csv.ts";
import { runSourceAdapterContractTests } from "../../lib/pipeline/adapters/contract-harness.ts";

const dir = new URL("../fixtures/source-verification/94025/", import.meta.url);
const fixture = await readFile(new URL("csv-minimal.csv", dir));
const response = { sourceId: "94025", resourceId: "94025-csv", requestedUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv", finalUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv", fetchedAt: "2026-07-26T00:00:00.000Z", httpStatus: 200, contentType: "text/csv", responseBytes: fixture.byteLength, sha256: "sha256:fixture" , body: new Uint8Array(fixture), attemptCount: 1 };
const context = (patch = {}) => ({ runId: "94025-run", executionMode: "offline_fixture", clock: () => "2026-07-26T00:00:00.000Z", approvedHttpClient: async () => ({ ...response }), ...patch });

test("94025 adapter satisfies shared adapter contract", async () => { await runSourceAdapterContractTests(() => create94025CsvAdapter(response)); });

test("94025 adapter parses fixture, normalizes revenue and preserves provenance", async () => {
  const adapter = create94025CsvAdapter();
  const result = await adapter.execute(context());
  assert.equal(adapter.sourceId, "94025"); assert.equal(adapter.resourceId, "94025-csv");
  assert.equal(result.executionStatus, "succeeded");
  assert.equal(result.records.length, 3); assert.equal(result.rawRowCount, 3);
  assert.equal(result.records[0].revenueUnit, "仟元");
  assert.equal(result.responseHash, "sha256:fixture"); assert.equal(result.fetchedAt, "2026-07-26T00:00:00.000Z");
});

test("94025 adapter rejects wrong content, malformed CSV and duplicate identities", async () => {
  const wrongType = create94025CsvAdapter();
  const wrong = await wrongType.execute(context({ approvedHttpClient: async () => ({ ...response, contentType: "text/html" }) }));
  assert.equal(wrong.executionStatus, "failed_parse"); assert.equal(wrong.diagnostics[0].code, "CONTENT_TYPE_MISMATCH");
  const malformed = create94025CsvAdapter();
  const bad = await malformed.execute(context({ approvedHttpClient: async () => ({ ...response, body: new TextEncoder().encode("bad,header\n1,2") }) }));
  assert.equal(bad.executionStatus, "failed_parse");
  const duplicate = create94025CsvAdapter();
  const duplicateBody = Buffer.concat([fixture, fixture.subarray(fixture.indexOf(10) + 1)]);
  const dup = await duplicate.execute(context({ approvedHttpClient: async () => ({ ...response, body: new Uint8Array(duplicateBody) }) }));
  assert.equal(dup.executionStatus, "failed_parse");
});

test("94025 adapter never selects OpenAPI, fallback, repository or published snapshot", async () => {
  const requested = [];
  const adapter = create94025CsvAdapter();
  const result = await adapter.execute(context({ approvedHttpClient: async ({ resource }) => { requested.push(resource.exactUrl); return { ...response }; } }));
  assert.deepEqual(requested, ["https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv"]);
  assert.equal(Object.hasOwn(result, "repository"), false); assert.equal(Object.hasOwn(result, "publishedSnapshotId"), false);
});
