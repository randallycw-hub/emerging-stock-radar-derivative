import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("可轉債表格包含完整交易欄位與資料日期", async () => {
  const html = await readFile(new URL("../app/dev-preview/bonds/page.tsx", import.meta.url), "utf8");
  for (const label of ["票面利率", "conversionPrice", "流通餘額", "displayLabels.close", "displayLabels.conversionValue", "displayLabels.premium", "資料日期"]) assert.match(html, new RegExp(label));
  assert.match(html, /DataFreshness/);
  assert.match(html, /MarketFilterPanel/);
});

test("靜態可轉債頁維持九個公開市場欄位與封存切換", async () => {
  const html = await readFile(new URL("../static-showcase/bonds.html", import.meta.url), "utf8");
  for (const label of ["CB 代碼／名稱", "CB 收盤", "轉換價值", "轉換溢價率", "標的股收盤", "目前轉換價", "流通餘額比例", "下一事件", "資料日期"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /資料品質|待補／待確認/);
  assert.match(html, /id="bond-archive-toggle"/);
  assert.match(html, /id="bond-clear-filter"/);
});

test("靜態可轉債詳情保留公開市場資訊與行動版摺疊介面", async () => {
  const [html, detail, css] = await Promise.all([
    readFile(new URL("../static-showcase/bonds.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/bond-detail-page.js", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/app.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /data-detail-url-param="bond"/);
  for (const label of ["可轉債重點", "K 線圖", "債券條款", "資料來源與授權範圍", "事件時間軸"]) assert.match(detail, new RegExp(label));
  assert.match(detail, /本頁為公開資料的教育性條件檢核，不構成投資建議或交易指令。/);
  assert.doesNotMatch(detail, /目前無核准公開資料／待確認|來源 ID|缺漏原因|資料狀態矩陣/);
  assert.match(detail, /https:/);
  assert.match(css, /\.detail-mobile-area/);
  assert.match(css, /\.detail-tabs/);
});

test("靜態可轉債公開內容維持中性且不產生交易指令", async () => {
  const [html, page, detail] = await Promise.all([
    readFile(new URL("../static-showcase/bonds.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/bonds-page.js", import.meta.url), "utf8"),
    import("../static-showcase/assets/bond-detail-page.js"),
  ]);
  assert.deepEqual(detail.noAdviceViolations(`${html}\n${page}`), []);
  assert.match(html, /僅整理公開資訊，不構成投資建議/);
  assert.doesNotMatch(`${html}\n${page}`, /(?:第三方分數|專有評分|避險比率|建立部位)/);
});

test("公開說明不宣稱工作台呈現尚未發布的 TWSA 承銷公告", async () => {
  const [readme, registry] = await Promise.all([
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/data-source-registry.md", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(readme, /另顯示[^。\n]*TWSA 承銷公告/);
  assert.doesNotMatch(registry, /\| 新 CB 承銷雷達 \|/);
  assert.match(registry, /TWSA[^。\n]*(?:不在|尚未)[^。\n]*(?:公開工作台|UI)[^。\n]*(?:呈現|顯示)/);
});
