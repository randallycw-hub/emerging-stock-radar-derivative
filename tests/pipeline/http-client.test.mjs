import assert from "node:assert/strict";
import test from "node:test";
import { ApprovedHttpError, fetchApprovedResource } from "../../lib/pipeline/http-client.ts";
import { assertExactResourceUrl, getApprovedResource } from "../../lib/pipeline/source-registry.ts";

const resource = getApprovedResource("28567", "28567-csv");
const response = (body = "a,b\n1,2", status = 200, type = "text/csv; charset=utf-8", url = resource.exactUrl) => new Response(body, { status, headers: { "content-type": type }, url });
const transportOf = (...items) => async () => items.shift();

test("approval gate exposes only verified exact CSV resources", () => {
  assert.equal(resource.approvalStatus, "VERIFIED_FOR_IMPLEMENTATION");
  assert.throws(() => getApprovedResource("28567", "28567-openapi"), /RESOURCE_NOT_APPROVED/);
  assert.throws(() => assertExactResourceUrl(resource, "https://mopsfin.twse.com.tw.evil.test/opendata/t187ap03_P.csv"), /URL_NOT_ALLOWED/);
  assert.throws(() => assertExactResourceUrl(resource, `${resource.exactUrl}&evil=1`), /URL_NOT_ALLOWED/);
  assert.throws(() => assertExactResourceUrl(resource, "https://mopsfin.twse.com.tw/opendata/../secret"), /URL_NOT_ALLOWED/);
});

test("client returns raw bytes and deterministic response metadata", async () => {
  const result = await fetchApprovedResource({ resource, transport: transportOf(response()), now: () => "2026-07-26T00:00:00.000Z" });
  assert.equal(result.httpStatus, 200);
  assert.equal(result.contentType, "text/csv");
  assert.equal(result.fetchedAt, "2026-07-26T00:00:00.000Z");
  assert.match(result.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.attemptCount, 1);
});

test("client rejects status, content type, empty, oversized and redirect responses", async () => {
  await assert.rejects(fetchApprovedResource({ resource, transport: transportOf(response("error", 404)) }), (error) => error instanceof ApprovedHttpError && error.code === "HTTP_STATUS_ERROR");
  await assert.rejects(fetchApprovedResource({ resource, transport: transportOf(response("<html>", 200, "text/html")) }), (error) => error.code === "CONTENT_TYPE_MISMATCH");
  await assert.rejects(fetchApprovedResource({ resource, transport: transportOf(response("", 200)) }), (error) => error.code === "EMPTY_RESPONSE");
  await assert.rejects(fetchApprovedResource({ resource, maxResponseBytes: 1, transport: transportOf(response()) }), (error) => error.code === "RESPONSE_TOO_LARGE");
  const redirected = response();
  Object.defineProperty(redirected, "url", { value: "https://evil.test/file" });
  await assert.rejects(fetchApprovedResource({ resource, transport: transportOf(redirected) }), (error) => error.code === "REDIRECT_NOT_ALLOWED");
});

test("retry repeats only the exact resource for timeout/network and 429/5xx", async () => {
  let calls = 0;
  const transport = async (url) => { calls += 1; assert.equal(url, resource.exactUrl); if (calls === 1) throw new Error("offline"); return response(); };
  const result = await fetchApprovedResource({ resource, transport, retryPolicy: { maxAttempts: 2, backoffMs: 0, sleep: async () => {} } });
  assert.equal(result.attemptCount, 2);
  assert.equal(calls, 2);
  const recovered = await fetchApprovedResource({ resource, transport: transportOf(response("busy", 429), response()), retryPolicy: { maxAttempts: 2, backoffMs: 0, sleep: async () => {} } });
  assert.equal(recovered.attemptCount, 2);
});

test("suspended or unapproved resources cannot be fetched", async () => {
  await assert.rejects(fetchApprovedResource({ resource: { ...resource, approvalStatus: "SUSPENDED" }, transport: transportOf(response()) }), (error) => error.code === "RESOURCE_NOT_APPROVED");
});

test("caller content-type override can only narrow the registry allowlist", async () => {
  await assert.rejects(fetchApprovedResource({ resource, expectedContentTypes: ["text/html"], transport: transportOf(response("<html>", 200, "text/html")) }), (error) => error.code === "CONTENT_TYPE_MISMATCH");
  const result = await fetchApprovedResource({ resource, expectedContentTypes: ["text/csv"], transport: transportOf(response()) });
  assert.equal(result.contentType, "text/csv");
});
