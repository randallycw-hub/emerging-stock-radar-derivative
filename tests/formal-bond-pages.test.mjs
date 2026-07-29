import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("可轉債表格包含完整交易欄位與資料日期", async () => {
  const html = await readFile(new URL("../app/dev-preview/bonds/page.tsx", import.meta.url), "utf8");
  for (const label of ["票面利率", "conversionPrice", "流通餘額", "displayLabels.close", "displayLabels.conversionValue", "displayLabels.premium", "資料日期"]) assert.match(html, new RegExp(label));
  assert.match(html, /DataFreshness/);
  assert.match(html, /MarketFilterPanel/);
});
