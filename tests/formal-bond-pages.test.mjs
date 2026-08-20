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

test("靜態可轉債詳情保留公開資料條件檢核與行動版摺疊介面", async () => {
  const [html, detail, css] = await Promise.all([
    readFile(new URL("../static-showcase/bonds.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/bond-detail-page.js", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/app.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /data-detail-url-param="bond"/);
  for (const label of ["股債相對條件", "到期賣回條件", "現股相對觀察", "等同現股條件", "套利條件", "動態避險條件"]) assert.match(detail, new RegExp(label));
  assert.match(detail, /本頁為公開資料的教育性條件檢核，不構成投資建議或交易指令。/);
  assert.match(detail, /目前無核准公開資料／待確認/);
  assert.match(detail, /https:/);
  assert.match(css, /\.detail-mobile-area/);
  assert.match(css, /\.detail-tabs/);
});
