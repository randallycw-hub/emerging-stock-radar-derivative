import test from "node:test";
import assert from "node:assert/strict";
import { createRelaySourceResponse } from "../../lib/pipeline/orchestration/relay-contract.ts";

const valid = {
  bodyBase64: Buffer.from("header\nvalue\n", "utf8").toString("base64"),
  sourceUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv",
  fetchedAt: "2026-07-28T11:00:00.000Z",
};

test("accepts an exact approved source and computes its response hash", async () => {
  const response = await createRelaySourceResponse("94025", valid);
  assert.equal(response.sourceId, "94025");
  assert.equal(response.resourceId, "94025-csv");
  assert.equal(response.contentType, "text/csv");
  assert.equal(new TextDecoder().decode(response.body), "header\nvalue\n");
  assert.match(response.sha256, /^sha256:[0-9a-f]{64}$/);
});

test("rejects a payload whose URL is not the exact approved URL", async () => {
  await assert.rejects(() => createRelaySourceResponse("94025", { ...valid, sourceUrl: "https://example.com/data.csv" }), /URL_NOT_ALLOWED/);
});

test("rejects an oversized relay payload", async () => {
  const bodyBase64 = Buffer.alloc(8_000_001, 65).toString("base64");
  await assert.rejects(() => createRelaySourceResponse("94025", { ...valid, bodyBase64 }), /RESPONSE_TOO_LARGE/);
});
