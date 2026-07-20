import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public read-only data APIs expose CORS headers", async () => {
  const helper = await readFile(new URL("../app/api/_cors.ts", import.meta.url), "utf8");
  assert.match(helper, /Access-Control-Allow-Origin["']:\s*["']\*["']/);

  for (const route of ["tracker", "company"]) {
    const source = await readFile(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /publicApiHeaders/);
    assert.match(source, /export const OPTIONS = publicApiOptions/);
  }
});
