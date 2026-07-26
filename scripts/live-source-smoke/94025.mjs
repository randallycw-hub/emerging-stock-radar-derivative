import { fetchApprovedResource } from "../../lib/pipeline/http-client.ts";
import { create94025CsvAdapter } from "../../lib/pipeline/adapters/94025-csv.ts";

const adapter = create94025CsvAdapter();
const now = () => new Date().toISOString();
const result = await adapter.execute({ runId: `live-smoke-${Date.now()}`, executionMode: "live_smoke", clock: now, approvedHttpClient: (request) => fetchApprovedResource(request) });
const report = { checkedAt: now(), sourceId: result.sourceId, resourceId: result.resourceId, executionStatus: result.executionStatus, fetchedAt: result.fetchedAt, responseHash: result.responseHash, responseBytes: result.responseBytes, rawRowCount: result.rawRowCount, normalizedRecordCount: result.normalizedRecordCount, integrity: result.integrityReport };
console.log(JSON.stringify(report, null, 2));
process.exitCode = result.executionStatus === "succeeded" ? 0 : 1;
