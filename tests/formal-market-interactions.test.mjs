import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("formal market rows expose the company profile action", async () => {
  const source = await readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8");
  assert.match(source, /function MarketView\(\{ tracker, loading, openProfile \}/);
  assert.match(source, /onClick=\{\(\) => openProfile\(row\.code\)\}/);
  assert.match(source, /<MarketView tracker=\{tracker\} loading=\{loading\} openProfile=\{openProfile\}/);
});
