import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const decision = () => readFile(new URL("../../docs/source-verification/28567-resource-decision.md", import.meta.url), "utf8");

test("28567 decision approves CSV independently and keeps dataset at design stage", async () => {
  const text = await decision();
  assert.match(text, /CSV resource[\s\S]*VERIFIED_FOR_IMPLEMENTATION/);
  assert.match(text, /Dataset 28567[\s\S]*APPROVED_FOR_V1_DESIGN/);
  assert.match(text, /sole future primary resource/i);
  assert.match(text, /not a complete current emerging-company roster/i);
});

test("28567 decision suspends malformed OpenAPI without fallback", async () => {
  const text = await decision();
  assert.match(text, /OpenAPI resource[\s\S]*SUSPENDED/);
  assert.match(text, /Strict JSON parse: failed/);
  assert.match(text, /no ingest or fallback/i);
  assert.match(text, /Swagger\/OAS proves endpoint and schema documentation only/);
});
