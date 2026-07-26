import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registry = () => readFile(new URL("../../docs/data-source-registry.md", import.meta.url), "utf8");

test("28567 registry amendment separates dataset and resource approval", async () => {
  const text = await registry();
  assert.match(text, /Dataset 28567 status:\s*`APPROVED_FOR_V1_DESIGN`/);
  assert.match(text, /CSV resource-level status:\s*`VERIFIED_FOR_IMPLEMENTATION`/);
  assert.match(text, /Primary implementation resource:[\s\S]*t187ap03_P\.csv/);
  assert.match(text, /sole approved primary resource candidate/i);
});

test("28567 registry amendment suspends OpenAPI and forbids fallback", async () => {
  const text = await registry();
  assert.match(text, /OpenAPI[\s\S]*`SUSPENDED`[\s\S]*`NOT_APPROVED_FOR_DATA_INGESTION`/);
  assert.match(text, /must not be used for ingestion, fallback, failover/i);
  assert.match(text, /Swagger\/OAS is limited to endpoint-existence, operation, schema/);
});

test("28567 registry amendment records enrichment restrictions and evidence", async () => {
  const text = await registry();
  assert.match(text, /94025 coverage set/);
  assert.match(text, /ambiguous company codes[\s\S]*never auto-merge/i);
  assert.match(text, /Do not infer `isEmerging`/);
  assert.match(text, /28567-evidence\.md/);
  assert.match(text, /28567-resource-decision\.md/);
  assert.doesNotMatch(text, /28567[\s\S]{0,500}APPROVED_FOR_PRODUCTION/);
});
