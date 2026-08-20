import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("可轉債表格包含完整交易欄位與資料日期", async () => {
  const html = await readFile(new URL("../app/dev-preview/bonds/page.tsx", import.meta.url), "utf8");
  for (const label of ["票面利率", "conversionPrice", "流通餘額", "displayLabels.close", "displayLabels.conversionValue", "displayLabels.premium", "資料日期"]) assert.match(html, new RegExp(label));
  assert.match(html, /DataFreshness/);
  assert.match(html, /MarketFilterPanel/);
});

test("靜態可轉債頁維持十個公開市場欄位與封存切換", async () => {
  const html = await readFile(new URL("../static-showcase/bonds.html", import.meta.url), "utf8");
  for (const label of ["CB 代碼／名稱", "CB 收盤", "轉換價值", "轉換溢價率", "標的股收盤", "目前轉換價", "流通餘額比例", "下一事件", "資料日期", "資料品質"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /id="bond-archive-toggle"/);
  assert.match(html, /id="bond-clear-filter"/);
});
