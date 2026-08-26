import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("興櫃總表呈現前日均價、今日有交易與低流動性公開欄位", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../static-showcase/emerging.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/emerging-page.js", import.meta.url), "utf8"),
  ]);
  for (const label of ["今日有交易", "低流動性", "前日成交均價（盤後）"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(script, /transactionVolume/);
  assert.match(script, /previousAveragePrice/);
  assert.doesNotMatch(html + script, /來源 ID|缺漏原因|目前無核准公開資料／待確認/);
});
