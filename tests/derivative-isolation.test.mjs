import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("uses the new brand and preserves the assigned hosting project", async () => {
  const [hosting, layout, sitemap, robots] = await Promise.all([
    read(".openai/hosting.json"),
    read("app/layout.tsx"),
    read("app/sitemap.ts"),
    read("app/robots.ts"),
  ]);
  const config = JSON.parse(hosting);
  assert.equal(config.project_id, "appgprj_6a5dcfc4316881918b5c141048ff5fd2");
  assert.match(layout, /興債觀測網/);
  assert.match(layout, /興櫃公司、可轉債與上市櫃進度資訊/);
  assert.doesNotMatch(`${layout}${sitemap}${robots}`, /emergingradar\.tw/);
});
