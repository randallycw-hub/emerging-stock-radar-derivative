import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("V5.2 homepage preserves static content, ranking tabs, and delegates search to the global header", async () => {
  const [source, shell] = await Promise.all([
    readFile(new URL("../static-showcase/assets/home-page.js", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/site-shell.js", import.meta.url), "utf8"),
  ]);
  assert.match(source, /bindV51HomeInteractions/);
  assert.match(source, /data-home-v51-ranking-tab/);
  assert.match(source, /marketResearchUrl/);
  assert.match(shell, /import\("\.\/site-search\.js"\)/);
});
