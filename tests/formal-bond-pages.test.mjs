import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("可轉債表格包含完整交易欄位與資料日期", async () => {
  const html = await readFile(new URL("../app/dev-preview/bonds/page.tsx", import.meta.url), "utf8");
  for (const label of ["票面利率", "轉換價格", "流通餘額", "收盤價", "轉換價值", "溢價率", "資料日期"]) assert.match(html, new RegExp(label));
  assert.match(html, /DataFreshness/);
  assert.match(html, /MarketFilterPanel/);
});
