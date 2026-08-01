import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("formal homepage uses the approved public snapshot shell", async () => {
  const source = await readFile(new URL("../app/Homepage.tsx", import.meta.url), "utf8");
  assert.match(source, /PUBLIC SNAPSHOT/i);
  assert.match(source, /Cloud Dancer/);
  assert.match(source, /Transformative Teal/);
  assert.match(source, new RegExp("/radar"));
  assert.match(source, new RegExp("/ipo"));
  assert.match(source, /尚未發布|尚未發布/);
});

test("homepage metadata is canonical at root and routes to the formal site", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /canonical: "\/"/);
  assert.match(source, /redirect\("\/market-site\/index\.html"\)/);
});
