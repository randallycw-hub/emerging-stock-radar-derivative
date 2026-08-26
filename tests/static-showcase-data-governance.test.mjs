import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("資料中心只呈現公開可理解的更新與檢核摘要", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../static-showcase/data-center.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/data-center-page.js", import.meta.url), "utf8"),
  ]);
  for (const label of ["最近更新", "公開資料檢核", "資料範圍"]) assert.match(html, new RegExp(label));
  assert.match(script, /generatedAt/);
  assert.doesNotMatch(html + script, /來源 ID|缺漏原因|response_hash|sha256/);
});

test("方法論定義來源優先、衝突處理與資料刷新邊界", async () => {
  const html = await readFile(new URL("../static-showcase/methodology.html", import.meta.url), "utf8");
  for (const label of ["來源優先順序", "資料衝突處理", "更新時程", "公開資料邊界"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /來源 ID|缺漏原因|sha256/);
});
