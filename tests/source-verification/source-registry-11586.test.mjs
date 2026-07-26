import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registryText = () => readFile(new URL("../../docs/data-source-registry.md", import.meta.url), "utf8");
const decisionText = () => readFile(new URL("../../docs/source-verification/11586-resource-decision.md", import.meta.url), "utf8");

test("11586 registry amendment keeps dataset design stage and approves CSV resource only", async () => {
  const registry = await registryText();
  assert.match(registry, /Dataset 11586 status:\s*`APPROVED_FOR_V1_DESIGN`/);
  assert.match(registry, /CSV resource status:\s*`VERIFIED_FOR_IMPLEMENTATION`/);
  assert.match(registry, /primary implementation resource/);
});

test("11586 registry amendment suspends OpenAPI and forbids fallback", async () => {
  const registry = await registryText();
  assert.match(registry, /OpenAPI resource status:\s*`SUSPENDED`/);
  assert.match(registry, /OpenAPI[\s\S]*fallback[\s\S]*forbidden/i);
  assert.match(registry, /Swagger.*schema evidence/i);
});

test("11586 amendment retains evidence links and does not approve production", async () => {
  const [registry, decision] = await Promise.all([registryText(), decisionText()]);
  assert.match(registry, /11586-resource-decision\.md/);
  assert.match(registry, /11586-evidence\.md/);
  assert.doesNotMatch(registry, /11586[\s\S]{0,600}APPROVED_FOR_PRODUCTION/);
  assert.match(decision, /Dataset-level[：:][\s\S]*APPROVED_FOR_V1_DESIGN/);
});
