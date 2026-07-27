import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { create28567CsvAdapter } from "../../lib/pipeline/adapters/28567-csv.ts";
import { enrich94025CoverageWith28567 } from "../../lib/pipeline/enrichment/28567-join.ts";

const fixture = await readFile(new URL("../fixtures/source-verification/28567/csv-minimal.csv", import.meta.url));
const response = { sourceId: "28567", resourceId: "28567-csv", requestedUrl: "https://mopsfin.twse.com.tw/opendata/t187ap03_P.csv", finalUrl: "https://mopsfin.twse.com.tw/opendata/t187ap03_P.csv", fetchedAt: "2026-07-26T00:00:00.000Z", httpStatus: 200, contentType: "text/csv", responseBytes: fixture.byteLength, sha256: "sha256:28567", body: new Uint8Array(fixture), attemptCount: 1 };
const context = (patch = {}) => ({ runId: "28567-run", executionMode: "offline_fixture", clock: () => "2026-07-26T00:00:00.000Z", approvedHttpClient: async () => ({ ...response }), ...patch });
const coverage = (codes = ["SYN28567"]) => codes.map((companyCode) => ({ companyCode, companyName: "Sample Public Co.", industry: "Technology", revenueYearMonth: "11506", sourceDatasetId: "94025", sourceId: "94025", resourceId: "94025-csv", sourceRecordIdentity: `94025:${companyCode}:11506`, fetchedAt: "2026-07-26T00:00:00.000Z", responseHash: "sha256:94025" }));

test("28567 adapter fetches only approved CSV and normalizes fixture", async () => {
  const adapter = create28567CsvAdapter();
  const result = await adapter.execute(context());
  assert.equal(result.executionStatus, "succeeded"); assert.equal(result.records[0].companyCode, "SYN28567"); assert.equal(result.records[0].sourceRecordId, "SYN28567:12345678");
});

test("exact companyCode join produces matched and preserves provenance", async () => {
  const adapter = create28567CsvAdapter(); const result = await adapter.execute(context());
  const enriched = enrich94025CoverageWith28567(coverage(), result, { sourceCoverageSnapshotId: "snap-1", createdAt: "2026-07-26T00:00:01.000Z" });
  assert.equal(enriched.matchedCount, 1); assert.equal(enriched.unmatchedCount, 0); assert.equal(enriched.ambiguousCount, 0); assert.equal(enriched.records[0].matchStatus, "matched"); assert.equal(enriched.records[0].coverage.companyCode, "SYN28567"); assert.equal(enriched.source28567ResponseHash, "sha256:28567");
});

test("unmatched coverage is retained without invented profile", async () => {
  const result = await create28567CsvAdapter().execute(context()); const enriched = enrich94025CoverageWith28567(coverage(["MISSING"]), result, { sourceCoverageSnapshotId: "snap-1", createdAt: "2026-07-26T00:00:01.000Z" });
  assert.equal(enriched.unmatchedCount, 1); assert.equal(enriched.records[0].profile, null); assert.deepEqual(enriched.unmatchedCompanyCodes, ["MISSING"]);
});

test("ambiguous duplicate profiles are never joined", async () => {
  const result = await create28567CsvAdapter().execute(context()); const duplicate = { ...result, records: [...result.records, { ...result.records[0], sourceRecordId: "SYN28567:99999999", taxId: "99999999" }] };
  const enriched = enrich94025CoverageWith28567(coverage(), duplicate, { sourceCoverageSnapshotId: "snap-1", createdAt: "2026-07-26T00:00:01.000Z" });
  assert.equal(enriched.ambiguousCount, 1); assert.equal(enriched.records[0].profile, null); assert.deepEqual(enriched.ambiguousCompanyCodes, ["SYN28567"]);
});

test("enrichment has no market status or recommendation surface", async () => {
  const result = await create28567CsvAdapter().execute(context()); const enriched = enrich94025CoverageWith28567(coverage(), result, { sourceCoverageSnapshotId: "snap-1", createdAt: "2026-07-26T00:00:01.000Z" });
  assert.equal(Object.hasOwn(enriched.records[0], "isEmerging"), false); assert.equal(Object.hasOwn(enriched.records[0], "marketStatus"), false); assert.equal(Object.hasOwn(enriched.records[0], "recommendation"), false);
});
