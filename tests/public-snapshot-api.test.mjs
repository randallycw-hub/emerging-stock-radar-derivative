import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("hosting config declares the logical D1 runtime binding", async () => {
  const source = await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8");
  const config = JSON.parse(source);
  assert.equal(config.d1, "PIPELINE_DB");
});

test("public snapshot route uses the published read model and D1 binding", async () => {
  const source = await readFile(new URL("../app/api/public-snapshot/route.ts", import.meta.url), "utf8");
  assert.match(source, /cloudflare:workers/);
  assert.match(source, /PIPELINE_DB/);
  assert.match(source, /publicSnapshotResponse/);
  assert.doesNotMatch(source, /getTrackerData|fetch\(/);
});

test("public snapshot HTTP boundary exposes explicit unavailable semantics", async () => {
  const source = await readFile(new URL("../lib/pipeline/read-models/public-snapshot-http.ts", import.meta.url), "utf8");
  assert.match(source, /D1_BINDING_UNAVAILABLE/);
  assert.match(source, /status: 503/);
  assert.match(source, /Cache-Control/);
});
