import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("V5.1 homepage preserves static content and wires accessible ranking tabs", async () => {
  const source = await readFile(new URL("../static-showcase/assets/home-page.js", import.meta.url), "utf8");
  assert.match(source, /bindV51HomeInteractions/);
  assert.match(source, /data-home-v51-ranking-tab/);
  assert.match(source, /marketResearchUrl/);
  assert.match(source, /searchIndexUrl/);
});
